/**
 * Zustand store for chat history management
 * Provides instant loading with background Redis synchronization
 */

import React from 'react';
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { StoredChat } from '@/lib/redis';
import type { UIMessage } from 'ai';
import {
  getCachedChatList,
  cacheChatList,
  getCachedChat,
  cacheChat,
  updateCachedChatInList,
  removeCachedChat,
  validateAndMergeWithRedis,
  isCacheValid,
  setupCrossTabSync,
  cleanupOldChats,
} from '@/lib/chat-storage';

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

interface ChatState {
  // Chat list state
  chats: StoredChat[];
  isLoadingChats: boolean;

  // Current chat state
  currentChatId: string | null;
  currentMessages: UIMessage[];
  isLoadingMessages: boolean;

  // Sync state
  syncStatus: SyncStatus;
  lastSyncTime: number | null;
  syncError: string | null;

  // Actions
  loadChatsFromCache: () => void;
  syncChatsWithRedis: () => Promise<void>;
  loadChatMessages: (chatId: string) => Promise<void>;
  updateChat: (chat: Partial<StoredChat> & { id: string }) => void;
  addChat: (chat: StoredChat) => void;
  deleteChat: (chatId: string) => Promise<void>;
  setCurrentChatId: (chatId: string | null) => void;
  updateCurrentMessages: (messages: UIMessage[]) => void;
  clearAllChats: () => void;

  // Internal helpers
  _setChats: (chats: StoredChat[]) => void;
  _setSyncStatus: (status: SyncStatus, error?: string) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // Initial state
      chats: [],
      isLoadingChats: true,
      currentChatId: null,
      currentMessages: [],
      isLoadingMessages: false,
      syncStatus: 'idle',
      lastSyncTime: null,
      syncError: null,

      // Load chats from local storage immediately (instant)
      loadChatsFromCache: () => {
        try {
          // Proactively cleanup old chats on load to prevent quota issues
          cleanupOldChats();

          const cachedChats = getCachedChatList();
          set({
            chats: cachedChats,
            isLoadingChats: false,
          });
        } catch (error) {
          console.error('Failed to load chats from cache:', error);
          set({ isLoadingChats: false });
        }
      },

      // Background sync with Redis
      syncChatsWithRedis: async () => {
        const { chats: localChats, _setChats, _setSyncStatus } = get();

        _setSyncStatus('syncing');

        try {
          // Fetch from Redis in background
          const response = await fetch('/api/chats');
          if (!response.ok) {
            throw new Error('Failed to fetch chats from Redis');
          }

          const data = await response.json();
          const redisChats = data.chats as StoredChat[];

          // Validate and merge with local cache
          const { merged, hasChanges } = validateAndMergeWithRedis(
            redisChats,
            localChats
          );

          // Update both store and cache if there are changes
          if (hasChanges) {
            _setChats(merged);
            cacheChatList(merged);
          }

          _setSyncStatus('synced');
        } catch (error) {
          console.error('Redis sync error:', error);
          _setSyncStatus('error', error instanceof Error ? error.message : 'Sync failed');
        }
      },

      // Load specific chat messages (with cache-first approach)
      loadChatMessages: async (chatId: string) => {
        set({ isLoadingMessages: true });

        try {
          // Try cache first
          const cachedMessages = getCachedChat(chatId);
          if (cachedMessages) {
            set({
              currentChatId: chatId,
              currentMessages: cachedMessages,
              isLoadingMessages: false,
            });
          }

          // Then fetch from Redis in background to validate
          const response = await fetch(`/api/chat?id=${chatId}`);
          if (!response.ok) {
            throw new Error('Failed to fetch chat messages');
          }

          const data = await response.json();
          const messages = data.messages as UIMessage[];

          // Update if different from cache
          if (JSON.stringify(messages) !== JSON.stringify(cachedMessages)) {
            set({
              currentChatId: chatId,
              currentMessages: messages,
            });
            cacheChat(chatId, messages);
          }

          set({ isLoadingMessages: false });
        } catch (error) {
          console.error('Failed to load chat messages:', error);
          set({ isLoadingMessages: false });
        }
      },

      // Optimistically update a chat
      updateChat: (updatedChat) => {
        const { chats, _setChats } = get();

        // Optimistically update in store
        const updated = chats.map(chat =>
          chat.id === updatedChat.id ? { ...chat, ...updatedChat } : chat
        );

        _setChats(updated);

        // Update cache
        updateCachedChatInList(updatedChat);
      },

      // Add new chat
      addChat: (newChat) => {
        const { chats, _setChats } = get();

        // Add to store
        const updated = [newChat, ...chats];
        _setChats(updated);

        // Update cache
        cacheChatList(updated);
      },

      // Delete chat (optimistic with rollback)
      deleteChat: async (chatId: string) => {
        const { chats, _setChats, currentChatId } = get();

        // Snapshot for rollback
        const previousChats = [...chats];

        try {
          // Optimistically remove from UI
          const filtered = chats.filter(c => c.id !== chatId);
          _setChats(filtered);
          removeCachedChat(chatId);

          // Clear current chat if it's the deleted one
          if (currentChatId === chatId) {
            set({ currentChatId: null, currentMessages: [] });
          }

          // Delete from Redis
          const response = await fetch(`/api/chats?id=${chatId}`, {
            method: 'DELETE',
          });

          if (!response.ok) {
            throw new Error('Failed to delete chat from Redis');
          }
        } catch (error) {
          console.error('Failed to delete chat:', error);

          // Rollback on error
          _setChats(previousChats);
          cacheChatList(previousChats);

          throw error;
        }
      },

      // Set current chat ID
      setCurrentChatId: (chatId: string | null) => {
        set({ currentChatId: chatId });
      },

      // Update current messages (e.g., from useChat hook)
      updateCurrentMessages: (messages: UIMessage[]) => {
        const { currentChatId } = get();

        set({ currentMessages: messages });

        // Cache the updated messages (cacheChat handles size limits internally)
        if (currentChatId && messages.length > 0) {
          try {
            cacheChat(currentChatId, messages);
          } catch {
            // Silently fail - caching is optional for UX, not critical
            console.debug('Failed to cache messages, will fetch from Redis on reload');
          }
        }
      },

      // Clear all chats
      clearAllChats: () => {
        set({
          chats: [],
          currentChatId: null,
          currentMessages: [],
          syncStatus: 'idle',
          lastSyncTime: null,
        });
      },

      // Internal: Set chats and sort by updatedAt
      _setChats: (chats: StoredChat[]) => {
        const sorted = [...chats].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        );
        set({ chats: sorted });
      },

      // Internal: Set sync status
      _setSyncStatus: (status: SyncStatus, error?: string) => {
        set({
          syncStatus: status,
          lastSyncTime: status === 'synced' ? Date.now() : get().lastSyncTime,
          syncError: error || null,
        });
      },
    }),
    {
      name: 'trados-chat-store',
      // Only persist essential state (not loading states)
      partialize: (state) => ({
        currentChatId: state.currentChatId,
        lastSyncTime: state.lastSyncTime,
      }),
      storage: createJSONStorage(() => sessionStorage),
    }
  )
);

// Setup cross-tab synchronization
if (typeof window !== 'undefined') {
  setupCrossTabSync(() => {
    // Reload from cache when another tab makes changes
    const store = useChatStore.getState();
    store.loadChatsFromCache();
  });
}

/**
 * Hook for initializing the chat store on mount
 */
export function useInitializeChatStore() {
  const loadChatsFromCache = useChatStore(state => state.loadChatsFromCache);
  const syncChatsWithRedis = useChatStore(state => state.syncChatsWithRedis);
  const lastSyncTime = useChatStore(state => state.lastSyncTime);

  // Load from cache immediately on mount
  React.useEffect(() => {
    loadChatsFromCache();

    // Then sync with Redis in background
    const syncTimeout = setTimeout(() => {
      syncChatsWithRedis();
    }, 100); // Small delay to let cache load first

    return () => clearTimeout(syncTimeout);
  }, [loadChatsFromCache, syncChatsWithRedis]);

  // Periodic background sync (every 30 seconds if cache is valid)
  React.useEffect(() => {
    if (!isCacheValid()) return;

    const interval = setInterval(() => {
      syncChatsWithRedis();
    }, 30000); // 30 seconds

    return () => clearInterval(interval);
  }, [syncChatsWithRedis, lastSyncTime]);
}

// Export selectors for optimized re-renders
export const chatSelectors = {
  chats: (state: ChatState) => state.chats,
  isLoadingChats: (state: ChatState) => state.isLoadingChats,
  currentMessages: (state: ChatState) => state.currentMessages,
  syncStatus: (state: ChatState) => state.syncStatus,
  currentChatId: (state: ChatState) => state.currentChatId,
};

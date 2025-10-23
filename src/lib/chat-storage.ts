/**
 * Local Storage utilities for chat history caching
 * Provides instant loading with background Redis synchronization
 */

import type { StoredChat } from './redis';
import type { UIMessage } from 'ai';

const STORAGE_KEYS = {
  CHAT_LIST: 'trados_chat_list',
  CHAT_PREFIX: 'trados_chat_',
  LAST_SYNC: 'trados_last_sync',
  SYNC_VERSION: 'trados_sync_version',
} as const;

const SYNC_VERSION = '1.0.0'; // Bump this to invalidate old caches
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
const MAX_CACHED_CHATS = 10; // Only cache the 10 most recent chats
const MAX_MESSAGE_SIZE = 500 * 1024; // 500KB per chat (to avoid quota issues)

interface CacheMetadata {
  version: string;
  lastSync: number;
  chatIds: string[];
}

/**
 * Safe JSON parse with fallback
 */
function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Check if cache is valid and not expired
 */
export function isCacheValid(): boolean {
  try {
    const metadata = getCacheMetadata();
    if (!metadata || metadata.version !== SYNC_VERSION) return false;

    const age = Date.now() - metadata.lastSync;
    return age < CACHE_MAX_AGE;
  } catch {
    return false;
  }
}

/**
 * Get cache metadata
 */
export function getCacheMetadata(): CacheMetadata | null {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.LAST_SYNC);
    return safeParse(data, null);
  } catch {
    return null;
  }
}

/**
 * Update cache metadata
 */
export function updateCacheMetadata(chatIds: string[]): void {
  try {
    const metadata: CacheMetadata = {
      version: SYNC_VERSION,
      lastSync: Date.now(),
      chatIds,
    };
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC, JSON.stringify(metadata));
  } catch (error) {
    console.error('Failed to update cache metadata:', error);
  }
}

/**
 * Get all cached chats (instant, no network call)
 */
export function getCachedChatList(): StoredChat[] {
  try {
    const data = localStorage.getItem(STORAGE_KEYS.CHAT_LIST);
    const chats = safeParse<StoredChat[]>(data, []);

    // Sort by updatedAt descending (most recent first)
    return chats.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch (error) {
    console.error('Failed to get cached chat list:', error);
    return [];
  }
}

/**
 * Cache the full chat list (limited to most recent)
 */
export function cacheChatList(chats: StoredChat[]): void {
  try {
    // Only cache metadata for the most recent chats
    const limited = chats.slice(0, MAX_CACHED_CHATS);
    localStorage.setItem(STORAGE_KEYS.CHAT_LIST, JSON.stringify(limited));
    updateCacheMetadata(limited.map(c => c.id));
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn('Storage quota exceeded when caching chat list, clearing old data');
      cleanupOldChats();
      // Retry with even fewer chats
      try {
        const limited = chats.slice(0, 5);
        localStorage.setItem(STORAGE_KEYS.CHAT_LIST, JSON.stringify(limited));
        updateCacheMetadata(limited.map(c => c.id));
      } catch (retryError) {
        console.error('Failed to cache chat list after cleanup:', retryError);
      }
    } else {
      console.error('Failed to cache chat list:', error);
    }
  }
}

/**
 * Get a specific cached chat's messages
 */
export function getCachedChat(chatId: string): UIMessage[] | null {
  try {
    const key = `${STORAGE_KEYS.CHAT_PREFIX}${chatId}`;
    const data = localStorage.getItem(key);
    return safeParse<UIMessage[] | null>(data, null);
  } catch (error) {
    console.error(`Failed to get cached chat ${chatId}:`, error);
    return null;
  }
}

/**
 * Cache a specific chat's messages with size limits and quota handling
 */
export function cacheChat(chatId: string, messages: UIMessage[]): void {
  try {
    const key = `${STORAGE_KEYS.CHAT_PREFIX}${chatId}`;

    // Strip large file data URLs from messages to save space
    const strippedMessages = messages.map(msg => ({
      ...msg,
      parts: msg.parts.map(part => {
        // Keep text and small files, but remove large file data URLs
        if (part.type === 'file' && part.url && part.url.startsWith('data:')) {
          const dataUrlSize = part.url.length;
          // Keep files under 50KB, strip larger ones
          if (dataUrlSize > 50 * 1024) {
            return {
              ...part,
              url: undefined, // Strip the data URL
              _stripped: true, // Mark as stripped
            };
          }
        }
        return part;
      }),
    }));

    const serialized = JSON.stringify(strippedMessages);

    // Check size before caching
    if (serialized.length > MAX_MESSAGE_SIZE) {
      console.warn(`Chat ${chatId} too large to cache (${(serialized.length / 1024).toFixed(0)}KB), skipping`);
      return;
    }

    localStorage.setItem(key, serialized);
  } catch (error) {
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      console.warn(`Storage quota exceeded, cleaning up old chats...`);
      cleanupOldChats();

      // Retry once after cleanup
      try {
        const key = `${STORAGE_KEYS.CHAT_PREFIX}${chatId}`;
        const strippedMessages = messages.map(msg => ({
          ...msg,
          parts: msg.parts.map(part =>
            part.type === 'file' && part.url?.startsWith('data:')
              ? { ...part, url: undefined, _stripped: true }
              : part
          ),
        }));
        localStorage.setItem(key, JSON.stringify(strippedMessages));
      } catch (retryError) {
        console.error(`Failed to cache chat ${chatId} after cleanup:`, retryError);
      }
    } else {
      console.error(`Failed to cache chat ${chatId}:`, error);
    }
  }
}

/**
 * Update a single chat in the cached list
 */
export function updateCachedChatInList(updatedChat: Partial<StoredChat> & { id: string }): void {
  try {
    const chats = getCachedChatList();
    const index = chats.findIndex(c => c.id === updatedChat.id);

    if (index >= 0) {
      // Update existing chat
      chats[index] = { ...chats[index], ...updatedChat };
    } else {
      // Add new chat
      chats.unshift(updatedChat as StoredChat);
    }

    cacheChatList(chats);
  } catch (error) {
    console.error('Failed to update cached chat:', error);
  }
}

/**
 * Remove a chat from cache
 */
export function removeCachedChat(chatId: string): void {
  try {
    // Remove from chat list
    const chats = getCachedChatList();
    const filtered = chats.filter(c => c.id !== chatId);
    cacheChatList(filtered);

    // Remove individual chat messages
    const key = `${STORAGE_KEYS.CHAT_PREFIX}${chatId}`;
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Failed to remove cached chat ${chatId}:`, error);
  }
}

/**
 * Cleanup old chats to free up storage space (LRU eviction)
 */
export function cleanupOldChats(): void {
  try {
    const chats = getCachedChatList();
    const metadata = getCacheMetadata();

    if (!metadata || chats.length === 0) return;

    // Sort by last updated (oldest first)
    const sorted = [...chats].sort(
      (a, b) => new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
    );

    // Remove oldest chats beyond the limit
    const toRemove = sorted.slice(0, Math.max(sorted.length - MAX_CACHED_CHATS, 5));

    toRemove.forEach(chat => {
      const key = `${STORAGE_KEYS.CHAT_PREFIX}${chat.id}`;
      localStorage.removeItem(key);
    });

    // Update the chat list to only keep recent ones
    const remaining = chats.filter(c => !toRemove.find(r => r.id === c.id));
    cacheChatList(remaining);

    console.log(`Cleaned up ${toRemove.length} old chats from cache`);
  } catch (error) {
    console.error('Failed to cleanup old chats:', error);
  }
}

/**
 * Clear all chat caches (useful for logout or reset)
 */
export function clearAllCaches(): void {
  try {
    const keys = Object.keys(localStorage);
    keys.forEach(key => {
      if (key.startsWith('trados_')) {
        localStorage.removeItem(key);
      }
    });
  } catch (error) {
    console.error('Failed to clear caches:', error);
  }
}

/**
 * Validate and sync cache with Redis data
 * Returns true if cache was updated
 */
export function validateAndMergeWithRedis(
  redisChats: StoredChat[],
  localChats: StoredChat[]
): { merged: StoredChat[]; hasChanges: boolean } {
  try {
    // Create maps for efficient lookup
    const redisMap = new Map(redisChats.map(c => [c.id, c]));
    const localMap = new Map(localChats.map(c => [c.id, c]));

    const merged: StoredChat[] = [];
    let hasChanges = false;

    // Add/update from Redis (source of truth)
    redisChats.forEach(redisChat => {
      const localChat = localMap.get(redisChat.id);

      if (!localChat) {
        // New chat from Redis
        merged.push(redisChat);
        hasChanges = true;
      } else if (new Date(redisChat.updatedAt) > new Date(localChat.updatedAt)) {
        // Redis version is newer
        merged.push(redisChat);
        hasChanges = true;
      } else {
        // Local version is up to date
        merged.push(localChat);
      }
    });

    // Check for chats that exist locally but not in Redis (deleted remotely)
    localChats.forEach(localChat => {
      if (!redisMap.has(localChat.id)) {
        hasChanges = true;
        // Don't add to merged - it was deleted
      }
    });

    return { merged, hasChanges };
  } catch (error) {
    console.error('Failed to validate and merge cache:', error);
    return { merged: redisChats, hasChanges: true };
  }
}

/**
 * Setup cross-tab synchronization listener
 */
export function setupCrossTabSync(onSync: () => void): () => void {
  const handleStorageChange = (e: StorageEvent) => {
    // Only react to changes in our chat storage
    if (e.key?.startsWith('trados_') && e.newValue !== e.oldValue) {
      onSync();
    }
  };

  window.addEventListener('storage', handleStorageChange);

  // Return cleanup function
  return () => {
    window.removeEventListener('storage', handleStorageChange);
  };
}

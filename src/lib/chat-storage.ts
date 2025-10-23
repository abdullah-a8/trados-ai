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
 * Cache the full chat list
 */
export function cacheChatList(chats: StoredChat[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.CHAT_LIST, JSON.stringify(chats));
    updateCacheMetadata(chats.map(c => c.id));
  } catch (error) {
    console.error('Failed to cache chat list:', error);
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
 * Cache a specific chat's messages
 */
export function cacheChat(chatId: string, messages: UIMessage[]): void {
  try {
    const key = `${STORAGE_KEYS.CHAT_PREFIX}${chatId}`;
    localStorage.setItem(key, JSON.stringify(messages));
  } catch (error) {
    console.error(`Failed to cache chat ${chatId}:`, error);
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

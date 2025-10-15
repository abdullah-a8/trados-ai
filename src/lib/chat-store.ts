import { redis, getChatKey, StoredChat } from './redis';
import { UIMessage } from 'ai';
import { nanoid } from 'nanoid';

/**
 * Create a new chat session
 */
export async function createChat(title?: string): Promise<string> {
  const chatId = nanoid();
  const chat: StoredChat = {
    id: chatId,
    title: title || 'New Chat',
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await redis.set(getChatKey(chatId), JSON.stringify(chat));
  return chatId;
}

/**
 * Load chat messages by chat ID
 */
export async function loadChat(chatId: string): Promise<UIMessage[]> {
  try {
    const data = await redis.get(getChatKey(chatId));
    if (!data) return [];

    // Redis might return an object directly or a string
    let chat: StoredChat;
    if (typeof data === 'string') {
      chat = JSON.parse(data);
    } else {
      chat = data as StoredChat;
    }

    return chat.messages || [];
  } catch (error) {
    console.error('Error loading chat:', error);
    return [];
  }
}

/**
 * Save chat messages
 */
export async function saveChat(chatId: string, messages: UIMessage[]): Promise<void> {
  try {
    // Load existing chat or create new
    let chat: StoredChat;
    const existing = await redis.get(getChatKey(chatId));

    if (existing) {
      // Redis might return an object directly or a string
      if (typeof existing === 'string') {
        chat = JSON.parse(existing);
      } else {
        chat = existing as StoredChat;
      }
    } else {
      chat = {
        id: chatId,
        title: extractTitle(messages),
        messages: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    // Update messages and timestamp
    chat.messages = messages;
    chat.updatedAt = new Date().toISOString();

    // Save to Redis with 30-day expiration
    await redis.set(
      getChatKey(chatId),
      JSON.stringify(chat),
      { ex: 30 * 24 * 60 * 60 } // 30 days
    );
  } catch (error) {
    console.error('Error saving chat:', error);
    throw error;
  }
}

/**
 * Delete a chat
 */
export async function deleteChat(chatId: string): Promise<void> {
  await redis.del(getChatKey(chatId));
}

/**
 * Update chat title
 */
export async function updateChatTitle(chatId: string, title: string): Promise<void> {
  try {
    const data = await redis.get(getChatKey(chatId));
    if (!data) return;

    let chat: StoredChat;
    if (typeof data === 'string') {
      chat = JSON.parse(data);
    } else {
      chat = data as StoredChat;
    }

    chat.title = title;
    chat.updatedAt = new Date().toISOString();

    await redis.set(
      getChatKey(chatId),
      JSON.stringify(chat),
      { ex: 30 * 24 * 60 * 60 } // 30 days
    );
  } catch (error) {
    console.error('Error updating chat title:', error);
    throw error;
  }
}

/**
 * Extract title from messages (use first user message)
 */
function extractTitle(messages: UIMessage[]): string {
  const firstUserMessage = messages.find(m => m.role === 'user');
  if (!firstUserMessage) return 'New Chat';

  const textPart = firstUserMessage.parts.find(p => p.type === 'text');
  if (!textPart || !textPart.text) return 'New Chat';

  // Take first 50 characters
  const text = textPart.text.slice(0, 50);
  return text.length < textPart.text.length
    ? text + '...'
    : text;
}

/**
 * List all chats (if implementing chat history sidebar)
 */
export async function listChats(limit: number = 20): Promise<StoredChat[]> {
  try {
    // Note: This requires Redis SCAN command
    // For production, consider using a proper database for listing
    const keys = await redis.keys('chat:*');
    const chats: StoredChat[] = [];

    for (const key of keys.slice(0, limit)) {
      const data = await redis.get(key);
      if (data) {
        // Redis might return an object directly or a string
        let chat: StoredChat;
        if (typeof data === 'string') {
          chat = JSON.parse(data);
        } else {
          chat = data as StoredChat;
        }
        chats.push(chat);
      }
    }

    // Sort by updated date
    return chats.sort((a, b) =>
      new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  } catch (error) {
    console.error('Error listing chats:', error);
    return [];
  }
}

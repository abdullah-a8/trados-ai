import { Redis } from '@upstash/redis';
import { UIMessage } from 'ai';

// Initialize Redis client with environment variables
// Vercel's Upstash integration uses KV_REST_API_URL and KV_REST_API_TOKEN
export const redis = new Redis({
  url: process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

// Type for stored chat data
export interface StoredChat {
  id: string;
  userId?: string; // Optional: if you add authentication later
  title: string;
  messages: UIMessage[]; // UIMessage array
  createdAt: string;
  updatedAt: string;
}

// Helper to generate Redis keys
export const getChatKey = (chatId: string) => `chat:${chatId}`;
export const getUserChatsKey = (userId: string) => `user:${userId}:chats`;

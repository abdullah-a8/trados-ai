import { openai } from '@ai-sdk/openai';
import {
  streamText,
  convertToModelMessages,
  UIMessage,
  createIdGenerator
} from 'ai';
import { TRADOS_SYSTEM_PROMPT } from '@/config/prompts';
import { MODEL_CONFIG } from '@/config/model';
import { loadChat, saveChat } from '@/lib/chat-store';

// Extended duration for vision and complex tasks (Pro plan with Fluid Compute)
// Vercel 2025: Hobby=60s max, Pro=300s max, Enterprise=900s max
// With Fluid Compute enabled, you get up to 800s on Pro/Enterprise
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    // Parse request - now expecting only the last message and chat ID
    const {
      message,
      id: chatId
    }: {
      message: UIMessage;
      id: string;
    } = await req.json();

    // Load previous messages from Redis (with timeout handling)
    let previousMessages: UIMessage[];
    try {
      previousMessages = await Promise.race([
        loadChat(chatId),
        new Promise<UIMessage[]>((_, reject) => 
          setTimeout(() => reject(new Error('Redis timeout')), 3000)
        )
      ]);
    } catch (error) {
      console.warn('Redis load timeout or error, starting fresh:', error);
      previousMessages = [];
    }

    // Combine previous messages with the new message
    const allMessages = [...previousMessages, message];

    // Convert UI messages to model format, transforming file parts to image parts for vision models
    const modelMessages = convertToModelMessages(allMessages).map(msg => {
      // Only process user messages with content arrays
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map((part) => {
            // Convert file parts with image media types to image parts for GPT-4o vision
            // FilePart has: { type: 'file', data: DataContent | URL, mediaType: string }
            // ImagePart needs: { type: 'image', image: DataContent | URL }
            if (part.type === 'file' && 'mediaType' in part && typeof part.mediaType === 'string' && part.mediaType.startsWith('image/')) {
              return {
                type: 'image' as const,
                image: 'data' in part ? part.data : part,
              };
            }
            return part;
          })
        };
      }
      return msg;
    });

    // Stream the AI response
    const result = streamText({
      model: openai(MODEL_CONFIG.modelId),
      system: TRADOS_SYSTEM_PROMPT,
      messages: modelMessages,
    });

    // Return streaming response with persistence
    return result.toUIMessageStreamResponse({
      originalMessages: allMessages,

      // Generate consistent server-side message IDs for persistence
      generateMessageId: createIdGenerator({
        prefix: 'msg',
        size: 16,
      }),

      // Save complete conversation history when stream finishes
      onFinish: async ({ messages }) => {
        try {
          await saveChat(chatId, messages);
          console.log(`✅ Saved ${messages.length} messages for chat ${chatId}`);
        } catch (error) {
          console.error('Failed to save chat:', error);
          // Don't throw - we don't want to break the stream
        }
      },
    });

  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}

/**
 * GET endpoint to load chat history (optional)
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('id');

    if (!chatId) {
      return new Response(
        JSON.stringify({ error: 'Chat ID required' }),
        { status: 400 }
      );
    }

    const messages = await loadChat(chatId);

    return new Response(
      JSON.stringify({ messages }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('Load chat error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to load chat' }),
      { status: 500 }
    );
  }
}

import { createGoogleGenerativeAI } from '@ai-sdk/google';
import {
  streamText,
  convertToModelMessages,
  UIMessage,
  createIdGenerator
} from 'ai';
import { TRADOS_SYSTEM_PROMPT } from '@/config/prompts';
import { MODEL_CONFIG } from '@/config/model';
import { loadChat, saveChat } from '@/lib/chat-store';

// OCR + Translation pipeline imports
import { processMultipleImagesOCR } from '@/lib/datalab-ocr';
import {
  getTranslationPrompt,
  detectTargetLanguage,
} from '@/lib/openai-translation';
import { openai } from '@ai-sdk/openai';
import { deepseek } from '@ai-sdk/deepseek';

// Initialize Google Generative AI with explicit API key
const google = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

// Extended duration for vision and complex tasks (Pro plan with Fluid Compute)
// Vercel 2025: Hobby=60s max, Pro=300s max, Enterprise=900s max
// With Fluid Compute enabled, you get up to 800s on Pro/Enterprise
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    // Parse request - now expecting only the last message and chat ID
    const body = await req.json();

    const {
      message,
      id: chatId,
      historyEnabled = true, // Default to true for backward compatibility
      translationModel = 'gpt-4o' // Default to GPT-4o
    }: {
      message: UIMessage;
      id: string;
      historyEnabled?: boolean;
      translationModel?: string;
    } = body;

    // Load previous messages from Redis (with aggressive timeout to not block streaming)
    let previousMessages: UIMessage[];

    if (!historyEnabled) {
      previousMessages = [];
    } else {
      try {
        previousMessages = await Promise.race([
          loadChat(chatId),
          new Promise<UIMessage[]>((_, reject) =>
            setTimeout(() => reject(new Error('Redis timeout')), 1000) // Reduced from 3s to 1s
          )
        ]);
      } catch {
        previousMessages = [];
      }
    }

    // Combine previous messages with the new message
    const allMessages = [...previousMessages, message];

    // ============================================
    // NEW: OCR + TRANSLATION PIPELINE
    // ============================================

    // Check if message contains images
    const imageParts = message.parts.filter(
      (part): part is Extract<typeof part, { type: 'file' }> =>
        part.type === 'file' && part.mediaType?.startsWith('image/')
    );

    if (imageParts.length > 0) {
      try {
        // PHASE 1: DataLab Surya OCR
        const ocrResult = await processMultipleImagesOCR(
          imageParts.map((part) => ({
            data: part.url.split('base64,')[1] || part.url, // Remove data URL prefix
            mediaType: part.mediaType,
          }))
        );

        // PHASE 2: DETECT TARGET LANGUAGE

        // Extract target language from message if explicitly specified
        const textParts = message.parts
          .filter((part) => part.type === 'text')
          .map((part) => part.text);
        const messageText = textParts.join(' ');

        // Check for explicit "Translate to [Language]" instruction
        let targetLanguage;
        if (messageText.includes('Translate to English')) {
          targetLanguage = 'en-US' as const;
        } else if (messageText.includes('Translate to French')) {
          targetLanguage = 'fr' as const;
        } else if (messageText.includes('Translate to Arabic')) {
          targetLanguage = 'ar' as const;
        } else {
          // Fallback to auto-detection
          targetLanguage = detectTargetLanguage(message, previousMessages);
        }

        // PHASE 3: TRANSLATION WITH SELECTED MODEL (STREAMING DIRECTLY TO FRONTEND)

        // Select the appropriate model based on user choice
        const selectedModel =
          translationModel === 'gemini-2.5-flash' ? google(MODEL_CONFIG.modelId) :
          translationModel === 'deepseek-chat' ? deepseek('deepseek-chat') :
          openai('gpt-4o'); // Default to GPT-4o

        // Check for API keys
        if (translationModel === 'gemini-2.5-flash') {
          if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
            throw new Error('GOOGLE_GENERATIVE_AI_API_KEY environment variable is not set');
          }
        } else if (translationModel === 'deepseek-chat') {
          if (!process.env.DEEPSEEK_API_KEY) {
            throw new Error('DEEPSEEK_API_KEY environment variable is not set');
          }
        } else {
          if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY environment variable is not set');
          }
        }

        // Use Vercel AI SDK streamText with selected model

        try {
          const result = streamText({
            model: selectedModel,
            prompt: getTranslationPrompt(ocrResult.markdown, targetLanguage),
            temperature: 0.3,
            maxOutputTokens: 4096,
          });

          // IMPORTANT: Use toUIMessageStreamResponse() for useChat hook compatibility
          return result.toUIMessageStreamResponse({
            originalMessages: allMessages,
            generateMessageId: createIdGenerator({
              prefix: 'msg',
              size: 16,
            }),
            headers: {
              'X-Pipeline': `surya-ocr-${translationModel}`,
              'X-Target-Language': targetLanguage,
              'X-Translation-Model': translationModel,
            },
            onFinish: async ({ messages: newMessages }) => {
              if (!historyEnabled) {
                return;
              }

              try {
                await saveChat(chatId, newMessages);
              } catch (error) {
                console.error('Failed to save chat to Redis:', error);
                // Don't throw - we don't want to break the stream
              }
            },
          });
        } catch (error) {
          console.error('Critical error in streamText:', error);
          throw error;
        }
      } catch (error) {
        console.error('Pipeline error:', error);
        // Fall through to original Gemini implementation below
      }
    }

    // ============================================
    // FALLBACK: ORIGINAL GEMINI 2.5 FLASH FLOW
    // (Used for non-image requests or pipeline failures)
    // ============================================

    // Stream the AI response with Gemini 2.5 Flash vision support
    const result = streamText({
      model: google(MODEL_CONFIG.modelId),
      system: TRADOS_SYSTEM_PROMPT,
      messages: convertToModelMessages(allMessages),
    });

    // Return the streaming response directly (no refusal checking)
    return result.toUIMessageStreamResponse({
      originalMessages: allMessages,

      // Generate consistent server-side message IDs for persistence
      generateMessageId: createIdGenerator({
        prefix: 'msg',
        size: 16,
      }),

      // Save complete conversation history when stream finishes
      onFinish: async ({ messages }) => {
        if (!historyEnabled) {
          return;
        }

        try {
          await saveChat(chatId, messages);
        } catch (error) {
          console.error('Failed to save chat to Redis:', error);
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

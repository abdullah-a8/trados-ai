import { google } from '@ai-sdk/google';
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

// Extended duration for vision and complex tasks (Pro plan with Fluid Compute)
// Vercel 2025: Hobby=60s max, Pro=300s max, Enterprise=900s max
// With Fluid Compute enabled, you get up to 800s on Pro/Enterprise
export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    // Parse request - now expecting only the last message and chat ID
    const {
      message,
      id: chatId,
      historyEnabled = true // Default to true for backward compatibility
    }: {
      message: UIMessage;
      id: string;
      historyEnabled?: boolean;
    } = await req.json();

    // DEBUG: Log incoming message structure
    console.log('\n🔍 [DEBUG] Incoming message structure:', JSON.stringify(message, null, 2));
    console.log('🔍 [DEBUG] Message role:', message.role);
    console.log('🔍 [DEBUG] Message has parts:', 'parts' in message);
    console.log('🔍 [DEBUG] Message parts type:', typeof message.parts);
    console.log('🔍 [DEBUG] Message parts is array:', Array.isArray(message.parts));

    // Load previous messages from Redis (with aggressive timeout to not block streaming)
    let previousMessages: UIMessage[];

    if (!historyEnabled) {
      console.log('⏭️ Skipping Redis load - chat history disabled by user');
      previousMessages = [];
    } else {
      try {
        previousMessages = await Promise.race([
          loadChat(chatId),
          new Promise<UIMessage[]>((_, reject) =>
            setTimeout(() => reject(new Error('Redis timeout')), 1000) // Reduced from 3s to 1s
          )
        ]);
        console.log(`✅ Loaded ${previousMessages.length} previous messages from Redis`);
      } catch (error) {
        console.warn('⚠️ Redis load timeout or error, starting fresh:', error);
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
      console.log(
        `📸 [PIPELINE] Detected ${imageParts.length} images - using OCR + Translation pipeline`
      );

      try {
        // PHASE 1: DataLab Surya OCR
        console.log(`🔍 [PHASE 1] Starting DataLab Surya OCR...`);
        const ocrResult = await processMultipleImagesOCR(
          imageParts.map((part) => ({
            data: part.url.split('base64,')[1] || part.url, // Remove data URL prefix
            mediaType: part.mediaType,
          }))
        );

        console.log(
          `✅ [PHASE 1] OCR complete: ${ocrResult.markdown.length} chars, confidence: ${ocrResult.confidence}`
        );
        console.log(
          `📊 [PHASE 1] Model: ${ocrResult.metadata.model}, Request ID: ${ocrResult.metadata.requestId}`
        );
        console.log(`\n📄 [PHASE 1] OCR OUTPUT (first 1000 chars):\n${ocrResult.markdown.substring(0, 1000)}\n`);
        console.log(`📄 [PHASE 1] OCR OUTPUT (last 500 chars):\n${ocrResult.markdown.substring(Math.max(0, ocrResult.markdown.length - 500))}\n`);

        // PHASE 2: DETECT TARGET LANGUAGE
        console.log(`🌍 [PHASE 2] Detecting target language...`);

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

        console.log(`✅ [PHASE 2] Target language: ${targetLanguage}`);

        // PHASE 3: GPT-4o TRANSLATION (STREAMING DIRECTLY TO FRONTEND)
        console.log(`🔄 [PHASE 3] Starting GPT-4o translation streaming...`);
        console.log(`📤 [PHASE 3] INPUT TO TRANSLATION (first 1000 chars):\n${ocrResult.markdown.substring(0, 1000)}\n`);

        // Use Vercel AI SDK streamText with OpenAI
        let streamBuffer = '';
        const result = streamText({
          model: openai('gpt-4o'),
          prompt: getTranslationPrompt(ocrResult.markdown, targetLanguage),
          temperature: 0.3,
          maxOutputTokens: 4096,
          onChunk: ({ chunk }) => {
            // Log streaming chunks in real-time
            if (chunk.type === 'text-delta') {
              streamBuffer += chunk.text;
              process.stdout.write(chunk.text);
            }
          },
        });

        console.log(`🔄 [PHASE 3] GPT-4o streaming started...`);

        // Save metadata about the pipeline for analytics
        const metadata = {
          pipeline: 'datalab-surya-ocr + gpt-4o-streaming',
          ocrModel: ocrResult.metadata.model,
          ocrRequestId: ocrResult.metadata.requestId,
          ocrConfidence: ocrResult.confidence,
          translationModel: 'gpt-4o',
          targetLanguage: targetLanguage,
          ocrProcessingTime: ocrResult.metadata.processingTime,
        };

        console.log(`📊 [PIPELINE] Metadata:`, metadata);

        // IMPORTANT: Use toUIMessageStreamResponse() for useChat hook compatibility
        return result.toUIMessageStreamResponse({
          originalMessages: allMessages,
          generateMessageId: createIdGenerator({
            prefix: 'msg',
            size: 16,
          }),
          headers: {
            'X-Pipeline': 'surya-ocr-gpt4o',
            'X-Target-Language': targetLanguage,
          },
          onFinish: async ({ messages: newMessages }) => {
            console.log(`\n\n✅ [PHASE 3] GPT-4o streaming complete`);
            console.log(`📊 [PHASE 3] Total output length: ${streamBuffer.length} characters`);
            console.log(`📥 [PHASE 3] FULL TRANSLATION OUTPUT (first 500 chars):\n${streamBuffer.substring(0, 500)}...\n`);
            console.log(`📥 [PHASE 3] FULL TRANSLATION OUTPUT (last 500 chars):\n...${streamBuffer.substring(Math.max(0, streamBuffer.length - 500))}\n`);

            if (!historyEnabled) {
              console.log(`⏭️ [SAVE] Skipping Redis save - chat history disabled by user`);
              return;
            }

            console.log(`💾 [SAVE] Attempting to save ${newMessages.length} messages for chat ${chatId}...`);
            try {
              const saveStart = Date.now();
              await saveChat(chatId, newMessages);
              const saveDuration = Date.now() - saveStart;
              console.log(`✅ [SAVE] Saved ${newMessages.length} messages to Redis in ${saveDuration}ms`);
            } catch (error) {
              console.error('❌ [SAVE] Failed to save chat to Redis:', error);
              // Don't throw - we don't want to break the stream
            }
          },
        });
      } catch (error) {
        console.error('❌ [PIPELINE] Error:', error);

        // FALLBACK: Use Gemini 2.5 Flash if pipeline fails
        console.log(`🔄 [FALLBACK] Using Gemini 2.5 Flash as fallback...`);
        // Fall through to original Gemini implementation below
      }
    }

    // ============================================
    // FALLBACK: ORIGINAL GEMINI 2.5 FLASH FLOW
    // (Used for non-image requests or pipeline failures)
    // ============================================

    console.log(`🔄 [GEMINI] Using Gemini 2.5 Flash for text-only request`);

    // Stream the AI response with Gemini 2.5 Flash vision support
    let streamBuffer = '';
    const result = streamText({
      model: google(MODEL_CONFIG.modelId),
      system: TRADOS_SYSTEM_PROMPT,
      messages: convertToModelMessages(allMessages),
      onChunk: ({ chunk }) => {
        // Log streaming chunks in real-time
        if (chunk.type === 'text-delta') {
          streamBuffer += chunk.text;
          process.stdout.write(chunk.text);
        }
      },
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
        console.log(`\n\n✅ [GEMINI] Streaming complete`);
        console.log(`📊 [GEMINI] Total output length: ${streamBuffer.length} characters`);
        console.log(`📥 [GEMINI] FULL OUTPUT (first 500 chars):\n${streamBuffer.substring(0, 500)}...\n`);
        console.log(`📥 [GEMINI] FULL OUTPUT (last 500 chars):\n...${streamBuffer.substring(Math.max(0, streamBuffer.length - 500))}\n`);

        if (!historyEnabled) {
          console.log(`⏭️ [SAVE] Skipping Redis save - chat history disabled by user`);
          return;
        }

        console.log(`💾 [SAVE] Attempting to save ${messages.length} messages for chat ${chatId}...`);
        try {
          const saveStart = Date.now();
          await saveChat(chatId, messages);
          const saveDuration = Date.now() - saveStart;
          console.log(`✅ [SAVE] Saved ${messages.length} messages to Redis in ${saveDuration}ms`);
        } catch (error) {
          console.error('❌ [SAVE] Failed to save chat to Redis:', error);
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

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
  translateMarkdown,
  detectTargetLanguage,
} from '@/lib/openai-translation';

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

    // DEBUG: Log incoming message structure
    console.log('\n🔍 [DEBUG] Incoming message structure:', JSON.stringify(message, null, 2));
    console.log('🔍 [DEBUG] Message role:', message.role);
    console.log('🔍 [DEBUG] Message has parts:', 'parts' in message);
    console.log('🔍 [DEBUG] Message parts type:', typeof message.parts);
    console.log('🔍 [DEBUG] Message parts is array:', Array.isArray(message.parts));

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

        // PHASE 3: GPT-4o TRANSLATION
        console.log(`🔄 [PHASE 3] Starting GPT-4o translation...`);
        console.log(`📤 [PHASE 3] INPUT TO TRANSLATION (first 1000 chars):\n${ocrResult.markdown.substring(0, 1000)}\n`);

        const translationResult = await translateMarkdown(
          ocrResult.markdown,
          targetLanguage
        );

        console.log(
          `✅ [PHASE 3] Translation complete: ${translationResult.text.length} chars`
        );
        console.log(`📥 [PHASE 3] OUTPUT FROM TRANSLATION (first 1000 chars):\n${translationResult.text.substring(0, 1000)}\n`);
        console.log(`📥 [PHASE 3] OUTPUT FROM TRANSLATION (last 500 chars):\n${translationResult.text.substring(Math.max(0, translationResult.text.length - 500))}\n`);

        // PHASE 4: STREAM TRANSLATED TEXT TO USER
        console.log(`📤 [PHASE 4] Streaming translation to user...`);

        // Create a simple streaming response with the translated text
        const result = streamText({
          model: google(MODEL_CONFIG.modelId),
          system: `You are a document formatter. Your ONLY job is to output the provided translated document in clean markdown format.
Do NOT add any commentary, explanations, or modifications.
Simply output the translated text EXACTLY as provided, with proper markdown formatting.`,
          prompt: `Output this translated document:\n\n${translationResult.text}`,
        });

        // Save metadata about the pipeline for analytics
        const metadata = {
          pipeline: 'datalab-surya-ocr + gpt-4o-translation',
          ocrModel: ocrResult.metadata.model,
          ocrRequestId: ocrResult.metadata.requestId,
          ocrConfidence: ocrResult.confidence,
          translationModel: translationResult.metadata.model,
          translationTokens: translationResult.metadata.tokensUsed,
          targetLanguage: translationResult.targetLanguage,
          processingTime:
            ocrResult.metadata.processingTime +
            translationResult.metadata.processingTime,
        };

        console.log(`📊 [PIPELINE] Metadata:`, metadata);

        return result.toUIMessageStreamResponse({
          originalMessages: allMessages,
          generateMessageId: createIdGenerator({
            prefix: 'msg',
            size: 16,
          }),
          onFinish: async ({ messages }) => {
            try {
              await saveChat(chatId, messages);
              console.log(`✅ Saved ${messages.length} messages for chat ${chatId}`);
            } catch (error) {
              console.error('Failed to save chat:', error);
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

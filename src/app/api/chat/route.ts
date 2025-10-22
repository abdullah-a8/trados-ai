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
import { bufferAndCheckRefusal, consumeFullStream } from '@/lib/stream-buffer';
import { detectConversationLanguage } from '@/lib/language-detection';
import { getRetryClarification } from '@/config/retry-prompts';
import { nanoid } from 'nanoid';

// OCR + Translation pipeline imports
import { processMultipleImagesOCR } from '@/lib/openai-ocr';
import {
  translateMarkdown,
  detectTargetLanguage,
} from '@/lib/deepl-translation';

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
        // PHASE 1: GPT-4o OCR
        console.log(`🔍 [PHASE 1] Starting GPT-4o OCR...`);
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
          `📊 [PHASE 1] Model: ${ocrResult.metadata.model}, Tokens: ${ocrResult.metadata.tokensUsed}`
        );
        console.log(`\n📄 [PHASE 1] OCR OUTPUT (first 1000 chars):\n${ocrResult.markdown.substring(0, 1000)}\n`);
        console.log(`📄 [PHASE 1] OCR OUTPUT (last 500 chars):\n${ocrResult.markdown.substring(Math.max(0, ocrResult.markdown.length - 500))}\n`);

        // PHASE 2: DETECT TARGET LANGUAGE
        console.log(`🌍 [PHASE 2] Detecting target language...`);
        const targetLanguage = detectTargetLanguage(message, previousMessages);
        console.log(`✅ [PHASE 2] Target language: ${targetLanguage}`);

        // PHASE 3: DEEPL TRANSLATION
        console.log(`🔄 [PHASE 3] Starting DeepL translation...`);
        console.log(`📤 [PHASE 3] INPUT TO DEEPL (first 1000 chars):\n${ocrResult.markdown.substring(0, 1000)}\n`);

        const translationResult = await translateMarkdown(
          ocrResult.markdown,
          targetLanguage,
          {
            formality: 'prefer_more', // Formal for official documents
          }
        );

        console.log(
          `✅ [PHASE 3] Translation complete: ${translationResult.billedCharacters} chars, detected source: ${translationResult.sourceLanguage}`
        );
        console.log(`📥 [PHASE 3] OUTPUT FROM DEEPL (first 1000 chars):\n${translationResult.text.substring(0, 1000)}\n`);
        console.log(`📥 [PHASE 3] OUTPUT FROM DEEPL (last 500 chars):\n${translationResult.text.substring(Math.max(0, translationResult.text.length - 500))}\n`);

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
          pipeline: 'gpt-4o-ocr + deepl',
          ocrModel: ocrResult.metadata.model,
          ocrTokens: ocrResult.metadata.tokensUsed,
          ocrConfidence: ocrResult.confidence,
          sourceLanguage: translationResult.sourceLanguage,
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

    // Retry mechanism: max 2 retries for refusals
    const MAX_RETRIES = 2;
    let attempt = 0;
    let firstRefusalText: string | null = null;

    // Keep a separate copy for retry attempts (includes retry clarifications)
    // This is NOT saved to the database - only used for internal retry logic
    // eslint-disable-next-line prefer-const
    let messagesForRetry = [...allMessages];

    while (attempt <= MAX_RETRIES) {
      console.log(`\n🔄 [RETRY] Attempt ${attempt + 1}/${MAX_RETRIES + 1}`);

      // Stream the AI response with Gemini 2.5 Flash vision support
      const result = streamText({
        model: google(MODEL_CONFIG.modelId),
        system: TRADOS_SYSTEM_PROMPT,
        messages: convertToModelMessages(messagesForRetry),
      });

      // Buffer initial stream and check for refusal
      const detection = await bufferAndCheckRefusal(result, 150);

      console.log(`🔍 [REFUSAL CHECK] Buffered ${detection.bufferedText.length} chars`);
      console.log(`🔍 [REFUSAL CHECK] Is refusal: ${detection.isRefusal} (confidence: ${detection.confidence})`);

      // If refusal detected and we have retries remaining
      if (detection.isRefusal && detection.confidence === 'high' && attempt < MAX_RETRIES) {
        console.log(`🚨 [REFUSAL] Detected on attempt ${attempt + 1}`);
        console.log(`🚨 [REFUSAL] Pattern: ${detection.matchedPattern}`);
        console.log(`🚨 [REFUSAL] Text: ${detection.bufferedText.substring(0, 100)}...`);

        // Save the first refusal to show user if all retries fail
        if (!firstRefusalText) {
          // Consume the rest of the stream to get full refusal message
          const fullRefusal = await consumeFullStream(result);
          firstRefusalText = detection.bufferedText + fullRefusal;
          console.log(`💾 [REFUSAL] Saved first refusal (${firstRefusalText.length} chars)`);
        }

        // Detect conversation language using hybrid approach
        const language = detectConversationLanguage(
          message,
          previousMessages,
          detection.bufferedText // Use refusal text for best accuracy
        );

        console.log(`🌍 [LANGUAGE] Detected: ${language}`);

        // Get retry clarification in detected language
        const retryClarification = getRetryClarification(language);
        console.log(`💬 [RETRY] Sending clarification in ${language}`);
        console.log(`💬 [RETRY] Text: ${retryClarification.substring(0, 100)}...`);

        // Add retry clarification to messagesForRetry (NOT to allMessages - not saved)
        messagesForRetry.push({
          id: nanoid(),
          role: 'user',
          parts: [{
            type: 'text',
            text: retryClarification
          }],
          createdAt: new Date()
        } as UIMessage);

        attempt++;
        console.log(`🔄 [RETRY] Preparing attempt ${attempt + 1}/${MAX_RETRIES + 1}`);
        continue; // Retry loop
      }

      // If all retries failed, return original refusal
      if (detection.isRefusal && detection.confidence === 'high' && attempt >= MAX_RETRIES) {
        console.log(`❌ [REFUSAL] Max retries reached. Returning original refusal.`);

        // Return the first refusal message as plain text response
        return new Response(firstRefusalText || detection.bufferedText, {
          status: 200,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }

      // Success! Return the streaming response
      console.log(`✅ [SUCCESS] Translation proceeding (attempt ${attempt + 1})`);

      return result.toUIMessageStreamResponse({
        originalMessages: allMessages, // Only save original user messages (no retry clarifications)

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
    }

    // Should never reach here, but just in case
    throw new Error('Retry loop exited unexpectedly');

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

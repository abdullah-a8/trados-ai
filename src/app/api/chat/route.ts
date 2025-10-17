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
import {
  extractTextFromMultipleFiles,
  shouldProcessWithOCR,
  extractBase64FromDataURL
} from '@/lib/mistral-ocr';

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

    // ========================================
    // MISTRAL OCR PREPROCESSING
    // ========================================
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[OCR Pipeline] 🚀 Starting OCR preprocessing...`);
    console.log(`${'='.repeat(80)}`);

    // Extract files that need OCR processing from the new message
    const filesForOCR: Array<{
      data: string;
      mediaType: string;
      filename?: string;
    }> = [];

    console.log(`[OCR Pipeline] 🔍 Analyzing message parts for OCR-compatible files...`);
    console.log(`[OCR Pipeline] 📋 Message has parts: ${Array.isArray(message.parts)}`);
    console.log(`[OCR Pipeline] 📊 Number of parts: ${Array.isArray(message.parts) ? message.parts.length : 0}`);

    if (Array.isArray(message.parts)) {
      message.parts.forEach((part: { type?: string; mediaType?: string; url?: string; filename?: string }, index: number) => {
        console.log(`[OCR Pipeline] 🔎 Examining part ${index + 1}:`, {
          type: part.type,
          mediaType: part.mediaType,
          hasUrl: !!part.url,
          filename: part.filename,
          urlPrefix: part.url?.substring(0, 50)
        });

        if (part.type === 'file' && part.mediaType && part.url && shouldProcessWithOCR(part.mediaType)) {
          console.log(`[OCR Pipeline] ✅ Part ${index + 1} is OCR-compatible (${part.mediaType})`);
          try {
            // Extract base64 data from data URL
            const base64Data = extractBase64FromDataURL(part.url);
            console.log(`[OCR Pipeline] 📝 Extracted ${base64Data.length} characters of base64 data`);
            filesForOCR.push({
              data: base64Data,
              mediaType: part.mediaType,
              filename: part.filename,
            });
          } catch (error) {
            console.error('[OCR Pipeline] ❌ Failed to extract file data from part:', error);
          }
        } else {
          console.log(`[OCR Pipeline] ⏭️  Part ${index + 1} skipped (not OCR-compatible)`);
        }
      });
    }

    console.log(`[OCR Pipeline] 📦 Total files to process with OCR: ${filesForOCR.length}`);

    // Process files with Mistral OCR if any were found
    let ocrExtractedText = '';
    if (filesForOCR.length > 0) {
      try {
        console.log(`[OCR Pipeline] 🚀 Starting Mistral OCR processing for ${filesForOCR.length} file(s)...`);
        ocrExtractedText = await extractTextFromMultipleFiles(filesForOCR);
        console.log(`[OCR Pipeline] ✅ OCR completed successfully!`);
        console.log(`[OCR Pipeline] 📝 Extracted text length: ${ocrExtractedText.length} characters`);
      } catch (error) {
        console.error('[OCR Pipeline] ❌ OCR processing failed:', error);
        if (error instanceof Error) {
          console.error('[OCR Pipeline] ❌ Error details:', error.message);
          console.error('[OCR Pipeline] ❌ Stack trace:', error.stack);
        }
        // Continue without OCR - will fallback to vision model
        console.log('[OCR Pipeline] ⚠️  Continuing without OCR (fallback to vision model)');
        ocrExtractedText = '';
      }
    } else {
      console.log('[OCR Pipeline] ℹ️  No OCR-compatible files found, skipping OCR processing');
    }

    console.log(`${'='.repeat(80)}\n`);

    // Convert UI messages to model format
    // If OCR extracted text, replace file parts with text content for GPT-4o
    const modelMessages = convertToModelMessages(allMessages).map(msg => {
      // Only process the last user message (which we just received)
      if (msg.role === 'user' && Array.isArray(msg.content) && msg === convertToModelMessages([message])[0]) {
        // Filter out file parts that were processed by OCR
        const nonOCRParts = msg.content.filter((part: { type?: string; mediaType?: string }) => {
          if (part.type === 'file' && part.mediaType && shouldProcessWithOCR(part.mediaType)) {
            return false; // Remove OCR-processed files
          }
          return true;
        });

        // If we have OCR extracted text, add it to the message content
        if (ocrExtractedText) {
          return {
            ...msg,
            content: [
              ...nonOCRParts,
              {
                type: 'text' as const,
                text: `\n\n[Extracted Document Text via OCR]:\n\n${ocrExtractedText}`,
              }
            ]
          };
        }

        return {
          ...msg,
          content: nonOCRParts
        };
      }

      // For historical messages or non-user messages, keep vision capability
      if (msg.role === 'user' && Array.isArray(msg.content)) {
        return {
          ...msg,
          content: msg.content.map((part) => {
            // Convert file parts with image media types to image parts for GPT-4o vision (fallback)
            if (part.type === 'file' && part.mediaType && part.mediaType.startsWith('image/')) {
              return {
                type: 'image' as const,
                image: part.data,
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

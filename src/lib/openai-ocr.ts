/**
 * OpenAI GPT-4o Vision OCR Service
 *
 * Handles OCR processing using GPT-4o's vision capabilities
 * Extracts text from images in accurate markdown format
 */

import OpenAI from 'openai';

// Lazy initialization of OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

/**
 * OCR response interface
 */
export interface OCRResult {
  markdown: string;
  pages: number;
  confidence: 'high' | 'medium' | 'low';
  metadata: {
    processingTime: number;
    model: string;
    tokensUsed: number;
  };
}

/**
 * Process single image with GPT-4o Vision
 */
export async function processImageOCR(
  imageBase64: string,
  mediaType: string
): Promise<OCRResult> {
  const startTime = Date.now();

  try {
    console.log(`🔍 [OCR] Starting GPT-4o OCR for ${mediaType} image`);

    // Prepare base64 data URL
    const dataUrl = imageBase64.includes('data:')
      ? imageBase64
      : `data:${mediaType};base64,${imageBase64}`;

    console.log(`📊 [OCR] Image size: ${imageBase64.length} bytes (base64)`);
    console.log(`📊 [OCR] Media type: ${mediaType}`);

    // Process OCR using GPT-4o Vision
    console.log(`🔄 [OCR] Sending to GPT-4o for text extraction...`);

    const completion = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract ALL text from this image and format it as clean, accurate markdown.

CRITICAL REQUIREMENTS:
1. Extract EVERY piece of text visible in the image - do not skip or summarize anything
2. Preserve the exact structure and layout of the document
3. Maintain proper hierarchy with markdown headings (use #, ##, ### appropriately)
4. Use **bold** for emphasized or bold text
5. Use tables (| ... |) for tabular data
6. Use lists (-, *, 1.) for listed items
7. Preserve all numbers, dates, and identifiers EXACTLY as shown
8. Do NOT add any explanations, comments, or interpretations
9. Do NOT translate or modify the text - keep it in the original language
10. Output ONLY the extracted markdown - nothing else

Your response should be pure markdown that accurately represents the complete document.`,
            },
            {
              type: 'image_url',
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ],
      max_tokens: 4096,
      temperature: 0, // Use deterministic output for OCR
    });

    const extractedText = completion.choices[0]?.message?.content || '';
    const tokensUsed = completion.usage?.total_tokens || 0;

    console.log(`✅ [OCR] GPT-4o extraction complete`);
    console.log(`📊 [OCR] Extracted ${extractedText.length} characters`);
    console.log(`📊 [OCR] Tokens used: ${tokensUsed}`);
    console.log(`📄 [OCR] EXTRACTED TEXT (first 1000 chars):\n${extractedText.substring(0, 1000)}`);
    console.log(`📄 [OCR] EXTRACTED TEXT (last 500 chars):\n${extractedText.substring(Math.max(0, extractedText.length - 500))}`);

    // Calculate confidence based on content quality
    const confidence = calculateOCRConfidence(extractedText);

    const processingTime = Date.now() - startTime;

    console.log(
      `✅ [OCR] Complete in ${processingTime}ms (confidence: ${confidence})`
    );

    return {
      markdown: extractedText,
      pages: 1,
      confidence,
      metadata: {
        processingTime,
        model: 'gpt-4o',
        tokensUsed,
      },
    };
  } catch (error) {
    console.error('❌ [OCR] Error:', error);
    throw new Error(
      `GPT-4o OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Process multiple images in parallel
 */
export async function processMultipleImagesOCR(
  images: Array<{ data: string; mediaType: string }>
): Promise<OCRResult> {
  const startTime = Date.now();

  console.log(`🔍 [OCR] Processing ${images.length} images with GPT-4o...`);

  // Process all images in parallel
  const results = await Promise.all(
    images.map((img, idx) =>
      processImageOCR(img.data, img.mediaType).catch((error) => {
        console.error(`❌ [OCR] Image ${idx + 1} failed:`, error);
        return null;
      })
    )
  );

  // Filter out failed results
  const successfulResults = results.filter(
    (result): result is OCRResult => result !== null
  );

  if (successfulResults.length === 0) {
    throw new Error('All OCR attempts failed');
  }

  // Combine all markdown results
  const combinedMarkdown = successfulResults
    .map((result, idx) => {
      if (successfulResults.length > 1) {
        return `### Document ${idx + 1}\n\n${result.markdown}`;
      }
      return result.markdown;
    })
    .join('\n\n---\n\n');

  console.log(`📄 [OCR] COMBINED OUTPUT (first 1000 chars):\n${combinedMarkdown.substring(0, 1000)}`);
  console.log(`📄 [OCR] COMBINED OUTPUT (last 500 chars):\n${combinedMarkdown.substring(Math.max(0, combinedMarkdown.length - 500))}`);

  // Calculate overall confidence (minimum of all confidences)
  const overallConfidence =
    successfulResults.every((r) => r.confidence === 'high')
      ? 'high'
      : successfulResults.some((r) => r.confidence === 'low')
        ? 'low'
        : 'medium';

  const totalPages = successfulResults.reduce((sum, r) => sum + r.pages, 0);
  const totalTokens = successfulResults.reduce((sum, r) => sum + r.metadata.tokensUsed, 0);
  const processingTime = Date.now() - startTime;

  console.log(
    `✅ [OCR] All images processed in ${processingTime}ms (${successfulResults.length}/${images.length} successful)`
  );
  console.log(`📊 [OCR] Total tokens used: ${totalTokens}`);

  return {
    markdown: combinedMarkdown,
    pages: totalPages,
    confidence: overallConfidence,
    metadata: {
      processingTime,
      model: 'gpt-4o',
      tokensUsed: totalTokens,
    },
  };
}

/**
 * Calculate OCR confidence based on output quality
 */
function calculateOCRConfidence(
  markdown: string
): 'high' | 'medium' | 'low' {
  // Heuristics for confidence:
  // - Text length (too short = suspicious)
  // - Structure indicators (headings, tables, lists)
  // - Special characters ratio (too high = garbled)
  // - Word count and readability

  const textLength = markdown.trim().length;
  const hasStructure =
    markdown.includes('#') ||
    markdown.includes('|') ||
    markdown.includes('**');

  // Count alphanumeric vs special characters (excluding common punctuation and whitespace)
  const specialCharRatio =
    (markdown.match(/[^a-zA-Z0-9\s\n.,;:!?'"()\-–—]/g) || []).length / textLength;

  // Count words (rough approximation)
  const wordCount = markdown.trim().split(/\s+/).length;

  // Confidence logic
  if (textLength < 10) {
    return 'low'; // Too short - likely failed
  }

  if (specialCharRatio > 0.4) {
    return 'low'; // Too many special chars (likely garbled)
  }

  // High confidence: good length with structure OR substantial plain text
  if ((textLength > 100 && hasStructure) || (textLength > 200 && wordCount > 20)) {
    return 'high';
  }

  // Medium confidence: reasonable length with some content
  if (textLength > 30 && wordCount > 5) {
    return 'medium';
  }

  // Low confidence: very short or suspicious content
  if (textLength < 30 || wordCount < 3) {
    return 'low';
  }

  // Default to medium for anything else
  return 'medium';
}

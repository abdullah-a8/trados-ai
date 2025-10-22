/**
 * Mistral OCR Service
 *
 * Handles OCR processing using Mistral's specialized OCR model
 * Converts images to structured markdown for translation
 */

import { Mistral } from '@mistralai/mistralai';

// Lazy initialization of Mistral client
let mistralClient: Mistral | null = null;

function getMistralClient(): Mistral {
  if (!mistralClient) {
    if (!process.env.MISTRAL_API_KEY) {
      throw new Error('MISTRAL_API_KEY environment variable is not set');
    }
    mistralClient = new Mistral({
      apiKey: process.env.MISTRAL_API_KEY,
    });
  }
  return mistralClient;
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
    pagesProcessed: number;
    docSizeBytes: number;
  };
}

/**
 * Process single image with Mistral OCR
 */
export async function processImageOCR(
  imageBase64: string,
  mediaType: string
): Promise<OCRResult> {
  const startTime = Date.now();

  try {
    console.log(`🔍 [OCR] Starting OCR for ${mediaType} image`);

    // Prepare base64 data URL for Mistral OCR
    const dataUrl = imageBase64.includes('data:')
      ? imageBase64
      : `data:${mediaType};base64,${imageBase64}`;

    // Process OCR using image_url with data URL
    console.log(`🔄 [OCR] Processing OCR with data URL...`);
    const ocrResponse = await getMistralClient().ocr.process({
      model: 'mistral-ocr-latest',
      document: {
        type: 'image_url',
        imageUrl: dataUrl,
      },
      includeImageBase64: false, // Don't need images in response
    });

    console.log(`✅ [OCR] OCR completed: ${ocrResponse.pages.length} pages`);

    // Extract markdown from all pages
    const markdown = ocrResponse.pages
      .map((page, idx) => {
        if (ocrResponse.pages.length > 1) {
          return `### Document Page ${idx + 1}\n\n${page.markdown}`;
        }
        return page.markdown;
      })
      .join('\n\n---\n\n');

    // Calculate confidence based on content quality
    const confidence = calculateOCRConfidence(markdown);

    const processingTime = Date.now() - startTime;

    console.log(
      `✅ [OCR] Complete in ${processingTime}ms (confidence: ${confidence})`
    );

    return {
      markdown,
      pages: ocrResponse.pages.length,
      confidence,
      metadata: {
        processingTime,
        pagesProcessed: ocrResponse.usageInfo.pagesProcessed || 0,
        docSizeBytes: ocrResponse.usageInfo.docSizeBytes || 0,
      },
    };
  } catch (error) {
    console.error('❌ [OCR] Error:', error);
    throw new Error(
      `Mistral OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`
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

  console.log(`🔍 [OCR] Processing ${images.length} images in parallel...`);

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

  // Calculate overall confidence (minimum of all confidences)
  const overallConfidence =
    successfulResults.every((r) => r.confidence === 'high')
      ? 'high'
      : successfulResults.some((r) => r.confidence === 'low')
        ? 'low'
        : 'medium';

  const totalPages = successfulResults.reduce((sum, r) => sum + r.pages, 0);
  const processingTime = Date.now() - startTime;

  console.log(
    `✅ [OCR] All images processed in ${processingTime}ms (${successfulResults.length}/${images.length} successful)`
  );

  return {
    markdown: combinedMarkdown,
    pages: totalPages,
    confidence: overallConfidence,
    metadata: {
      processingTime,
      pagesProcessed: totalPages,
      docSizeBytes: successfulResults.reduce(
        (sum, r) => sum + r.metadata.docSizeBytes,
        0
      ),
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

  // Default to medium for anything else (changed from 'low')
  return 'medium';
}

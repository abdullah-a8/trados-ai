/**
 * Mistral OCR Service
 *
 * Provides OCR capabilities using Mistral AI's OCR API to extract text
 * from images and documents. Returns structured markdown output for
 * downstream translation processing.
 *
 * Pipeline: Image/PDF → Mistral OCR → Markdown Text → GPT-4o Translation
 */

import { Mistral } from '@mistralai/mistralai';

// Initialize Mistral client with API key
const client = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY!,
});

/**
 * Extract text from a single image using Mistral OCR
 *
 * @param imageData - Base64 encoded image string (without data URL prefix)
 * @param mediaType - MIME type of the image (e.g., 'image/jpeg', 'image/png')
 * @returns Extracted text in markdown format
 */
export async function extractTextFromImage(
  imageData: string,
  mediaType: string
): Promise<string> {
  try {
    console.log(`[Mistral OCR] Processing image (${mediaType})...`);

    // Construct data URL for Mistral OCR API
    const dataUrl = `data:${mediaType};base64,${imageData}`;

    // Process OCR using Mistral API
    const ocrResponse = await client.ocr.process({
      model: 'mistral-ocr-latest',
      document: {
        type: 'image_url',
        imageUrl: dataUrl,
      },
      includeImageBase64: false, // We don't need the image back
    });

    // Extract markdown text from response
    // The OCR response contains pages array with markdown content
    const extractedText = ocrResponse.pages
      ?.map((page: { markdown?: string }) => page.markdown)
      .filter(Boolean)
      .join('\n\n') || '';

    console.log(`[Mistral OCR] ✅ Extracted ${extractedText.length} characters`);

    return extractedText;
  } catch (error) {
    console.error('[Mistral OCR] Error processing image:', error);
    throw new Error(
      `OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Extract text from a PDF document using Mistral OCR
 *
 * @param pdfData - Base64 encoded PDF string (without data URL prefix)
 * @returns Extracted text in markdown format from all pages
 */
export async function extractTextFromPDF(
  pdfData: string
): Promise<string> {
  try {
    console.log('[Mistral OCR] Processing PDF document...');

    // Construct data URL for PDF
    const dataUrl = `data:application/pdf;base64,${pdfData}`;

    // Process OCR using Mistral API
    const ocrResponse = await client.ocr.process({
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        documentUrl: dataUrl,
      },
      includeImageBase64: false,
    });

    // Extract markdown text from all pages
    const extractedText = ocrResponse.pages
      ?.map((page: { markdown?: string }, index: number) => {
        const pageNum = index + 1;
        return `## Page ${pageNum}\n\n${page.markdown}`;
      })
      .filter(Boolean)
      .join('\n\n---\n\n') || '';

    console.log(`[Mistral OCR] ✅ Extracted text from ${ocrResponse.pages?.length || 0} pages`);

    return extractedText;
  } catch (error) {
    console.error('[Mistral OCR] Error processing PDF:', error);
    throw new Error(
      `PDF OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Process multiple images/documents in parallel and combine results
 *
 * @param files - Array of file objects with data and metadata
 * @returns Combined markdown text from all documents with separators
 */
export async function extractTextFromMultipleFiles(
  files: Array<{
    data: string;      // Base64 encoded data (without data URL prefix)
    mediaType: string; // MIME type
    filename?: string; // Optional filename for context
  }>
): Promise<string> {
  try {
    console.log(`[Mistral OCR] Processing ${files.length} file(s) in parallel...`);

    // Process all files in parallel for better performance
    const results = await Promise.all(
      files.map(async (file, index) => {
        try {
          // Route to appropriate processor based on media type
          let extractedText: string;

          if (file.mediaType === 'application/pdf') {
            extractedText = await extractTextFromPDF(file.data);
          } else if (file.mediaType.startsWith('image/')) {
            extractedText = await extractTextFromImage(file.data, file.mediaType);
          } else {
            console.warn(`[Mistral OCR] Unsupported media type: ${file.mediaType}`);
            return null;
          }

          // Add document separator with metadata
          const docNumber = index + 1;
          const filename = file.filename || `Document ${docNumber}`;

          return `### Document ${docNumber}: ${filename}\n\n${extractedText}`;
        } catch (error) {
          console.error(`[Mistral OCR] Failed to process file ${index + 1}:`, error);
          // Return error message instead of failing entire batch
          return `### Document ${index + 1}: [OCR Error]\n\nFailed to extract text from this document.`;
        }
      })
    );

    // Filter out null results and combine with document separators
    const combinedText = results
      .filter(Boolean)
      .join('\n\n---\n\n');

    console.log(`[Mistral OCR] ✅ Successfully processed ${files.length} file(s)`);

    return combinedText;
  } catch (error) {
    console.error('[Mistral OCR] Batch processing error:', error);
    throw new Error(
      `Batch OCR processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Helper function to check if a file should be processed by OCR
 *
 * @param mediaType - MIME type of the file
 * @returns true if file should be processed by OCR
 */
export function shouldProcessWithOCR(mediaType: string): boolean {
  return (
    mediaType.startsWith('image/') ||
    mediaType === 'application/pdf'
  );
}

/**
 * Helper function to extract base64 data from a data URL
 *
 * @param dataUrl - Full data URL (e.g., "data:image/jpeg;base64,...")
 * @returns Base64 encoded data without prefix
 */
export function extractBase64FromDataURL(dataUrl: string): string {
  const base64Match = dataUrl.match(/^data:[^;]+;base64,(.+)$/);
  if (!base64Match) {
    throw new Error('Invalid data URL format');
  }
  return base64Match[1];
}

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
    console.log(`[Mistral OCR] 📸 Processing image (${mediaType})...`);
    console.log(`[Mistral OCR] 📊 Image data length: ${imageData.length} characters`);
    console.log(`[Mistral OCR] 🔑 API Key configured: ${!!process.env.MISTRAL_API_KEY}`);

    // Construct data URL for Mistral OCR API
    const dataUrl = `data:${mediaType};base64,${imageData}`;
    console.log(`[Mistral OCR] 🔗 Data URL prefix: ${dataUrl.substring(0, 50)}...`);

    // Process OCR using Mistral API
    console.log(`[Mistral OCR] 🚀 Sending request to Mistral API...`);
    const ocrResponse = await client.ocr.process({
      model: 'mistral-ocr-latest',
      document: {
        type: 'image_url',
        imageUrl: dataUrl,
      },
      includeImageBase64: false, // We don't need the image back
    });

    console.log(`[Mistral OCR] 📥 Received response from Mistral API`);
    console.log(`[Mistral OCR] 📄 Pages in response: ${ocrResponse.pages?.length || 0}`);
    console.log(`[Mistral OCR] 🔍 Full response structure:`, JSON.stringify(ocrResponse, null, 2));

    // Extract markdown text from response
    // The OCR response contains pages array with markdown content
    const extractedText = ocrResponse.pages
      ?.map((page: { markdown?: string }) => page.markdown)
      .filter(Boolean)
      .join('\n\n') || '';

    console.log(`[Mistral OCR] ✅ Successfully extracted ${extractedText.length} characters`);
    console.log(`[Mistral OCR] 📝 First 200 chars of extracted text:`, extractedText.substring(0, 200));

    return extractedText;
  } catch (error) {
    console.error('[Mistral OCR] ❌ Error processing image:', error);
    if (error instanceof Error) {
      console.error('[Mistral OCR] ❌ Error message:', error.message);
      console.error('[Mistral OCR] ❌ Error stack:', error.stack);
    }
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
    console.log('[Mistral OCR] 📄 Processing PDF document...');
    console.log(`[Mistral OCR] 📊 PDF data length: ${pdfData.length} characters`);

    // Construct data URL for PDF
    const dataUrl = `data:application/pdf;base64,${pdfData}`;
    console.log(`[Mistral OCR] 🔗 Data URL prefix: ${dataUrl.substring(0, 50)}...`);

    // Process OCR using Mistral API
    console.log(`[Mistral OCR] 🚀 Sending PDF request to Mistral API...`);
    const ocrResponse = await client.ocr.process({
      model: 'mistral-ocr-latest',
      document: {
        type: 'document_url',
        documentUrl: dataUrl,
      },
      includeImageBase64: false,
    });

    console.log(`[Mistral OCR] 📥 Received PDF response from Mistral API`);
    console.log(`[Mistral OCR] 📄 Pages in response: ${ocrResponse.pages?.length || 0}`);
    console.log(`[Mistral OCR] 🔍 Full response structure:`, JSON.stringify(ocrResponse, null, 2));

    // Extract markdown text from all pages
    const extractedText = ocrResponse.pages
      ?.map((page: { markdown?: string }, index: number) => {
        const pageNum = index + 1;
        return `## Page ${pageNum}\n\n${page.markdown}`;
      })
      .filter(Boolean)
      .join('\n\n---\n\n') || '';

    console.log(`[Mistral OCR] ✅ Successfully extracted text from ${ocrResponse.pages?.length || 0} pages`);
    console.log(`[Mistral OCR] 📝 First 200 chars of extracted text:`, extractedText.substring(0, 200));

    return extractedText;
  } catch (error) {
    console.error('[Mistral OCR] ❌ Error processing PDF:', error);
    if (error instanceof Error) {
      console.error('[Mistral OCR] ❌ Error message:', error.message);
      console.error('[Mistral OCR] ❌ Error stack:', error.stack);
    }
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
    console.log(`\n${'='.repeat(80)}`);
    console.log(`[Mistral OCR] 📦 Starting batch processing of ${files.length} file(s)`);
    console.log(`${'='.repeat(80)}`);

    files.forEach((file, index) => {
      console.log(`[Mistral OCR] 📋 File ${index + 1}/${files.length}:`);
      console.log(`  - Media Type: ${file.mediaType}`);
      console.log(`  - Filename: ${file.filename || 'N/A'}`);
      console.log(`  - Data length: ${file.data.length} characters`);
    });

    // Process all files in parallel for better performance
    const results = await Promise.all(
      files.map(async (file, index) => {
        try {
          console.log(`\n[Mistral OCR] 🔄 Processing file ${index + 1}/${files.length} (${file.mediaType})...`);

          // Route to appropriate processor based on media type
          let extractedText: string;

          if (file.mediaType === 'application/pdf') {
            console.log(`[Mistral OCR] 📄 Routing to PDF processor...`);
            extractedText = await extractTextFromPDF(file.data);
          } else if (file.mediaType.startsWith('image/')) {
            console.log(`[Mistral OCR] 🖼️  Routing to image processor...`);
            extractedText = await extractTextFromImage(file.data, file.mediaType);
          } else {
            console.warn(`[Mistral OCR] ⚠️  Unsupported media type: ${file.mediaType}`);
            return null;
          }

          // Add document separator with metadata
          const docNumber = index + 1;
          const filename = file.filename || `Document ${docNumber}`;

          console.log(`[Mistral OCR] ✅ Successfully processed file ${index + 1}/${files.length}`);
          return `### Document ${docNumber}: ${filename}\n\n${extractedText}`;
        } catch (error) {
          console.error(`[Mistral OCR] ❌ Failed to process file ${index + 1}/${files.length}:`, error);
          // Return error message instead of failing entire batch
          return `### Document ${index + 1}: [OCR Error]\n\nFailed to extract text from this document.`;
        }
      })
    );

    // Filter out null results and combine with document separators
    const combinedText = results
      .filter(Boolean)
      .join('\n\n---\n\n');

    console.log(`\n${'='.repeat(80)}`);
    console.log(`[Mistral OCR] ✅ Batch processing complete!`);
    console.log(`[Mistral OCR] 📊 Successfully processed: ${files.length} file(s)`);
    console.log(`[Mistral OCR] 📝 Total extracted text length: ${combinedText.length} characters`);
    console.log(`${'='.repeat(80)}\n`);

    return combinedText;
  } catch (error) {
    console.error('[Mistral OCR] ❌ Batch processing error:', error);
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

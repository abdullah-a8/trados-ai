/**
 * DataLab Surya OCR Service
 *
 * Handles OCR processing using DataLab's Surya OCR API
 * Supports 90+ languages including Arabic, French, English
 * Optimized for multilingual document extraction with high accuracy
 */

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
    requestId: string;
  };
}

/**
 * DataLab API response for initial OCR request
 */
interface DataLabInitialResponse {
  success: boolean;
  error: string | null;
  request_id: string;
  request_check_url: string;
}

/**
 * DataLab API response for status check
 */
interface DataLabStatusResponse {
  status: 'complete' | 'processing' | 'failed';
  success?: boolean;
  pages?: Array<{
    page: number;
    text_lines?: Array<{
      text: string;
      confidence?: number;
      bbox?: number[];
      polygon?: number[][];
    }>;
  }>;
  page_count?: number;
  error?: string;
  total_cost?: number;
}

/**
 * Convert base64 data URL to File object for multipart upload
 */
function dataURLtoFile(dataUrl: string, filename: string): File {
  // Extract the base64 data and mime type
  const arr = dataUrl.split(',');
  const mimeMatch = arr[0].match(/:(.*?);/);
  const mime = mimeMatch ? mimeMatch[1] : 'image/png';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);

  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }

  return new File([u8arr], filename, { type: mime });
}

/**
 * Poll DataLab API for OCR results
 * Implements exponential backoff with max timeout
 */
async function pollForResults(
  checkUrl: string,
  apiKey: string,
  maxAttempts: number = 60,
  initialDelayMs: number = 2000
): Promise<DataLabStatusResponse> {
  let attempt = 0;
  let delay = initialDelayMs;

  while (attempt < maxAttempts) {
    attempt++;

    console.log(`🔄 [DataLab OCR] Polling attempt ${attempt}/${maxAttempts}...`);

    try {
      const response = await fetch(checkUrl, {
        method: 'GET',
        headers: {
          'X-API-Key': apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status} ${response.statusText}`);
      }

      const data: DataLabStatusResponse = await response.json();

      if (data.status === 'complete') {
        console.log(`✅ [DataLab OCR] Processing complete!`);
        return data;
      }

      if (data.status === 'failed') {
        throw new Error(`OCR processing failed: ${data.error || 'Unknown error'}`);
      }

      // Still processing, wait before next poll
      console.log(`⏳ [DataLab OCR] Still processing... waiting ${delay}ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Exponential backoff with cap at 10 seconds
      delay = Math.min(delay * 1.2, 10000);
    } catch (error) {
      console.error(`❌ [DataLab OCR] Polling error on attempt ${attempt}:`, error);

      // If we're not at max attempts, retry after delay
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw new Error(
    `OCR processing timeout: exceeded ${maxAttempts} polling attempts (${(maxAttempts * initialDelayMs) / 1000}s)`
  );
}

/**
 * Calculate OCR confidence based on DataLab output quality
 */
function calculateOCRConfidence(
  markdown: string,
  textLines?: Array<{ text: string; confidence?: number }>
): 'high' | 'medium' | 'low' {
  const textLength = markdown.trim().length;

  // If we have confidence scores from API, use them
  if (textLines && textLines.length > 0) {
    const avgConfidence =
      textLines.reduce((sum, line) => sum + (line.confidence || 0), 0) / textLines.length;

    if (avgConfidence > 0.85) return 'high';
    if (avgConfidence > 0.7) return 'medium';
    return 'low';
  }

  // Fallback heuristics based on content quality
  const hasStructure =
    markdown.includes('#') ||
    markdown.includes('|') ||
    markdown.includes('**') ||
    markdown.includes('-') ||
    markdown.includes('*');

  const wordCount = markdown.trim().split(/\s+/).length;
  const specialCharRatio =
    (markdown.match(/[^a-zA-Z0-9\s\n.,;:!?'"()\-–—]/g) || []).length / textLength;

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

  // Default to medium for anything else
  return 'medium';
}

/**
 * Process single image with DataLab Surya OCR
 */
export async function processImageOCR(
  imageBase64: string,
  mediaType: string
): Promise<OCRResult> {
  const startTime = Date.now();

  try {
    console.log(`🔍 [DataLab OCR] Starting Surya OCR for ${mediaType} image`);

    // Get API key
    const apiKey = process.env.DATALAB_API_KEY;
    if (!apiKey) {
      throw new Error('DATALAB_API_KEY environment variable is not set');
    }

    // Ensure we have a proper data URL
    const dataUrl = imageBase64.includes('data:')
      ? imageBase64
      : `data:${mediaType};base64,${imageBase64}`;

    console.log(`📊 [DataLab OCR] Image size: ${imageBase64.length} bytes (base64)`);
    console.log(`📊 [DataLab OCR] Media type: ${mediaType}`);

    // Convert to File object for multipart upload
    const file = dataURLtoFile(dataUrl, 'document.png');

    // Step 1: Submit OCR request
    console.log(`🔄 [DataLab OCR] Submitting to DataLab API...`);

    const formData = new FormData();
    formData.append('file', file);

    const submitResponse = await fetch('https://www.datalab.to/api/v1/ocr', {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey,
      },
      body: formData,
    });

    if (!submitResponse.ok) {
      const errorText = await submitResponse.text();
      throw new Error(
        `DataLab API request failed: ${submitResponse.status} ${submitResponse.statusText} - ${errorText}`
      );
    }

    const submitData: DataLabInitialResponse = await submitResponse.json();

    if (!submitData.success || !submitData.request_id) {
      throw new Error(`DataLab API error: ${submitData.error || 'Unknown error'}`);
    }

    console.log(`✅ [DataLab OCR] Request submitted successfully`);
    console.log(`📋 [DataLab OCR] Request ID: ${submitData.request_id}`);
    console.log(`🔗 [DataLab OCR] Check URL: ${submitData.request_check_url}`);

    // Step 2: Poll for results
    const resultData = await pollForResults(submitData.request_check_url, apiKey);

    if (!resultData.pages || resultData.pages.length === 0) {
      console.error('❌ [DataLab OCR] Invalid response structure:', JSON.stringify(resultData, null, 2));
      throw new Error('DataLab API returned no pages in response');
    }

    // Extract text from all pages and convert to markdown
    let extractedMarkdown = '';
    const allTextLines: Array<{ text: string; confidence?: number }> = [];

    for (const page of resultData.pages) {
      if (page.text_lines && page.text_lines.length > 0) {
        // Collect all text lines with confidence scores
        allTextLines.push(...page.text_lines);

        // Join text lines with newlines to preserve structure
        const pageText = page.text_lines.map(line => line.text).join('\n');

        if (resultData.pages.length > 1) {
          extractedMarkdown += `\n\n--- Page ${page.page} ---\n\n${pageText}`;
        } else {
          extractedMarkdown += pageText;
        }
      }
    }

    if (!extractedMarkdown.trim()) {
      throw new Error('DataLab API returned empty text result');
    }

    const pageCount = resultData.page_count || resultData.pages.length;

    console.log(`✅ [DataLab OCR] Extraction complete`);
    console.log(`📊 [DataLab OCR] Extracted ${extractedMarkdown.length} characters`);
    console.log(`📊 [DataLab OCR] Pages: ${pageCount}`);
    console.log(`📊 [DataLab OCR] Text lines: ${allTextLines.length}`);
    console.log(
      `📄 [DataLab OCR] OUTPUT (first 1000 chars):\n${extractedMarkdown.substring(0, 1000)}`
    );
    console.log(
      `📄 [DataLab OCR] OUTPUT (last 500 chars):\n${extractedMarkdown.substring(Math.max(0, extractedMarkdown.length - 500))}`
    );

    // Calculate confidence
    const confidence = calculateOCRConfidence(extractedMarkdown, allTextLines);

    const processingTime = Date.now() - startTime;

    console.log(
      `✅ [DataLab OCR] Complete in ${processingTime}ms (confidence: ${confidence})`
    );

    return {
      markdown: extractedMarkdown,
      pages: pageCount,
      confidence,
      metadata: {
        processingTime,
        model: 'surya-ocr',
        requestId: submitData.request_id,
      },
    };
  } catch (error) {
    console.error('❌ [DataLab OCR] Error:', error);
    throw new Error(
      `DataLab OCR failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Process multiple images sequentially (DataLab API best practice)
 * Note: Processing sequentially to avoid rate limits and ensure clean request handling
 */
export async function processMultipleImagesOCR(
  images: Array<{ data: string; mediaType: string }>
): Promise<OCRResult> {
  const startTime = Date.now();

  console.log(`🔍 [DataLab OCR] Processing ${images.length} images with Surya OCR...`);

  const results: OCRResult[] = [];
  const errors: string[] = [];

  // Process images sequentially
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    console.log(`📄 [DataLab OCR] Processing image ${i + 1}/${images.length}...`);

    try {
      const result = await processImageOCR(img.data, img.mediaType);
      results.push(result);
    } catch (error) {
      const errorMsg = `Image ${i + 1} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
      console.error(`❌ [DataLab OCR] ${errorMsg}`);
      errors.push(errorMsg);
    }
  }

  if (results.length === 0) {
    throw new Error(`All OCR attempts failed:\n${errors.join('\n')}`);
  }

  // Combine all markdown results
  const combinedMarkdown = results
    .map((result, idx) => {
      if (results.length > 1) {
        return `### Document ${idx + 1}\n\n${result.markdown}`;
      }
      return result.markdown;
    })
    .join('\n\n---\n\n');

  console.log(
    `📄 [DataLab OCR] COMBINED OUTPUT (first 1000 chars):\n${combinedMarkdown.substring(0, 1000)}`
  );
  console.log(
    `📄 [DataLab OCR] COMBINED OUTPUT (last 500 chars):\n${combinedMarkdown.substring(Math.max(0, combinedMarkdown.length - 500))}`
  );

  // Calculate overall confidence (minimum of all confidences)
  const overallConfidence =
    results.every((r) => r.confidence === 'high')
      ? 'high'
      : results.some((r) => r.confidence === 'low')
        ? 'low'
        : 'medium';

  const totalPages = results.reduce((sum, r) => sum + r.pages, 0);
  const processingTime = Date.now() - startTime;

  console.log(
    `✅ [DataLab OCR] All images processed in ${processingTime}ms (${results.length}/${images.length} successful)`
  );

  if (errors.length > 0) {
    console.warn(`⚠️ [DataLab OCR] ${errors.length} image(s) failed:`, errors);
  }

  return {
    markdown: combinedMarkdown,
    pages: totalPages,
    confidence: overallConfidence,
    metadata: {
      processingTime,
      model: 'surya-ocr',
      requestId: results[0].metadata.requestId,
    },
  };
}

/**
 * Stream Buffering and Refusal Detection
 *
 * Buffers the initial portion of a streaming response to detect refusals early.
 * This allows us to abort the stream and retry before the user sees the refusal.
 */

import type { StreamTextResult } from 'ai';
import { detectRefusal, estimateTokenCount } from './refusal-detection';

export interface BufferedStreamResult {
  isRefusal: boolean;
  bufferedText: string;
  confidence: 'high' | 'medium' | 'low';
  matchedPattern?: string;
}

/**
 * Buffers the initial portion of a text stream to detect refusals
 *
 * @param result - The StreamTextResult from streamText()
 * @param maxTokensToBuffer - Maximum tokens to buffer before deciding (default: 150)
 * @returns Detection result with buffered text
 */
export async function bufferAndCheckRefusal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: StreamTextResult<Record<string, any>, Record<string, any>>,
  maxTokensToBuffer: number = 150
): Promise<BufferedStreamResult> {
  let bufferedText = '';
  let tokenCount = 0;

  try {
    // Read from textStream until we have enough tokens or stream ends
    for await (const chunk of result.textStream) {
      bufferedText += chunk;
      tokenCount = estimateTokenCount(bufferedText);

      // Stop buffering once we have enough tokens to make a decision
      if (tokenCount >= maxTokensToBuffer) {
        break;
      }
    }

    // Detect refusal in buffered text
    const detection = detectRefusal(bufferedText, tokenCount);

    return {
      isRefusal: detection.isRefusal,
      bufferedText,
      confidence: detection.confidence,
      matchedPattern: detection.matchedPattern,
    };
  } catch (error) {
    console.error('Error during stream buffering:', error);

    // If streaming fails, treat as non-refusal to allow normal error handling
    return {
      isRefusal: false,
      bufferedText,
      confidence: 'low',
    };
  }
}

/**
 * Consumes the entire stream and returns the full text
 * Used when we need to save the refusal message for the user
 *
 * @param result - The StreamTextResult from streamText()
 * @returns Full text from the stream
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function consumeFullStream(result: StreamTextResult<Record<string, any>, Record<string, any>>): Promise<string> {
  let fullText = '';

  try {
    for await (const chunk of result.textStream) {
      fullText += chunk;
    }
    return fullText;
  } catch (error) {
    console.error('Error consuming stream:', error);
    return fullText || 'An error occurred while processing the response.';
  }
}

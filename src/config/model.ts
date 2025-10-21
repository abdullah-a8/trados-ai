/**
 * AI Model configuration for TRADOS by GLI
 *
 * Using Gemini 2.5 Flash for superior vision OCR and translation
 * - Better instruction following than GPT-4o
 * - Fewer refusals on document translation
 * - 95%+ OCR accuracy on complex documents
 * - Improved image understanding (Sep 2025 update)
 * - 1M token context window (processes ~1,500 pages)
 * - Training data through January 2025
 *
 * Previous models:
 * - 'gpt-4o' - Had refusal issues with official documents
 * - 'gemini-2.0-flash' - Older version, use 2.5 instead
 */

export const MODEL_CONFIG = {
  provider: 'google',
  // Using gemini-2.5-flash for optimized document translation
  modelId: 'gemini-2.5-flash',
  maxDuration: 300, // seconds - aligned with vercel.json
} as const;

export type ModelConfig = typeof MODEL_CONFIG;

/**
 * AI Model configuration for TRADOS AI
 */

export const MODEL_CONFIG = {
  provider: 'openai',
  modelId: 'gpt-5-2025-08-07',
  maxDuration: 30, // seconds
} as const;

export type ModelConfig = typeof MODEL_CONFIG;

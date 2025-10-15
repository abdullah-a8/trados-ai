/**
 * AI Model configuration for TRADOS AI
 * 
 * Using gpt-4o (optimized) for faster vision processing
 * gpt-4o is significantly faster than gpt-4 for image tasks while maintaining quality
 * 
 * Model options (from fastest to most capable):
 * - 'gpt-4o-mini' - Fastest, cheapest, good for simple tasks
 * - 'gpt-4o' - Balanced speed and quality (RECOMMENDED)
 * - 'gpt-5-mini-2025-08-07' - Current model, slower
 */

export const MODEL_CONFIG = {
  provider: 'openai',
  // Using gpt-4o for optimized speed on vision and text tasks
  modelId: 'gpt-4o',
  maxDuration: 300, // seconds - aligned with vercel.json
} as const;

export type ModelConfig = typeof MODEL_CONFIG;

/**
 * AI Model configuration for TRADOS by GLI
 *
 * MIGRATED TO OPENROUTER:
 * All AI models are now accessed through OpenRouter for unified API management.
 * See /src/config/openrouter.ts for complete configuration.
 *
 * Benefits of OpenRouter:
 * - Single API key for 200+ models
 * - Easy model switching without code changes
 * - Automatic fallbacks and load balancing
 * - Cost optimization across providers
 * - Consistent API interface
 *
 * Current default: Gemini 2.0 Flash via OpenRouter
 * - Superior vision OCR and translation
 * - Better instruction following than GPT-4o
 * - Fewer refusals on document translation
 * - 95%+ OCR accuracy on complex documents
 * - 1M token context window (processes ~1,500 pages)
 * - Free tier available
 */

import {
  DEFAULT_MODEL,
  TASK_MODELS,
  OPENROUTER_CONFIG,
  OPENROUTER_MODELS,
  type OpenRouterModelId,
} from './openrouter';

export const MODEL_CONFIG = {
  provider: 'openrouter' as const,
  // Default model for general use
  modelId: DEFAULT_MODEL,
  // Task-specific models
  models: TASK_MODELS,
  // Available models
  availableModels: OPENROUTER_MODELS,
  maxDuration: OPENROUTER_CONFIG.maxDuration,
} as const;

export type ModelConfig = typeof MODEL_CONFIG;
export type { OpenRouterModelId };

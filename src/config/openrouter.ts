/**
 * OpenRouter AI Provider Configuration for TRADOS by GLI
 *
 * This module provides a unified interface to access multiple AI models through OpenRouter.
 * OpenRouter allows switching between 200+ models from different providers using a single API.
 *
 * Benefits:
 * - Single API key for all models
 * - Easy model switching without code changes
 * - Consistent API interface via Vercel AI SDK
 * - Automatic fallbacks and load balancing
 * - Cost optimization across providers
 */

import { createOpenRouter } from '@openrouter/ai-sdk-provider';

/**
 * Available AI models through OpenRouter
 * Format: 'provider/model-name'
 */
export const OPENROUTER_MODELS = {
  // OpenRouter's Own Models
  POLARIS_ALPHA: 'openrouter/polaris-alpha',

  // Google Models
  GEMINI_2_0_FLASH: 'google/gemini-2.0-flash-exp:free',
  GEMINI_2_0_FLASH_THINKING: 'google/gemini-2.0-flash-thinking-exp:free',
  GEMINI_PRO_1_5: 'google/gemini-pro-1.5',

  // OpenAI Models
  GPT_4O: 'openai/gpt-4o',
  GPT_4O_MINI: 'openai/gpt-4o-mini',
  GPT_4_TURBO: 'openai/gpt-4-turbo',

  // Anthropic Models
  CLAUDE_3_5_SONNET: 'anthropic/claude-3.5-sonnet',
  CLAUDE_3_OPUS: 'anthropic/claude-3-opus',
  CLAUDE_3_HAIKU: 'anthropic/claude-3-haiku',

  // DeepSeek Models
  DEEPSEEK_CHAT: 'deepseek/deepseek-chat',
  DEEPSEEK_REASONER: 'deepseek/deepseek-r1',

  // Meta Models
  LLAMA_3_3_70B: 'meta-llama/llama-3.3-70b-instruct',
  LLAMA_3_1_405B: 'meta-llama/llama-3.1-405b-instruct',

  // Specialized Models
  QWEN_2_5_72B: 'qwen/qwen-2.5-72b-instruct',
  MISTRAL_LARGE: 'mistralai/mistral-large',
} as const;

/**
 * Default model configuration
 * Using Polaris Alpha - OpenRouter's own high-performance model
 * - Optimized for general tasks and reasoning
 * - Strong multilingual support (EN, FR, AR)
 * - Excellent instruction following
 * - Competitive performance at lower cost
 */
export const DEFAULT_MODEL = OPENROUTER_MODELS.POLARIS_ALPHA;

/**
 * Model configuration for different tasks
 */
export const TASK_MODELS = {
  // Translation tasks - using Polaris Alpha for quality and multilingual support
  translation: OPENROUTER_MODELS.POLARIS_ALPHA,

  // General chat - Polaris Alpha for balanced performance
  chat: OPENROUTER_MODELS.POLARIS_ALPHA,

  // Title generation - fast and efficient
  titleGeneration: OPENROUTER_MODELS.GEMINI_2_0_FLASH,

  // Complex reasoning tasks
  reasoning: OPENROUTER_MODELS.DEEPSEEK_REASONER,
} as const;

/**
 * Model selection mapping for backward compatibility
 * Maps old model IDs to OpenRouter model IDs
 */
export const MODEL_MIGRATION_MAP: Record<string, string> = {
  'gemini-2.5-flash': OPENROUTER_MODELS.GEMINI_2_0_FLASH,
  'gemini-2.0-flash': OPENROUTER_MODELS.GEMINI_2_0_FLASH,
  'gpt-4o': OPENROUTER_MODELS.GPT_4O,
  'deepseek-chat': OPENROUTER_MODELS.DEEPSEEK_CHAT,
};

/**
 * Initialize OpenRouter provider with API key
 * This creates a provider instance that works with Vercel AI SDK
 */
export function createOpenRouterProvider() {
  const apiKey = process.env.OPENROUTER_API_KEY;

  if (!apiKey) {
    throw new Error(
      'OPENROUTER_API_KEY environment variable is not set. ' +
      'Please add it to your .env file. ' +
      'Get your API key from: https://openrouter.ai/keys'
    );
  }

  return createOpenRouter({
    apiKey,
  });
}

/**
 * Get a model instance from OpenRouter
 * @param modelId - OpenRouter model ID (e.g., 'google/gemini-2.0-flash-exp:free')
 * @returns Model instance compatible with Vercel AI SDK
 */
export function getOpenRouterModel(modelId: string) {
  const provider = createOpenRouterProvider();

  // Map old model IDs to new OpenRouter format
  const mappedModelId = MODEL_MIGRATION_MAP[modelId] || modelId;

  return provider(mappedModelId);
}

/**
 * Validate that OpenRouter API key is configured
 * @throws Error if API key is missing
 */
export function validateOpenRouterConfig(): void {
  if (!process.env.OPENROUTER_API_KEY) {
    throw new Error(
      'OPENROUTER_API_KEY is not configured. ' +
      'Please add it to your .env file. ' +
      'Visit https://openrouter.ai/keys to get your API key.'
    );
  }
}

/**
 * Configuration constants
 */
export const OPENROUTER_CONFIG = {
  // API endpoint (automatically handled by SDK)
  baseURL: 'https://openrouter.ai/api/v1',

  // Maximum request duration (aligned with Vercel Pro plan limits)
  maxDuration: 300, // seconds

  // Default parameters for requests
  defaultParams: {
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1.0,
  },
} as const;

export type OpenRouterModelId = typeof OPENROUTER_MODELS[keyof typeof OPENROUTER_MODELS];

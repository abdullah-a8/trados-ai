/**
 * DeepL Translation Service
 *
 * Handles professional translation using DeepL API
 * Optimized for official document translation with formality control
 */

// import * as deepl from 'deepl-node';
import { detectConversationLanguage } from './language-detection';
import type { UIMessage } from 'ai';

// Lazy initialization of DeepL client
// let translator: deepl.Translator | null = null;

// function getTranslator(): deepl.Translator {
//   if (!translator) {
//     if (!process.env.DEEPL_API_KEY) {
//       throw new Error('DEEPL_API_KEY environment variable is not set');
//     }
//     translator = new deepl.Translator(process.env.DEEPL_API_KEY);
//   }
//   return translator;
// }

/**
 * Supported target languages (DeepL format)
 */
export type TargetLanguage =
  | 'en-US' | 'en-GB' // English
  | 'fr'              // French
  | 'ar'              // Arabic
  | 'es'              // Spanish
  | 'de'              // German
  | 'it'              // Italian
  | 'pt-BR' | 'pt-PT' // Portuguese
  | 'ru'              // Russian
  | 'zh'              // Chinese
  | 'ja'              // Japanese
  | 'nl'              // Dutch
  | 'pl';             // Polish

/**
 * Language code mapping: User intent → DeepL format
 */
const LANGUAGE_MAP: Record<string, TargetLanguage> = {
  'en': 'en-US',
  'english': 'en-US',
  'anglais': 'en-US',
  'الإنجليزية': 'en-US',

  'fr': 'fr',
  'french': 'fr',
  'français': 'fr',
  'الفرنسية': 'fr',

  'ar': 'ar',
  'arabic': 'ar',
  'arabe': 'ar',
  'العربية': 'ar',

  'es': 'es',
  'spanish': 'es',
  'espagnol': 'es',

  'de': 'de',
  'german': 'de',
  'allemand': 'de',
};

/**
 * Translation result interface
 */
export interface TranslationResult {
  text: string;
  sourceLanguage: string;
  targetLanguage: TargetLanguage;
  billedCharacters: number;
  metadata: {
    processingTime: number;
  };
}

/**
 * Detect target language from user message
 */
export function detectTargetLanguage(
  userMessage: UIMessage,
  previousMessages: UIMessage[]
): TargetLanguage {
  // Get conversation language from existing detection
  const conversationLang = detectConversationLanguage(
    userMessage,
    previousMessages,
    ''
  );

  // Extract text from user message
  const textParts = userMessage.parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text.toLowerCase());

  const fullText = textParts.join(' ');

  // Search for language indicators in order of priority
  const indicators = [
    'translate to',
    'traduire en',
    'traduction en',
    'ترجم إلى',
    'translation to',
    'en anglais',
    'en français',
    'to english',
    'to french',
    'in english',
    'in french',
  ];

  for (const indicator of indicators) {
    if (fullText.includes(indicator)) {
      // Extract language after indicator
      const words = fullText.split(indicator)[1]?.trim().split(' ');
      if (words && words.length > 0) {
        const targetLang = words[0].replace(/[.,;:!?'"]/g, '');
        if (LANGUAGE_MAP[targetLang]) {
          return LANGUAGE_MAP[targetLang];
        }
      }
    }
  }

  // Default based on conversation language
  // If user is speaking French, likely wants English translation
  // If user is speaking English, likely wants French translation
  if (conversationLang === 'fr') {
    return 'en-US';
  } else if (conversationLang === 'en') {
    return 'fr';
  } else if (conversationLang === 'ar') {
    return 'fr'; // Arabic speakers in TRADOS context typically need French
  }

  // Ultimate fallback
  return 'fr'; // TRADOS is French-based company
}

/**
 * Translate markdown text using DeepL
 */
export async function translateMarkdown(
  _markdownText: string,
  _targetLang: TargetLanguage,
  _options?: {
    formality?: 'default' | 'more' | 'less' | 'prefer_more' | 'prefer_less';
    context?: string;
  }
): Promise<TranslationResult> {
  // const startTime = Date.now();

  // try {
  //   console.log(`🌍 [TRANSLATION] Translating to ${targetLang}...`);

  //   // DeepL API call
  //   const result = await getTranslator().translateText(
  //     markdownText,
  //     null, // Auto-detect source language
  //     targetLang,
  //     {
  //       preserveFormatting: true,
  //       formality: options?.formality || 'prefer_more', // Formal for official docs
  //       context: options?.context,
  //     }
  //   );

  //   const processingTime = Date.now() - startTime;

  //   console.log(
  //     `✅ [TRANSLATION] Complete in ${processingTime}ms (${result.billedCharacters} chars)`
  //   );

  //   return {
  //     text: result.text,
  //     sourceLanguage: result.detectedSourceLang,
  //     targetLanguage: targetLang,
  //     billedCharacters: result.billedCharacters || 0,
  //     metadata: {
  //       processingTime,
  //     },
  //   };
  // } catch (error) {
  //   console.error('❌ [TRANSLATION] Error:', error);
  //   throw new Error(
  //     `DeepL translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
  //   );
  // }
  
  throw new Error('DeepL translation is currently disabled. Install deepl-node package to enable.');
}


/**
 * Get available DeepL usage (for monitoring)
 */
export async function getDeepLUsage(): Promise<{
  characterCount: number;
  characterLimit: number;
  percentUsed: number;
}> {
  // try {
  //   const usage = await getTranslator().getUsage();

  //   if (usage.character) {
  //     return {
  //       characterCount: usage.character.count,
  //       characterLimit: usage.character.limit,
  //       percentUsed: (usage.character.count / usage.character.limit) * 100,
  //     };
  //   }

  //   throw new Error('Usage data not available');
  // } catch (error) {
  //   console.error('❌ [DEEPL] Failed to get usage:', error);
  //   throw error;
  // }
  
  throw new Error('DeepL translation is currently disabled. Install deepl-node package to enable.');
}

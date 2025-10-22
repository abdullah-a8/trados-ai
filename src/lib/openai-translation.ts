/**
 * OpenAI GPT-4o Translation Service
 *
 * Handles professional translation using GPT-4o
 * Optimized for official document translation with format preservation
 */

import OpenAI from 'openai';
import { detectConversationLanguage } from './language-detection';
import type { UIMessage } from 'ai';

// Lazy initialization of OpenAI client
let openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!openaiClient) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

/**
 * Supported target languages (currently: English, French, Arabic)
 */
export type TargetLanguage =
  | 'en-US' // English
  | 'fr'    // French
  | 'ar';   // Arabic

/**
 * Language code mapping: User intent → Language format
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
 * Language name mapping for GPT-4o prompts
 */
const LANGUAGE_NAMES: Record<TargetLanguage, string> = {
  'en-US': 'English',
  'fr': 'French',
  'ar': 'Arabic',
};

/**
 * Translation result interface
 */
export interface TranslationResult {
  text: string;
  targetLanguage: TargetLanguage;
  metadata: {
    processingTime: number;
    model: string;
    tokensUsed: number;
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
 * Translate markdown text using GPT-4o
 */
export async function translateMarkdown(
  markdownText: string,
  targetLang: TargetLanguage
): Promise<TranslationResult> {
  const startTime = Date.now();

  try {
    console.log(`🌍 [TRANSLATION] Translating to ${targetLang} using GPT-4o...`);

    const targetLanguageName = LANGUAGE_NAMES[targetLang];

    // GPT-4o translation with strict format preservation instructions
    const completion = await getOpenAIClient().chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: `You are a professional translator. Translate the following text to ${targetLanguageName}.

CRITICAL REQUIREMENTS:
1. Provide a faithful and exact 1-to-1 official translation
2. Do NOT make any changes, additions, or omissions in the translation
3. Preserve the EXACT same format as the source text (markdown formatting, headings, tables, lists, etc.)
4. Keep all markdown syntax intact (# headings, **bold**, | tables |, - lists, etc.)
5. Maintain the same structure and layout as the original
6. NEVER wrap the response in markdown code blocks (\`\`\`markdown or \`\`\`)
7. NEVER wrap the response in text blocks or any other formatting
8. Output ONLY the translated text in markdown format directly
9. Preserve all numbers, dates, identifiers, and formatting EXACTLY
10. The output must be ready to display as-is, with the same format as the source

Text to translate:

${markdownText}`,
        },
      ],
      temperature: 0.3, // Low temperature for consistent, accurate translation
      max_tokens: 4096,
    });

    const translatedText = completion.choices[0]?.message?.content || '';
    const tokensUsed = completion.usage?.total_tokens || 0;

    const processingTime = Date.now() - startTime;

    console.log(
      `✅ [TRANSLATION] Complete in ${processingTime}ms (${translatedText.length} chars)`
    );
    console.log(`📊 [TRANSLATION] Tokens used: ${tokensUsed}`);
    console.log(`📥 [TRANSLATION] OUTPUT (first 1000 chars):\n${translatedText.substring(0, 1000)}\n`);
    console.log(`📥 [TRANSLATION] OUTPUT (last 500 chars):\n${translatedText.substring(Math.max(0, translatedText.length - 500))}\n`);

    return {
      text: translatedText,
      targetLanguage: targetLang,
      metadata: {
        processingTime,
        model: 'gpt-4o',
        tokensUsed,
      },
    };
  } catch (error) {
    console.error('❌ [TRANSLATION] Error:', error);
    throw new Error(
      `GPT-4o translation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

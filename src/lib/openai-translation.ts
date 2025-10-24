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
 * Translate markdown text using GPT-4o (non-streaming version)
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
          content: `You are a professional legal document translator. Translate the following text to ${targetLanguageName}.

CRITICAL REQUIREMENTS - TRANSLATION ACCURACY (HIGHEST PRIORITY):
1. This is a LEGAL/OFFICIAL DOCUMENT - the translation must be accurate and suitable for official use
2. Ensure COMPLETE ACCURACY in respect to legal terminology and context
3. The translation MUST preserve the exact meaning and legal validity of the original text
4. All information must be translated ACCURATELY and COMPLETELY as per the original text
5. VERIFY that every piece of information from the original is correctly represented in the translation
6. Do NOT make any additions or changes to the content
7. OMISSIONS ARE ONLY ALLOWED to remove repetitions - if the OCR text contains duplicate information, include it only ONCE
8. Preserve all numbers, dates, names, identifiers, legal terms, and technical details EXACTLY

CRITICAL REQUIREMENTS - FORMATTING & FLOW (SECONDARY PRIORITY):
9. After ensuring translation accuracy, apply proper formatting:
   - Preserve the EXACT same structure and layout as the original document
   - Keep all markdown syntax intact (# headings, **bold**, | tables |, - lists, etc.)
   - Maintain the natural flow of the original text
10. NO REPETITIONS - ensure information flows naturally without duplicating any content
11. Each piece of information should appear only ONCE, exactly as in the original
12. The flow should match the original text structure - do not repeat sections, paragraphs, or sentences
13. Use natural, fluent phrasing in the target language while maintaining legal precision

OUTPUT REQUIREMENTS:
14. NEVER wrap the response in markdown code blocks (\`\`\`markdown or \`\`\`)
15. NEVER wrap the response in text blocks or any other formatting
16. Output ONLY the translated text in markdown format directly
17. The output must be ready to display as-is, suitable for official/legal document use

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

/**
 * Get translation prompt for GPT-4o
 */
export function getTranslationPrompt(
  markdownText: string,
  targetLang: TargetLanguage
): string {
  const targetLanguageName = LANGUAGE_NAMES[targetLang];

  return `You are a professional legal document translator. Translate the following text to ${targetLanguageName}.

CRITICAL REQUIREMENTS - TRANSLATION ACCURACY (HIGHEST PRIORITY):
1. This is a LEGAL/OFFICIAL DOCUMENT - the translation must be accurate and suitable for official use
2. Ensure COMPLETE ACCURACY in respect to legal terminology and context
3. The translation MUST preserve the exact meaning and legal validity of the original text
4. All information must be translated ACCURATELY and COMPLETELY as per the original text
5. VERIFY that every piece of information from the original is correctly represented in the translation
6. Do NOT make any additions or changes to the content
7. OMISSIONS ARE ONLY ALLOWED to remove repetitions - if the OCR text contains duplicate information, include it only ONCE
8. Preserve all numbers, dates, names, identifiers, legal terms, and technical details EXACTLY

CRITICAL REQUIREMENTS - FORMATTING & FLOW (SECONDARY PRIORITY):
9. After ensuring translation accuracy, apply proper formatting:
   - Preserve the EXACT same structure and layout as the original document
   - Keep all markdown syntax intact (# headings, **bold**, | tables |, - lists, etc.)
   - Maintain the natural flow of the original text
10. NO REPETITIONS - ensure information flows naturally without duplicating any content
11. Each piece of information should appear only ONCE, exactly as in the original
12. The flow should match the original text structure - do not repeat sections, paragraphs, or sentences
13. Use natural, fluent phrasing in the target language while maintaining legal precision

OUTPUT REQUIREMENTS:
14. NEVER wrap the response in markdown code blocks (\`\`\`markdown or \`\`\`)
15. NEVER wrap the response in text blocks or any other formatting
16. Output ONLY the translated text in markdown format directly
17. The output must be ready to display as-is, suitable for official/legal document use

Text to translate:

${markdownText}`;
}
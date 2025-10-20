/**
 * Language Detection Utility
 *
 * Detects the conversation language using multiple strategies:
 * 1. Refusal text language (most accurate - GPT-4o chose the right language)
 * 2. Unicode script detection (reliable for non-Latin scripts)
 * 3. Keyword frequency analysis (for Latin-script languages)
 * 4. Target language extraction from user instruction
 */

import { UIMessage } from 'ai';

export type SupportedLanguage = 'en' | 'fr' | 'ar';

/**
 * Detects the conversation language using hybrid approach
 *
 * @param message - Current user message
 * @param previousMessages - Previous messages in conversation
 * @param refusalText - Optional refusal text from GPT-4o (most accurate source)
 * @returns Detected language code
 */
export function detectConversationLanguage(
  message: UIMessage,
  previousMessages: UIMessage[] = [],
  refusalText?: string
): SupportedLanguage {
  // Priority 1: Detect from refusal text (most accurate)
  if (refusalText) {
    const fromRefusal = detectLanguageFromRefusal(refusalText);
    if (fromRefusal !== 'en') {
      // Trust non-English detection from refusal
      return fromRefusal;
    }
  }

  // Extract all text from conversation
  const allMessages = [...previousMessages, message];
  const conversationText = extractAllText(allMessages);

  // Priority 2: Unicode script detection (reliable for non-Latin scripts)
  const scriptLanguage = detectFromUnicodeScript(conversationText);
  if (scriptLanguage) {
    return scriptLanguage;
  }

  // Priority 3: Keyword frequency analysis (for Latin-script languages)
  const keywordLanguage = detectFromKeywords(conversationText);
  if (keywordLanguage) {
    return keywordLanguage;
  }

  // Priority 4: Extract target language from instruction
  const targetLanguage = extractTargetLanguage(message);
  if (targetLanguage) {
    return targetLanguage;
  }

  // Default: English
  return 'en';
}

/**
 * Detects language from GPT-4o's refusal text
 * This is the most accurate method since GPT-4o already chose the appropriate language
 */
function detectLanguageFromRefusal(text: string): SupportedLanguage {
  // French indicators
  if (/je (ne peux|dois|suis)|traduire|désolé|impossible/i.test(text)) {
    return 'fr';
  }

  // Arabic indicators
  if (/لا (أستطيع|يمكنني)|ترجمة|آسف/i.test(text)) {
    return 'ar';
  }

  return 'en';
}

/**
 * Detects language based on Unicode character ranges
 * Highly reliable for non-Latin scripts
 */
function detectFromUnicodeScript(text: string): SupportedLanguage | null {
  // Arabic (including Persian, Urdu)
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(text)) {
    return 'ar';
  }

  return null;
}

/**
 * Detects language based on keyword frequency
 * Good for Latin-script European languages
 */
function detectFromKeywords(text: string): SupportedLanguage | null {
  const lowerText = text.toLowerCase();

  // Calculate scores for French (only Latin-script language we support)
  const frenchScore = countMatches(lowerText, [
    'traduire',
    'traduction',
    'français',
    'certificat',
    'document',
    'en français',
    'le',
    'la',
    'les',
    'des',
    'est',
    'dans',
  ]);

  // Return French if we have at least 2 matches
  if (frenchScore >= 2) {
    return 'fr';
  }

  return null;
}

/**
 * Extracts target language from user instruction
 * Matches patterns like "translate to French", "en français", "إلى العربية"
 */
function extractTargetLanguage(message: UIMessage): SupportedLanguage | null {
  const text = extractAllText([message]).toLowerCase();

  // French
  if (/\b(to|en|in|vers|à|إلى)\s+(french|français)/i.test(text)) {
    return 'fr';
  }

  // Arabic
  if (/\b(to|إلى)\s+(arabic|عربي|العربية)/i.test(text)) {
    return 'ar';
  }

  // English
  if (/\b(to|in|en|à|إلى)\s+(english|anglais|الإنجليزية)/i.test(text)) {
    return 'en';
  }

  return null;
}

/**
 * Helper: Extracts all text content from messages
 */
function extractAllText(messages: UIMessage[]): string {
  return messages
    .filter(m => m.role === 'user')
    .flatMap(m => m.parts || [])
    .filter(p => p.type === 'text')
    .map(p => ('text' in p ? p.text : ''))
    .join(' ');
}

/**
 * Helper: Counts matches of keywords in text
 */
function countMatches(text: string, keywords: string[]): number {
  let count = 0;
  for (const keyword of keywords) {
    const regex = new RegExp(`\\b${keyword}\\b`, 'gi');
    const matches = text.match(regex);
    if (matches) {
      count += matches.length;
    }
  }
  return count;
}

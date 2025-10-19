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

export type SupportedLanguage = 'en' | 'fr' | 'ar' | 'es' | 'de' | 'pt' | 'it' | 'ru' | 'tr' | 'nl' | 'pl' | 'ja' | 'ko' | 'zh';

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

  // Spanish indicators
  if (/no puedo|traducir|lo siento/i.test(text)) {
    return 'es';
  }

  // German indicators
  if (/ich kann nicht|übersetzen|tut mir leid/i.test(text)) {
    return 'de';
  }

  // Portuguese indicators
  if (/não posso|traduzir|desculpe/i.test(text)) {
    return 'pt';
  }

  // Italian indicators
  if (/non posso|tradurre|mi dispiace/i.test(text)) {
    return 'it';
  }

  // Russian indicators
  if (/не могу|перевести|извините/i.test(text)) {
    return 'ru';
  }

  // Turkish indicators
  if (/yapamam|çeviremem|üzgünüm/i.test(text)) {
    return 'tr';
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

  // Chinese (Simplified and Traditional)
  if (/[\u4E00-\u9FFF]/.test(text)) {
    return 'zh';
  }

  // Japanese (Hiragana, Katakana, Kanji)
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(text)) {
    return 'ja';
  }

  // Korean (Hangul)
  if (/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/.test(text)) {
    return 'ko';
  }

  // Cyrillic (Russian, Ukrainian, etc.)
  if (/[\u0400-\u04FF]/.test(text)) {
    return 'ru';
  }

  return null;
}

/**
 * Detects language based on keyword frequency
 * Good for Latin-script European languages
 */
function detectFromKeywords(text: string): SupportedLanguage | null {
  const lowerText = text.toLowerCase();

  // Calculate scores for each language
  const scores: Record<string, number> = {
    fr: countMatches(lowerText, [
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
    ]),
    es: countMatches(lowerText, [
      'traducir',
      'traducción',
      'español',
      'documento',
      'en español',
      'el',
      'la',
      'los',
      'las',
      'del',
      'para',
    ]),
    de: countMatches(lowerText, [
      'übersetzen',
      'übersetzung',
      'deutsch',
      'dokument',
      'auf deutsch',
      'der',
      'die',
      'das',
      'den',
      'ist',
      'und',
    ]),
    pt: countMatches(lowerText, [
      'traduzir',
      'tradução',
      'português',
      'documento',
      'em português',
      'o',
      'a',
      'os',
      'as',
      'para',
      'de',
    ]),
    it: countMatches(lowerText, [
      'tradurre',
      'traduzione',
      'italiano',
      'documento',
      'in italiano',
      'il',
      'la',
      'lo',
      'gli',
      'per',
      'di',
    ]),
    tr: countMatches(lowerText, [
      'çevirmek',
      'çeviri',
      'türkçe',
      'belge',
      'türkçeye',
      'bir',
      'bu',
      've',
      'için',
    ]),
    nl: countMatches(lowerText, [
      'vertalen',
      'vertaling',
      'nederlands',
      'document',
      'in het nederlands',
      'de',
      'het',
      'een',
      'van',
    ]),
    pl: countMatches(lowerText, [
      'tłumaczyć',
      'tłumaczenie',
      'polski',
      'dokument',
      'po polsku',
      'w',
      'na',
      'jest',
    ]),
  };

  // Find language with highest score (minimum threshold: 2 matches)
  const entries = Object.entries(scores).sort(([, a], [, b]) => b - a);
  const topLanguage = entries[0];

  if (topLanguage && topLanguage[1] >= 2) {
    return topLanguage[0] as SupportedLanguage;
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

  // Spanish
  if (/\b(to|en|in|vers|a)\s+(spanish|español)/i.test(text)) {
    return 'es';
  }

  // German
  if (/\b(to|in|auf)\s+(german|deutsch)/i.test(text)) {
    return 'de';
  }

  // Arabic
  if (/\b(to|إلى)\s+(arabic|عربي|العربية)/i.test(text)) {
    return 'ar';
  }

  // Portuguese
  if (/\b(to|em|para)\s+(portuguese|português)/i.test(text)) {
    return 'pt';
  }

  // Italian
  if (/\b(to|in)\s+(italian|italiano)/i.test(text)) {
    return 'it';
  }

  // Russian
  if (/\b(to|на)\s+(russian|русский)/i.test(text)) {
    return 'ru';
  }

  // Turkish
  if (/\b(to|için)\s+(turkish|türkçe)/i.test(text)) {
    return 'tr';
  }

  // English
  if (/\b(to|in)\s+(english|anglais|inglés)/i.test(text)) {
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

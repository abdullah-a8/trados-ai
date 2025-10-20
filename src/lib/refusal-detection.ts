/**
 * Refusal Detection Utility
 *
 * Detects when GPT-4o refuses to translate a document based on safety concerns.
 * Only triggers on explicit refusals like "I cannot", "I can't help", etc.
 * Does NOT interfere with actual translation responses.
 */

export interface RefusalDetection {
  isRefusal: boolean;
  confidence: 'high' | 'medium' | 'low';
  matchedPattern?: string;
}

/**
 * High-confidence refusal patterns that clearly indicate the model is refusing
 * These are carefully crafted to ONLY match refusals, not actual translations
 */
const HIGH_CONFIDENCE_PATTERNS = [
  // English refusals
  /I\s+(cannot|can't|should not|shouldn't|won't|will not)\s+(translate|provide|assist|help|process)/i,
  /I'm\s+(unable|not able|not comfortable)\s+to\s+(translate|provide|assist|help|process)/i,
  /I\s+(must|need to|have to)\s+(decline|refuse)/i,

  // French refusals
  /Je\s+(ne peux pas|ne dois pas|refuse de)\s+(traduire|fournir|aider|traiter)/i,
  /Je\s+(suis désolé|regrette|m'excuse),?\s+(je ne peux|impossible de|mais je ne)/i,
  /Il\s+m'est\s+impossible\s+de\s+(traduire|fournir)/i,
  /Je\s+m'excuse,?\s+mais\s+je\s+ne\s+peux\s+pas/i,

  // Spanish refusals
  /No\s+puedo\s+(traducir|proporcionar|ayudar)/i,
  /Lo\s+siento,?\s+no\s+puedo/i,

  // German refusals
  /Ich\s+kann\s+nicht\s+(übersetzen|bereitstellen|helfen)/i,
  /Es\s+tut\s+mir\s+leid,?\s+ich\s+kann/i,

  // Arabic refusals
  /لا\s+(أستطيع|يمكنني)\s+(ترجمة|مساعدة)/i,

  // Policy/guideline mentions
  /violates?\s+(my|our|the)\s+(guidelines?|policy|policies|principles?)/i,
  /against\s+(my|our|the)\s+(guidelines?|policy|policies|programming)/i,
];

/**
 * Medium-confidence patterns that might indicate refusal
 * These require additional context to confirm
 */
const MEDIUM_CONFIDENCE_PATTERNS = [
  /I\s+don't\s+feel\s+comfortable/i,
  /this\s+(appears|seems)\s+to\s+(be|contain)\s+(sensitive|personal|private)/i,
  /désolé/i, // French "sorry" - common in refusals
  /lo\s+siento/i, // Spanish "sorry"
];

/**
 * Detects if the given text is a refusal from the AI model
 *
 * @param text - The text to analyze (typically first 150-200 tokens of response)
 * @param tokenCount - Approximate token count (refusals happen early in response)
 * @returns Detection result with confidence level
 */
export function detectRefusal(text: string, tokenCount: number): RefusalDetection {
  // Only check early in the response - refusals come at the start
  // This prevents false positives from translations that happen to contain these phrases
  if (tokenCount > 200) {
    return {
      isRefusal: false,
      confidence: 'low',
    };
  }

  // Check high-confidence patterns first
  for (const pattern of HIGH_CONFIDENCE_PATTERNS) {
    if (pattern.test(text)) {
      return {
        isRefusal: true,
        confidence: 'high',
        matchedPattern: pattern.source,
      };
    }
  }

  // Check medium-confidence patterns (only if early in response)
  if (tokenCount < 100) {
    for (const pattern of MEDIUM_CONFIDENCE_PATTERNS) {
      if (pattern.test(text)) {
        return {
          isRefusal: true,
          confidence: 'medium',
          matchedPattern: pattern.source,
        };
      }
    }
  }

  return {
    isRefusal: false,
    confidence: 'low',
  };
}

/**
 * Estimates token count from text (rough approximation)
 * Used to determine if we should still check for refusals
 */
export function estimateTokenCount(text: string): number {
  // Rough estimate: ~4 characters per token for English, ~2-3 for other languages
  // Split by whitespace and punctuation for better accuracy
  const words = text.split(/\s+/).filter(w => w.length > 0);
  return Math.ceil(words.length * 1.3); // Approximate tokens
}

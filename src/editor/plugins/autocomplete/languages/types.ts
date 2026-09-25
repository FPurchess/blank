/**
 * LanguageRules holds everything autocorrect needs to know about a language.
 */
export interface LanguageRules {
  // opening and closing quotation marks
  quotes: {
    double: [string, string];
    single: [string, string];
  };
  // space inserted inside double quotes, e.g. a narrow no-break space in French
  quoteSpacing?: string;
  // words that end with a period without ending the sentence, e.g. "e.g."
  abbreviations: string[];
  // words with two initial capitals that must not be corrected, e.g. "MHz"
  twoCapitalsExceptions: string[];
  // dash for "A - B" and "A -- B"
  spacedDash: "–" | "—";
  // dash for "A--B"
  wordDash: "–" | "—";
  // replacements that only apply to this language, e.g. "i" → "I" in English
  replace?: Record<string, string>;
}

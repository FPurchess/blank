import { languageRules } from ".";
import { isoCodes } from "./iso639-1";
import type { LanguageRules } from "./types";

// languages that share the rules of another one
const aliases: Record<string, string> = { nb: "no", nn: "no" };

const fallback = "en";

/**
 * rulesLanguage returns the language whose rules apply to `code`, or
 * undefined if it has none of its own
 */
const rulesLanguage = (code: string): string | undefined => {
  const name = Object.hasOwn(aliases, code) ? aliases[code] : code;
  return Object.hasOwn(languageRules, name) ? name : undefined;
};

/**
 * hasOwnRules returns whether `code` has rules of its own rather than the
 * English fallback
 */
export const hasOwnRules = (code: string) => rulesLanguage(code) !== undefined;

/**
 * getRules returns the autocorrect rules for `code`, falling back to English
 */
export const getRules = (code: string): LanguageRules =>
  languageRules[rulesLanguage(code) ?? fallback];

/**
 * isIsoCode returns whether `value` is a valid ISO 639-1 language code
 */
export const isIsoCode = (value: unknown): value is string =>
  typeof value === "string" && isoCodes.has(value);

/**
 * detectLanguage returns the ISO 639-1 code of the system language, e.g.
 * "de" for "de-AT", or English if it isn't a valid code
 */
export const detectLanguage = (): string => {
  const code = (navigator.language ?? "").split("-")[0].toLowerCase();
  return isIsoCode(code) ? code : fallback;
};

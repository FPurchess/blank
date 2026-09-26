import { languageRules } from ".";
import { dictionaryTags } from "../../../../spellcheck/catalog";
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
  const base = baseLanguage(code);
  const name = Object.hasOwn(aliases, base) ? aliases[base] : base;
  return Object.hasOwn(languageRules, name) ? name : undefined;
};

/**
 * baseLanguage returns the ISO 639-1 code of a language tag, e.g. "de" for
 * "de-CH"
 */
export const baseLanguage = (tag: string) => tag.split("-")[0];

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
 * canonicalTag returns the language tag of a dictionary matching `tag`
 * regardless of case, e.g. "de-CH" for "de-ch"
 */
export const canonicalTag = (tag: string): string | undefined =>
  dictionaryTags.find(
    (candidate) => candidate.toLowerCase() === tag.toLowerCase(),
  );

/**
 * isLanguageTag returns whether `value` is a language Blank can be set to: an
 * ISO 639-1 code, or the tag of a regional dictionary such as "de-CH"
 */
export const isLanguageTag = (value: unknown): value is string =>
  isIsoCode(value) ||
  (typeof value === "string" && canonicalTag(value) === value);

/**
 * detectLanguage returns the system language: its tag if there is a regional
 * dictionary for it, e.g. "de-AT", its ISO 639-1 code otherwise, e.g. "de" for
 * "de-DE", or English if it isn't a valid code
 */
export const detectLanguage = (): string => {
  const tag = (navigator.language ?? "").replace("_", "-");
  const regional = canonicalTag(tag);
  if (regional && regional.includes("-")) return regional;
  const code = tag.split("-")[0].toLowerCase();
  return isIsoCode(code) ? code : fallback;
};

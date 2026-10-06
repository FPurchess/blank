import { type Config, isRecord, type SettingChanges } from "../../config";
import { baseLanguage } from "../../editor/plugins/autocomplete/languages/lookup";
import { languageName } from "../../spellcheck/service";

// Your replacements in the settings (ReplacementsPage.vue): typed text and
// what it becomes, for every language ("*") or for one, in blank.json's
// autocorrect.replace.

// the replacements of every language
export const ALL_LANGUAGES = "*";

/**
 * scopes returns the languages to show replacements for: every language,
 * the current one, and any other that has some, so none are hidden
 */
export const scopes = (config: Config, language: string) => {
  const replace = config.autocorrect.replace;
  const keys = [
    ALL_LANGUAGES,
    baseLanguage(language),
    ...Object.keys(replace)
      .filter((key) => Object.keys(replace[key]).length > 0)
      .sort(),
  ];
  return [...new Set(keys)].map((value) => ({
    value,
    label: value === ALL_LANGUAGES ? "All languages" : languageName(value),
  }));
};

/**
 * entriesOf returns the replacements of `scope`, sorted by what is typed
 */
export const entriesOf = (config: Config, scope: string) =>
  Object.entries(config.autocorrect.replace[scope] ?? {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([typed, becomes]) => ({ key: typed, label: becomes }));

/**
 * noneYet says that `scope` has no replacements yet
 */
export const noneYet = (scope: string) =>
  `None yet for ${scope === ALL_LANGUAGES ? "all languages" : languageName(scope)}.`;

/**
 * validate returns what is wrong with a new replacement, or undefined
 */
export const validate = (typed: string, becomes: string) => {
  if (!typed || !becomes) return "Enter what you type and what it becomes.";
  if (/\s/.test(typed)) return "What you type can't contain spaces.";
};

// the replacements of `scope` as blank.json holds them, so a change keeps
// what was written there since Blank started
const scopeIn = (settings: Record<string, unknown>, scope: string) => {
  const autocorrect = settings.autocorrect;
  const replace = isRecord(autocorrect) ? autocorrect.replace : undefined;
  const entries = isRecord(replace) ? replace[scope] : undefined;
  return isRecord(entries) ? entries : {};
};

/**
 * withEntry returns the change that sets (or with `becomes` undefined,
 * removes) the replacement of `typed` in `scope`, on what blank.json holds
 */
export const withEntry =
  (scope: string, typed: string, becomes?: string): SettingChanges =>
  (settings) => {
    const entries = { ...scopeIn(settings, scope) };
    if (becomes === undefined) delete entries[typed];
    else entries[typed] = becomes;
    return [{ path: ["autocorrect", "replace", scope], value: entries }];
  };

/**
 * addMessage returns what adding a replacement announces, and says which
 * one it replaced
 */
export const addMessage = (typed: string, becomes: string, old?: string) =>
  old === undefined || old === becomes
    ? `${typed} now becomes ${becomes}`
    : `${typed} now becomes ${becomes} instead of ${old}`;

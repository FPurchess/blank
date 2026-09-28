import { hasOwnRules } from "../editor/plugins/autocomplete/languages/lookup";
import { basename } from "../paths";
import { languageName } from "../spellcheck/service";
import type { SpellcheckStatus } from "../spellcheck/types";

// What the bars at the top and bottom of the window say (TopBar.vue,
// BottomBar.vue and the items in it).

/**
 * titleOf returns what the top bar says: the document's path, the name of
 * the Word document it was imported from, or "Untitled"
 */
export const titleOf = (file: string | null, source: string | null) =>
  "» " +
  (file ?? (source === null ? "Untitled" : `${basename(source)} (imported)`));

/**
 * countOf returns the counter of the bottom bar for the document's text
 */
export const countOf = (content: string) => {
  const words = content.length ? content.split(/\s/).length : 0;
  return `${words} words ${content.length} chars`;
};

/**
 * spellcheckLabel returns what the spell check item shows, `message` if there
 * is one, and its tooltip. An empty text hides the item.
 */
export const spellcheckLabel = (
  status: SpellcheckStatus,
  message: string | null,
) => {
  const name = languageName(status.tag);
  const [text, title] = message
    ? [message, ""]
    : ({
        off: ["", ""],
        loading: ["Spelling …", `Loading the ${name} dictionary`],
        downloading: [
          `Spelling ${Math.round((status.progress ?? 0) * 100)} %`,
          `Downloading the ${name} dictionary`,
        ],
        ready: ["Spelling", `Checking ${name} spelling`],
        unavailable: ["No spelling", `No spell check dictionary for ${name}`],
        error: ["Spelling failed", status.message ?? ""],
      }[status.state] as [string, string]);
  return { text, title: title && `${title}, click to turn spell check off` };
};

/**
 * optionLabel returns how the open language picker shows `code`, marked with
 * "*" if it falls back to the English rules
 */
export const optionLabel = (code: string) =>
  code + (hasOwnRules(code) ? "" : "*");

/**
 * languageLabel returns how the bottom bar shows the current language
 */
export const languageLabel = (code: string) => optionLabel(code).toUpperCase();

// how many languages the open picker shows at once
const PICKER_WINDOW = 5;

/**
 * pickerWindow returns the languages the open picker shows: the selected one
 * in the middle, and those around it, wrapping around the list
 */
export const pickerWindow = (languages: string[], selected: string) => {
  const index = languages.indexOf(selected);
  const count = Math.min(PICKER_WINDOW, languages.length);
  const first = index - Math.floor(count / 2);
  return Array.from(
    { length: count },
    (_, i) => languages[(first + i + languages.length) % languages.length],
  );
};

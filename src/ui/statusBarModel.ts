import { hasOwnRules } from "../editor/plugins/autocomplete/languages/lookup";
import { basename } from "../paths";
import { languageName } from "../spellcheck/service";
import type { SpellcheckStatus } from "../spellcheck/types";
import type { ListedHeading } from "../markdown/headings";
import type { MenuItem, PageViewMode } from "../state";

// What the bars at the top and bottom of the window say (TopTitle.vue,
// BottomBar.vue and the items in it).

/**
 * titleOf returns what the document is called: its file's path, or only
 * its name for "name", the name of the Word document it was imported from,
 * or "Untitled"
 */
export const titleOf = (
  file: string | null,
  source: string | null,
  form: "path" | "name" = "path",
) =>
  file !== null
    ? form === "name"
      ? basename(file)
      : file
    : source === null
      ? "Untitled"
      : `${basename(source)} (imported)`;

/**
 * spellcheckLabel returns what the spell check item shows, `message` if there
 * is one, and the name its tooltip gives in place of the command's while the
 * dictionary isn't ready, e.g. "Spelling: downloading German"
 */
export const spellcheckLabel = (
  status: SpellcheckStatus,
  message: string | null,
) => {
  const name = languageName(status.tag);
  const [text, detail] = (
    {
      off: ["Spelling off", ""],
      loading: ["Spelling …", `Spelling: loading ${name}`],
      downloading: [
        `Spelling ${Math.round((status.progress ?? 0) * 100)} %`,
        `Spelling: downloading ${name}`,
      ],
      ready: ["Spelling", ""],
      unavailable: ["No spelling", `Spelling: no ${name} dictionary`],
      error: [
        "Spelling failed",
        status.message ? `Spelling: ${status.message}` : "",
      ],
    } as Record<SpellcheckStatus["state"], [string, string]>
  )[status.state];
  return { text: message ?? text, tip: detail || undefined };
};

/**
 * viewLabel returns the view button's tooltip, which names the view shown,
 * and its name for screen readers, which also says what a click does
 */
export const viewLabel = (view: PageViewMode) =>
  view === "pages"
    ? { tip: "View: pages", aria: "View: pages. Switch to page ends" }
    : { tip: "View: page ends", aria: "View: page ends. Switch to pages" };

/**
 * firstHeadings returns the text of the first heading on each of `pages`
 * pages, or "" for a page without one
 * @param pageOf the page a heading is on, counted from 0, or null if it
 *   isn't laid out
 */
export const firstHeadings = (
  pages: number,
  headings: readonly ListedHeading[],
  pageOf: (pos: number) => number | null,
) => {
  const found: string[] = Array.from({ length: pages }, () => "");
  for (const heading of headings) {
    if (!heading.text) continue;
    const page = pageOf(heading.pos);
    if (page !== null && page < pages && !found[page]) {
      found[page] = heading.text;
    }
  }
  return found;
};

/**
 * pageMenuItems returns the items of the menu "Page N of M" opens: one per
 * page, with the first heading on it, which goes to that page
 * @param go goes to a page, counted from 1
 */
export const pageMenuItems = (
  headings: readonly string[],
  go: (page: number) => void,
): MenuItem[] =>
  headings.map((heading, index) => ({
    id: `page:${index + 1}`,
    label: `Page ${index + 1}`,
    icon: "page",
    ...(heading ? { detail: heading } : {}),
    run: () => go(index + 1),
  }));

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

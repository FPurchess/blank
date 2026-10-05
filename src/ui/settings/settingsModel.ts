import { nextTick, shallowRef } from "vue";

import type { AutocorrectConfig, Config, SettingChanges } from "../../config";
import { saveSettings } from "../../config";
import type { Option } from "../../layout/choices";
import { announce, type SettingsSection, type ThemeName } from "../../state";

// What the settings dialog (SettingsDialog.vue) shows, besides the keyboard
// shortcuts (shortcutsModel.ts), your replacements (replacementsModel.ts), your
// dictionary (dictionaryModel.ts) and About (aboutModel.ts).

// the sections in the list on the left, with their icons
export const SECTIONS: { key: SettingsSection; label: string; icon: string }[] =
  [
    { key: "appearance", label: "Appearance", icon: "palette" },
    { key: "writing", label: "Writing", icon: "pencil" },
    { key: "spelling", label: "Spelling", icon: "spell" },
    { key: "shortcuts", label: "Keyboard shortcuts", icon: "keyboard" },
    { key: "about", label: "About", icon: "info" },
  ];

// the inner pages, which show in place of their section
export type SettingsPage = "replacements" | "dictionary" | "licenses";

/**
 * save makes `changes` in blank.json and, once they're saved, announces
 * `message`, e.g. "Dashes off"
 * @returns whether they were saved
 */
export const save = async (changes: SettingChanges, message: string) => {
  const saved = await saveSettings(changes);
  if (saved) announce(message);
  return saved;
};

/**
 * themeLabel returns the name of a theme, e.g. "Dark"
 */
export const themeLabel = (name: ThemeName) =>
  name.charAt(0).toUpperCase() + name.slice(1);

/**
 * hideAfterOptions returns the rest times focus mode offers, and `current` if
 * blank.json has another one, so it isn't lost
 */
export const hideAfterOptions = (current: number): Option<number>[] => {
  const seconds = [0, 3, 10];
  if (!seconds.includes(current)) seconds.push(current);
  return seconds
    .sort((a, b) => a - b)
    .map((value) => ({ value, label: hideAfterLabel(value) }));
};

/**
 * hideAfterLabel returns how a rest time is offered, "When typing" for none
 */
const hideAfterLabel = (seconds: number) =>
  seconds === 0 ? "When typing" : `Or after ${seconds} s`;

/**
 * hideAfterMessage returns what choosing a rest time announces
 */
export const hideAfterMessage = (seconds: number) =>
  seconds === 0
    ? "In focus mode, the controls hide when you type"
    : `In focus mode, the controls also hide after ${seconds} s`;

type AutocorrectSwitch = Exclude<keyof AutocorrectConfig, "replace">;

// the switches of autocorrect, one per group of blank.json, with what each
// does (see docs/guide/autocorrect.md)
export const AUTOCORRECT_ROWS: {
  key: AutocorrectSwitch;
  label: string;
  description: string;
}[] = [
  {
    key: "arrows",
    label: "Arrows",
    description: "-> becomes →, ==> becomes ⇒",
  },
  {
    key: "dashes",
    label: "Dashes",
    description: "A - B becomes A – B, A--B becomes A—B",
  },
  {
    key: "symbols",
    label: "Symbols",
    description: "(c) becomes ©, 1/2 becomes ½, <= becomes ≤",
  },
  {
    key: "quotes",
    label: "Typographic quotes",
    description: "In the style of the language, e.g. “…” or „…“",
  },
  {
    key: "capitalize",
    label: "Capitalize sentences",
    description: "Also fixes “THe” and the language's common typos",
  },
  {
    key: "formatting",
    label: "Formatting as you type",
    description: "**bold**, *italic*, `code`",
  },
  {
    key: "blocks",
    label: "Blocks as you type",
    description: "# heading, - list, > quote, --- line",
  },
  {
    key: "links",
    label: "Links",
    description: "Web and email addresses become links",
  },
];

/**
 * autocorrectChange returns the change that turns a group of autocorrect on
 * or off, and what it announces, e.g. "Dashes off"
 */
export const autocorrectChange = (key: AutocorrectSwitch, on: boolean) => ({
  changes: [{ path: ["autocorrect", key], value: on }],
  message: `${AUTOCORRECT_ROWS.find((row) => row.key === key)!.label} ${
    on ? "on" : "off"
  }`,
});

/**
 * count returns "1 word", "3 words", for a noun with a regular plural
 */
export const count = (n: number, noun: string) =>
  `${n} ${noun}${n === 1 ? "" : "s"}`;

/**
 * replacementsSummary says how many replacements of their own the user has,
 * in every language
 */
export const replacementsSummary = (config: Config) => {
  const total = Object.values(config.autocorrect.replace).reduce(
    (sum, scope) => sum + Object.keys(scope).length,
    0,
  );
  return total === 0
    ? "Typed text Blank replaces for you"
    : count(total, "replacement");
};

/**
 * enterInField tells whether Enter was pressed in a field, and keeps it from
 * closing the dialog, which submits on Enter: in a field of the settings,
 * Enter is the field's (e.g. Add)
 */
export const enterInField = (event: KeyboardEvent) => {
  if (!(event.target instanceof HTMLInputElement)) return false;
  event.preventDefault();
  return true;
};

// the entries of a list from which on it has a filter
export const FILTER_FROM = 8;

/**
 * filterEntries returns the entries of a list whose text or replacement
 * contains `query`, ignoring case
 */
export const filterEntries = <T extends { key: string; label?: string }>(
  entries: T[],
  query: string,
) => {
  const text = query.trim().toLowerCase();
  if (!text) return entries;
  return entries.filter((entry) =>
    `${entry.key} ${entry.label ?? ""}`.toLowerCase().includes(text),
  );
};

/**
 * useInnerPage keeps which inner page a section shows in its place, and the
 * button that opened it, which gets the focus back when the page goes
 */
export const useInnerPage = () => {
  const page = shallowRef<SettingsPage | null>(null);
  let opener: HTMLElement | null = null;
  const open = (name: SettingsPage, event: Event) => {
    opener = event.currentTarget as HTMLElement;
    page.value = name;
  };
  const back = async () => {
    page.value = null;
    await nextTick();
    opener?.focus();
  };
  return { page, open, back };
};

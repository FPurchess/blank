import { computed, shallowRef } from "vue";

import type { ViewAnchor } from "../engine/frames";
import { MARKDOWN_EXTENSIONS, WORD_EXTENSIONS } from "../formats";
import { basename, extname } from "../paths";

// The open documents, one tab each. The editor shows the active one, and
// `path`, `importedFrom` and `transaction` (document.ts) are always the
// active tab's. The documents themselves live with the editor (see
// src/editor/tabs.ts), not here, so a tab's name or dot changing never
// copies them. See .claude/rules/tabs.md.

export interface Tab {
  readonly id: string;
  // the markdown file it's saved to, null while it's untitled
  readonly path: string | null;
  // the Word document an untitled tab was imported from
  readonly importedFrom: string | null;
  // "Untitled 2" is 2, "Untitled" 1; null for a file, an import and the
  // welcome document
  readonly untitledNumber: number | null;
  // the document Blank starts with the first time
  readonly welcome?: boolean;
  // whether it differs from what was last opened or saved
  readonly unsaved: boolean;
  // the spot at the top of the view when the tab was left, null for the top
  readonly viewAnchor: ViewAnchor | null;
}

// the tabs, in the row's order
export const tabs = shallowRef<readonly Tab[]>([]);

// the tab the editor shows, null only before the first one is open
export const activeTabId = shallowRef<string | null>(null);

export const activeTab = computed(
  () => tabs.value.find((tab) => tab.id === activeTabId.value) ?? null,
);

// A switch to another tab: a new object every time, so watchers see the same
// tab shown again too. The page view resets what it kept of the last
// document and scrolls to `anchor` once the new one is laid out.
export interface TabSwitch {
  id: string;
  anchor: ViewAnchor | null;
}
export const tabSwitch = shallowRef<TabSwitch | null>(null);

// whether the focus is in the tab row's list, which the editor leaves it
export const tabRowFocused = shallowRef(false);

/**
 * updateTab changes the tab `id`, replacing the list
 */
export const updateTab = (
  id: string,
  change: Partial<Omit<Tab, "id">>,
): void => {
  tabs.value = tabs.value.map((tab) =>
    tab.id === id ? { ...tab, ...change } : tab,
  );
};

const DOCUMENT_EXTENSIONS = [...MARKDOWN_EXTENSIONS, ...WORD_EXTENSIONS];

// what tabLabel and tabTooltip read of a tab
type Named = Pick<Tab, "path" | "importedFrom" | "untitledNumber" | "welcome">;

/**
 * tabLabel returns the name a tab shows: its file's name without the
 * extension, e.g. "notes" for "/docs/notes.md", "Untitled 2", or "Welcome"
 */
export const tabLabel = (tab: Named): string => {
  const file = tab.path ?? tab.importedFrom;
  if (file !== null) {
    const name = basename(file);
    const extension = extname(name);
    return DOCUMENT_EXTENSIONS.includes(extension)
      ? name.slice(0, -extension.length - 1)
      : name;
  }
  if (tab.welcome) return "Welcome";
  const number = tab.untitledNumber ?? 1;
  return number === 1 ? "Untitled" : `Untitled ${number}`;
};

/**
 * tabTooltip returns where a tab's document is: its path, the Word document
 * it was imported from, or that it isn't saved yet
 */
export const tabTooltip = (tab: Named): string => {
  if (tab.path !== null) return tab.path;
  if (tab.importedFrom !== null)
    return `Imported from ${tab.importedFrom}, not saved yet`;
  return "Not saved yet";
};

/**
 * freeUntitledNumber returns the lowest number no untitled tab has, so a new
 * one is "Untitled" while none is open, and "Untitled 2" next to it
 */
export const freeUntitledNumber = (list: readonly Tab[]): number => {
  const used = new Set(list.map((tab) => tab.untitledNumber));
  let number = 1;
  while (used.has(number)) number++;
  return number;
};

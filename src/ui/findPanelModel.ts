import { COUNT_CAP } from "../editor/plugins/find/state";
import type { FindState } from "../editor/plugins/find/state";
import type { Anchor, FindOptions } from "../state";

// What the find panel (FindPanel.vue) shows and where.

// its toggles, in order: the option each switches, what it shows and its name
export const FIND_TOGGLES: {
  option: keyof FindOptions;
  text: string;
  label: string;
}[] = [
  { option: "matchCase", text: "Aa", label: "Match case" },
  { option: "wholeWord", text: "ab|", label: "Whole word" },
  { option: "regex", text: ".*", label: "Regular expression" },
];

// how far it stays from the page view's edges
const INSET = 8;

/**
 * countText returns what the panel says it found: "3 of 12", "1000+" past
 * what it counts, "No matches", or nothing before a query or for a pattern
 * it can't read
 */
export const countText = (state: FindState | undefined) => {
  if (!state?.active || !state.query || state.error) return "";
  const count = state.matches.length;
  if (count === 0) return "No matches";
  const total = count > COUNT_CAP || state.more ? `${COUNT_CAP}+` : `${count}`;
  return `${state.current + 1} of ${total}`;
};

/**
 * errorText returns what the panel says about a pattern it can't read
 */
export const errorText = (state: FindState | undefined) =>
  state?.error ? `That pattern can't be read: ${state.error}` : "";

/**
 * panelAnchor returns where the panel sits: at the top right of the page
 * view below the toolbar, or of the window below the top area without it
 * @param view the page view's box in the window, if it shows
 */
export const panelAnchor = (
  view: { top: number; right: number } | null,
  windowWidth: number,
  topArea: number,
): Anchor => {
  const right = (view?.right ?? windowWidth) - INSET;
  const top = view?.top ?? topArea;
  return { left: right, right, top, bottom: top + INSET - 2 };
};

import { shownIn } from "../dom";
import type { PageChoices } from "../layout/choices";
import { SIDES } from "../layout/settings";

// What the page setup dialog (PageSetupDialog.vue) shows besides its rows.

export interface Field<K> {
  key: K;
  label: string;
}

// the fields of a custom size and of custom margins, shown below their row
// while "Custom…" is chosen
export const PAPER_FIELDS: Field<"width" | "height">[] = [
  { key: "width", label: "Width" },
  { key: "height", label: "Height" },
];
export const MARGIN_FIELDS: Field<keyof PageChoices["sides"]>[] = SIDES.map(
  (side) => ({ key: side, label: side[0].toUpperCase() + side.slice(1) }),
);

/**
 * stopAfter returns where ↑ (`direction` -1) or ↓ (1) go from `active` among
 * `stops`, or undefined at either end, which leaves the key to the field
 */
export const stopAfter = (
  stops: HTMLElement[],
  active: Element | null,
  direction: 1 | -1,
) => stops[stops.indexOf(active as HTMLElement) + direction];

/**
 * stopsIn returns the elements ↑↓ move between in `element`: the control of
 * each row that is in the tab order (the paper's list, the checked option),
 * and the fields that are shown
 */
export const stopsIn = (element: HTMLElement) =>
  shownIn(element, '[data-row] button:not([tabindex="-1"]), .custom input');

/**
 * sentence makes a message a sentence, ending in a period unless it ends in
 * a mark of its own
 */
export const sentence = (text: string) =>
  /[.?!…]$/.test(text) ? text : `${text}.`;

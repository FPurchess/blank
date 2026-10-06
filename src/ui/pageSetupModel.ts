import { shownIn } from "../dom";
import type { PageChoices } from "../layout/choices";
import { unreadable } from "../layout/describe";
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

// what is wrong in the dialog: the part it is wrong in ("properties",
// "paper" or "margins") and a sentence that says it
export type Problem = [part: string, message: string];

export const UNREADABLE = unreadable("the page setup");

/**
 * problemsOf returns what is wrong, each on a line of its own: the
 * frontmatter the rows would be written into, when it can't be read, and what
 * can't be used of the rows
 */
export const problemsOf = ({
  unreadable,
  errors,
}: {
  unreadable: boolean;
  errors: Partial<Record<string, string>>;
}): Problem[] => {
  const rows = Object.entries(errors).filter(
    (entry): entry is Problem => entry[1] !== undefined,
  );
  return unreadable ? [["properties", UNREADABLE], ...rows] : rows;
};

/**
 * problemId returns the id of what is wrong with `part`, which its controls
 * are described by, or undefined while nothing is
 */
export const problemId = (problems: Problem[], part: string) =>
  problems.some(([name]) => name === part)
    ? `page-setup-error-${part}`
    : undefined;

/**
 * steppedPaper returns the paper ← (`by` -1) or → (1) choose from `current`
 * in the paper's list, or undefined at either end, where they stop, as the
 * list does
 */
export const steppedPaper = <T>(
  options: { value: T }[],
  current: T,
  by: 1 | -1,
) =>
  options[options.findIndex((option) => option.value === current) + by]?.value;

/**
 * appliesOnEnter tells whether Enter on `target` applies the dialog instead
 * of pressing it: on an option it does, while it opens the paper's list
 */
export const appliesOnEnter = (target: EventTarget | null) =>
  target instanceof HTMLButtonElement &&
  target.getAttribute("aria-haspopup") !== "menu";

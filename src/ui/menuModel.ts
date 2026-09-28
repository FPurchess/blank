import type { MenuItem } from "../state";

// A menu item, as opposed to a separator: it can be focused and run unless
// it's disabled
export type MenuEntry = Exclude<MenuItem, "separator">;

export const isEntry = (item: MenuItem): item is MenuEntry =>
  item !== "separator";

/**
 * enabledAt returns whether the item at `index` of `items` can be focused
 */
export const enabledAt = (items: MenuItem[], index: number) => {
  const item = items[index];
  return item !== undefined && isEntry(item) && !item.disabled;
};

/**
 * step returns the next enabled item from `index` in `direction`, wrapping
 * around, or `index` if there's none
 */
export const step = (items: MenuItem[], index: number, direction: 1 | -1) => {
  const count = items.length;
  for (let i = 1; i <= count; i++) {
    const next = (((index + direction * i) % count) + count) % count;
    if (enabledAt(items, next)) return next;
  }
  return index;
};

/**
 * firstEnabled returns the first enabled item, or -1 if there's none
 */
export const firstEnabled = (items: MenuItem[]) => {
  const found = step(items, -1, 1);
  return enabledAt(items, found) ? found : -1;
};

/**
 * lastEnabled returns the last enabled item, or -1 if there's none
 */
export const lastEnabled = (items: MenuItem[]) => {
  const found = step(items, 0, -1);
  return enabledAt(items, found) ? found : -1;
};

/**
 * typeahead returns the next enabled item after `index` whose label starts
 * with `letter`, or null if there's none
 */
export const typeahead = (items: MenuItem[], index: number, letter: string) => {
  const count = items.length;
  const wanted = letter.toLowerCase();
  for (let i = 1; i <= count; i++) {
    const next = (index + i + count) % count;
    const item = items[next];
    if (
      enabledAt(items, next) &&
      isEntry(item) &&
      item.label.toLowerCase().startsWith(wanted)
    ) {
      return next;
    }
  }
  return null;
};

/**
 * hasChecks returns whether `items` switch something on and off, in which case
 * every row gets a column for the check mark, so the labels line up
 */
export const hasChecks = (items: MenuItem[]) =>
  items.some((item) => isEntry(item) && item.checked !== undefined);

/**
 * roleOf returns the ARIA role of the row of `item`: a plain item, one that
 * switches something on and off, or the chosen one of a set of choices
 */
export const roleOf = (item: MenuEntry) => {
  if (item.checked === undefined) return "menuitem";
  return item.radio ? "menuitemradio" : "menuitemcheckbox";
};

/**
 * indexAfterUpdate returns the item to focus once the open menu gets `next`
 * items, e.g. the suggestions for a misspelling, while `index` of `items` had
 * the focus: the item the user `moved` to, found again by its id; else the
 * first one if the menu was opened with the keyboard or an item had the
 * focus; else none (-1)
 */
export const indexAfterUpdate = (
  items: MenuItem[],
  index: number,
  moved: boolean,
  next: { items: MenuItem[]; keyboard: boolean },
) => {
  const focused = items[index];
  let found = -1;
  if (moved && focused !== undefined && isEntry(focused)) {
    found = next.items.findIndex(
      (item) => isEntry(item) && item.id === focused.id,
    );
  }
  if (found < 0 && (next.keyboard || index >= 0)) {
    found = firstEnabled(next.items);
  }
  return enabledAt(next.items, found) ? found : -1;
};

import type { Option } from "../layout/choices";
import type { MenuHead, MenuItem, MenuLine, MenuRow } from "../state";

// A menu item, as opposed to a separator, a head or a row: it can be focused
// and run unless it's disabled
export type MenuEntry = Exclude<MenuItem, "separator">;

export const isEntry = (item: MenuLine | undefined): item is MenuEntry =>
  item !== undefined && item !== "separator" && !("kind" in item);

export const isRow = (item: MenuLine | undefined): item is MenuRow =>
  typeof item === "object" && "kind" in item && item.kind === "row";

export const isHead = (item: MenuLine | undefined): item is MenuHead =>
  typeof item === "object" && "kind" in item && item.kind === "head";

/**
 * lineId returns the id of an item or a row, which an update finds it by
 */
const lineId = (item: MenuLine | undefined) =>
  isEntry(item) || isRow(item) ? item.id : undefined;

/**
 * radioItems returns a menu of options to choose one of, the current one
 * checked, which run `choose` with the value chosen
 * @param prefix comes before each value in the items' ids, e.g.
 *   "first-page:"
 */
export const radioItems = <T extends string>(
  options: readonly Option<T>[],
  current: T,
  choose: (value: T) => void,
  prefix = "",
): MenuEntry[] =>
  options.map(({ value, label }) => ({
    id: `${prefix}${value}`,
    label,
    radio: true,
    checked: value === current,
    run: () => choose(value),
  }));

/**
 * enabledAt returns whether the item at `index` of `items` can be focused:
 * an item that isn't disabled, or a row with one
 */
export const enabledAt = (items: readonly MenuLine[], index: number) => {
  const item = items[index];
  if (isRow(item)) return item.items.some((child) => !child.disabled);
  return isEntry(item) && !item.disabled;
};

/**
 * rowStep returns the next enabled item of `row` from `column` in
 * `direction`, without wrapping around, or `column` if there's none
 */
export const rowStep = (row: MenuRow, column: number, direction: 1 | -1) => {
  for (
    let next = column + direction;
    next >= 0 && next < row.items.length;
    next += direction
  ) {
    if (!row.items[next].disabled) return next;
  }
  return column;
};

/**
 * firstColumn returns the first enabled item of a row, 0 for anything else
 */
export const firstColumn = (item: MenuLine | undefined) =>
  isRow(item) ? Math.max(0, rowStep(item, -1, 1)) : 0;

/**
 * activeItem returns the item at `index`, or for a row the item at `column`
 * of it
 */
export const activeItem = (
  items: readonly MenuLine[],
  index: number,
  column: number,
): MenuEntry | undefined => {
  const item = items[index];
  return isRow(item) ? item.items[column] : isEntry(item) ? item : undefined;
};

// a section of a menu: the lines from `start` to `end` (excluded), between
// separators, named by its head, if it has one
export interface MenuGroup {
  head: MenuHead | null;
  start: number;
  end: number;
}

/**
 * groupsOf returns the sections of a menu's lines, split at the separators,
 * each with its head (its first line, if it's one)
 */
export const groupsOf = (items: readonly MenuLine[]): MenuGroup[] => {
  const groups: MenuGroup[] = [];
  let start = 0;
  items.forEach((item, index) => {
    if (item !== "separator") return;
    groups.push({ head: null, start, end: index });
    start = index + 1;
  });
  groups.push({ head: null, start, end: items.length });
  return groups.map((group) => {
    const first = items[group.start];
    return isHead(first) ? { ...group, head: first } : group;
  });
};

/**
 * step returns the next enabled item from `index` in `direction`, wrapping
 * around, or `index` if there's none
 */
export const step = (
  items: readonly MenuLine[],
  index: number,
  direction: 1 | -1,
) => {
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
export const firstEnabled = (items: readonly MenuLine[]) => {
  const found = step(items, -1, 1);
  return enabledAt(items, found) ? found : -1;
};

/**
 * lastEnabled returns the last enabled item, or -1 if there's none
 */
export const lastEnabled = (items: readonly MenuLine[]) => {
  const found = step(items, 0, -1);
  return enabledAt(items, found) ? found : -1;
};

/**
 * typeahead returns the next enabled item after `index` whose label starts
 * with `letter`, or null if there's none
 */
export const typeahead = (
  items: readonly MenuLine[],
  index: number,
  letter: string,
) => {
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
export const hasChecks = (items: readonly MenuLine[]) =>
  items.some((item) => isEntry(item) && item.checked !== undefined);

/**
 * roleOf returns the ARIA role of the row of `item`: a plain item, one that
 * switches something on and off, or the chosen one of a set of choices; an
 * option of a search's results
 */
export const roleOf = (item: MenuEntry, found = false) => {
  if (found) return "option";
  if (item.checked === undefined) return "menuitem";
  return item.radio ? "menuitemradio" : "menuitemcheckbox";
};

/**
 * indexAfterUpdate returns the item to focus once the open menu gets `next`
 * items, e.g. the suggestions for a misspelling, while `index` of `items` had
 * the focus: the item or row the user `moved` to, found again by its id, at
 * the same `column` of a row; else the first one if the menu was opened with
 * the keyboard or an item had the focus; else none (-1)
 */
export const indexAfterUpdate = (
  items: readonly MenuLine[],
  index: number,
  moved: boolean,
  next: { items: readonly MenuLine[]; keyboard: boolean },
  column = 0,
) => {
  const id = lineId(items[index]);
  let found = -1;
  if (moved && id !== undefined) {
    found = next.items.findIndex((item) => lineId(item) === id);
  }
  if (found < 0 && (next.keyboard || index >= 0)) {
    found = firstEnabled(next.items);
  }
  if (!enabledAt(next.items, found)) return { index: -1, column: 0 };
  const line = next.items[found];
  const kept =
    isRow(line) && line.items[column] && !line.items[column].disabled
      ? column
      : firstColumn(line);
  return { index: found, column: kept };
};

/**
 * labelParts returns the label of `item` in parts, the one a search matched
 * `marked`
 */
export const labelParts = (item: MenuEntry) => {
  if (!item.match) return [{ text: item.label, marked: false }];
  const [from, to] = item.match;
  return [
    { text: item.label.slice(0, from), marked: false },
    { text: item.label.slice(from, to), marked: true },
    { text: item.label.slice(to), marked: false },
  ].filter((part) => part.text);
};

/**
 * foundText returns what a search says it found, e.g. "5 commands"
 */
export const foundText = (count: number) =>
  count === 1 ? "1 command" : `${count} commands`;

/**
 * optionId returns the id of the line at `index` of the level at `depth`,
 * which the main menu's search names as the active one
 */
export const optionId = (depth: number, index: number) =>
  `menu-${depth}-${index}`;

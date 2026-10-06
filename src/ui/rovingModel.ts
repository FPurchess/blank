// Rows of items the arrow keys move between, of which one is in the tab
// order (a roving tabindex): the rows of useRovingFocus (OptionGroup.vue,
// the formatting toolbar) and the tabs, whose stop follows the shown tab.

// which arrows move along a row: ←→, ↑↓ for a column (the sections of the
// settings), or both for a grid that wraps (the theme cards)
export type Orientation = "horizontal" | "vertical" | "both";

/**
 * stepTo returns the item of a row that `key` moves to from `index`, e.g. an
 * option or a tab, wrapping around (→ ← Home End, or ↓ ↑ in a column), or
 * undefined for another key
 */
export const stepTo = (
  key: string,
  index: number,
  count: number,
  orientation: Orientation = "horizontal",
) => {
  const across = orientation !== "vertical";
  const down = orientation !== "horizontal";
  const moves: Record<string, number> = {
    ...(across && { ArrowRight: index + 1, ArrowLeft: index - 1 }),
    ...(down && { ArrowDown: index + 1, ArrowUp: index - 1 }),
    Home: 0,
    End: count - 1,
  };
  return key in moves ? (moves[key] + count) % count : undefined;
};

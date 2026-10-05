// Rows of items the arrow keys move between, of which one is in the tab
// order (a roving tabindex): the options of OptionGroup.vue, the tabs.

/**
 * stepTo returns the item of a row that `key` moves to from `index`, e.g. an
 * option or a tab, wrapping around (→ ← Home End), or undefined for another
 * key
 */
export const stepTo = (key: string, index: number, count: number) => {
  const moves: Record<string, number> = {
    ArrowRight: index + 1,
    ArrowLeft: index - 1,
    Home: 0,
    End: count - 1,
  };
  return key in moves ? (moves[key] + count) % count : undefined;
};

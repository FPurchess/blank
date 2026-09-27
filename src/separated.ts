/**
 * separated returns `items` with `separator` between neighbours of different
 * groups, e.g. the buttons of a toolbar or the items of a menu
 */
export const separated = <T extends { group: string }, S>(
  items: readonly T[],
  separator: S,
): (T | S)[] =>
  items.flatMap((item, index) =>
    index > 0 && items[index - 1].group !== item.group
      ? [separator, item]
      : [item],
  );

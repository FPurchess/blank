/**
 * shownIn returns the elements in `root` that match `selectors` and aren't
 * inside a hidden element, in document order: what Tab or the arrow keys can
 * move to
 */
export const shownIn = <E extends Element = HTMLElement>(
  root: ParentNode,
  selectors: string,
) =>
  [...root.querySelectorAll<E>(selectors)].filter(
    (element) => !element.closest("[hidden]"),
  );

/**
 * keepFocus keeps the focus where it is (in the editor, or in a menu) on a
 * press, except in a text field
 */
export const keepFocus = (event: MouseEvent) => {
  if (!(event.target as Element).closest("input, textarea")) {
    event.preventDefault();
  }
};

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

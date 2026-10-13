import { nextTick } from "vue";

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

/**
 * focusBack returns what gives the focus back to `opener`, e.g. the button
 * in the settings that opened a dialog above them, once that dialog closed:
 * after the next render, since the dialog's close may change what is
 * shown. An opener that is gone by then gives it to what `instead` finds,
 * e.g. the button that took its place, else to the first control of the
 * dialog it was in, so the focus stays in what is still open.
 */
export const focusBack = (
  opener: EventTarget | null,
  instead: () => HTMLElement | null = () => null,
) => {
  const element = opener instanceof HTMLElement ? opener : null;
  const dialog = element?.closest<HTMLElement>("[role=dialog]") ?? null;
  return () =>
    void nextTick(() => {
      if (element?.isConnected && !element.closest("[hidden]")) {
        element.focus();
        return;
      }
      const next =
        instead() ??
        (dialog?.isConnected
          ? shownIn(dialog, "input, button:not(:disabled)")[0]
          : undefined);
      next?.focus();
    });
};

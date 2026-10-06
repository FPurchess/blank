import { listenOnWindow } from "../../scope";

export interface DismissOptions {
  // Escape closes it too
  escape?: boolean;
  // any key closes it, e.g. a card that only shows something
  anyKey?: boolean;
  // the window losing the focus closes it
  blur?: boolean;
  // the window changing its size closes it, e.g. a popup placed once
  resize?: boolean;
}

/**
 * onScrollbar returns whether a press is on the scrollbar of the element it
 * landed on, e.g. the page view's: past its content box, where its
 * scrollbars are. Moving a scrollbar only looks elsewhere, so it closes
 * nothing.
 */
export const onScrollbar = (event: MouseEvent) => {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const { clientWidth, clientHeight, scrollHeight, scrollWidth } = target;
  return (
    (scrollHeight > clientHeight && event.offsetX >= clientWidth) ||
    (scrollWidth > clientWidth && event.offsetY >= clientHeight)
  );
};

/**
 * useDismiss closes what a component opened (a menu, a card, a floating list)
 * on a press anywhere outside `inside()`: its own elements and those that
 * belong to it, like the button that opened it, so a press there toggles it
 * instead of closing and reopening it. A press on a scrollbar isn't one
 * (onScrollbar), so the page view scrolls under what's open. With `options`, also on Escape, any
 * key, the window's blur or resize. Its listeners go with the component.
 * @returns contains, which tells whether a node is inside, e.g. to ignore a
 * scroll inside
 */
export const useDismiss = (
  inside: () => readonly (Node | null | undefined)[],
  close: () => void,
  options: DismissOptions = {},
) => {
  const contains = (target: EventTarget | null) =>
    target instanceof Node &&
    inside().some((element) => element?.contains(target));

  listenOnWindow(
    "pointerdown",
    (event) => {
      if (!contains(event.target) && !onScrollbar(event)) close();
    },
    true,
  );
  if (options.escape || options.anyKey) {
    listenOnWindow(
      "keydown",
      (event) => {
        // Escape is taken: closing may give the editor the focus, which
        // would get the rest of the press as typing. Any other key goes on,
        // e.g. typing on after a card that only showed something.
        if (options.escape && event.key === "Escape") {
          event.preventDefault();
          close();
        } else if (options.anyKey) close();
      },
      true,
    );
  }
  if (options.blur) listenOnWindow("blur", close);
  if (options.resize) listenOnWindow("resize", close, true);
  return { contains };
};

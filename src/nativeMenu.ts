import { bootScope, listenOnWindow } from "./scope";

/**
 * bootNativeMenuGuard keeps the webview's own context menu from showing up:
 * it offers reload and back, which lose the text. Text fields keep theirs,
 * and Shift + right click shows it anyway. It listens in the bubble phase,
 * since the editor ignores events that were prevented before it.
 * @returns dispose, which lets the webview's menu show again
 */
export const bootNativeMenuGuard = () =>
  bootScope(() =>
    listenOnWindow("contextmenu", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (event.shiftKey || target?.closest("input, textarea")) return;
      event.preventDefault();
    }),
  );

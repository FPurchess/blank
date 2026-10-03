import { watch } from "vue";

import { engineless } from "../../../engine/engine";
import { pageLayoutState, pageViewport } from "../../../state";

/**
 * followLayout calls `publish` again whenever the page view scrolled,
 * resized or switched, or the pages were laid out again (e.g. once an image
 * above loaded), and, without the engine, whenever the editor itself
 * scrolls. Like a watcher, it belongs to whatever scope is active.
 * @returns what stops it
 */
export const followLayout = (publish: () => void) => {
  const stop = watch([pageViewport, pageLayoutState], publish, {
    flush: "sync",
  });
  const scrolled = () => {
    if (engineless()) publish();
  };
  window.addEventListener("scroll", scrolled, true);
  return () => {
    stop();
    window.removeEventListener("scroll", scrolled, true);
  };
};

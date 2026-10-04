import { shallowRef } from "vue";

import { listenOnWindow } from "../../scope";

/**
 * useWindowWidth returns the window's width, kept up to date while the
 * component that uses it is mounted
 */
export const useWindowWidth = () => {
  const width = shallowRef(window.innerWidth);
  listenOnWindow("resize", () => (width.value = window.innerWidth));
  return width;
};

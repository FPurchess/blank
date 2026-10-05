import { onMounted, onUnmounted } from "vue";

/**
 * useResizeObserver calls `resized` whenever one of the elements `targets()`
 * gives once mounted changes its size, until the component goes; nothing
 * where there is no ResizeObserver, as in jsdom
 */
export const useResizeObserver = (
  targets: () => readonly (Element | null | undefined)[],
  resized: () => void,
) => {
  let observer: ResizeObserver | undefined;
  onMounted(() => {
    if (typeof ResizeObserver === "undefined") return;
    observer = new ResizeObserver(() => resized());
    for (const target of targets()) if (target) observer.observe(target);
  });
  onUnmounted(() => observer?.disconnect());
};

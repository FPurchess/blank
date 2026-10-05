import { getCurrentWindow } from "@tauri-apps/api/window";
import { computed, watch } from "vue";

import { activeTab, tabLabel } from "./state";

/**
 * windowTitle returns the window's title for the tab `label`, e.g.
 * "notes — Blank". The tab shows whether it is saved.
 */
export const windowTitle = (label: string | null) =>
  label === null ? "Blank" : `${label} — Blank`;

/**
 * bootWindowTitle names the window after the active tab
 * @returns the watcher's stop handle
 */
export const bootWindowTitle = () => {
  const title = computed(() =>
    windowTitle(activeTab.value && tabLabel(activeTab.value)),
  );
  return watch(
    title,
    async (value) => {
      try {
        await getCurrentWindow().setTitle(value);
      } catch (error) {
        // e.g. in a browser, without Tauri
        console.warn("can't set the window's title", error);
      }
    },
    { immediate: true },
  );
};

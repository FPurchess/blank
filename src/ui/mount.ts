import { createApp, onScopeDispose, watch } from "vue";

import { EditorKey, type EditorHandle } from "../editor/handle";
import { bootScope } from "../scope";
import { forgetFills } from "../pdf/fills";
import { forgetPlaces } from "../pdf/placesRead";
import { isPdfTab, tabs } from "../state";
import { uiRoot } from "../uiRoot";
import App from "./App.vue";
import { pdfBitmaps } from "./pageBitmaps";
import { closedKeys } from "./pdfViewModel";

/**
 * bootApp mounts the Vue app into the UI root, with `editor` for useEditor
 * @returns dispose, which unmounts it
 */
export const bootApp = (editor: EditorHandle) =>
  bootScope(() => {
    const element = document.createElement("div");
    element.id = "ui-app";
    uiRoot().append(element);
    const app = createApp(App);
    app.provide(EditorKey, editor);
    app.mount(element);
    // the bitmaps, places and fills sent of closed PDF tabs go, also while
    // no PDF shows
    watch(
      tabs,
      (list) => {
        const open = new Set(list.filter(isPdfTab).map((tab) => tab.id));
        for (const key of closedKeys(pdfBitmaps.keys(), open))
          pdfBitmaps.delete(key);
        forgetPlaces(open);
        forgetFills(open);
      },
      { immediate: true },
    );
    onScopeDispose(() => {
      app.unmount();
      element.remove();
    });
  });

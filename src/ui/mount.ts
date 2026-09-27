import { createApp, onScopeDispose } from "vue";

import { EditorKey, type EditorHandle } from "../editor/handle";
import { bootScope } from "../scope";
import { uiRoot } from "../uiRoot";
import App from "./App.vue";

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
    onScopeDispose(() => {
      app.unmount();
      element.remove();
    });
  });

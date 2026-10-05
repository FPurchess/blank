import { onScopeDispose } from "vue";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";

import { bootNativeMenuGuard } from "./nativeMenu";
import { bootWindowTitle } from "./windowTitle";
import { bootScope } from "./scope";
import { bootApp } from "./ui/mount";
import type { EditorHandle } from "./editor/handle";
import { uiRoot } from "./uiRoot";

export const setupNotification = async () => {
  const hasPermission = await isPermissionGranted();
  if (!hasPermission) {
    await requestPermission();
  }
};

/**
 * bootUI mounts the Vue app, which renders all of the UI around the editor
 * and works with `editor`, and keeps the webview's own context menu away. It
 * runs after bootEditor, so the UI comes after the editor.
 * @returns dispose, which stops rendering and removes the UI, e.g. between
 * tests
 */
export const bootUI = (editor: EditorHandle) =>
  bootScope(() => {
    const root = uiRoot();
    onScopeDispose(() => root.remove());

    bootNativeMenuGuard();
    bootApp(editor);
    bootWindowTitle();

    // FIXME: better handling of permission errors
    setupNotification().catch(console.error);
  });

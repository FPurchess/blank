import { onScopeDispose } from "vue";
import {
  isPermissionGranted,
  requestPermission,
} from "@tauri-apps/plugin-notification";

import { bootNativeMenuGuard } from "./nativeMenu";
import { bootBandStrips } from "./bandStrips";
import { bootTableHandles } from "./tableHandles";
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
 * bootUI mounts the Vue app, which renders the bars, dialogs, menus, pickers
 * and toolbars and works with `editor`, and boots the parts that aren't Vue
 * yet. It runs after bootEditor, so the UI comes after the editor.
 * @returns dispose, which stops rendering and removes the UI, e.g. between
 * tests
 */
export const bootUI = (editor: EditorHandle) =>
  bootScope(() => {
    const root = uiRoot();
    onScopeDispose(() => root.remove());

    // everything here is fixed, so at the same z-index what comes later paints
    // on top: the Vue app after the header and footer strips, so the table
    // toolbar stays above a strip it overlaps (both 5), and the table handles
    // (4) last
    bootBandStrips(editor);
    bootNativeMenuGuard();
    bootApp(editor);
    bootTableHandles();

    // FIXME: better handling of permission errors
    setupNotification().catch(console.error);
  });

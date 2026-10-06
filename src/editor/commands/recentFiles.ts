import { exists } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";
import type { Command } from "prosemirror-state";

import { basename } from "../../paths";
import { announce, forgetFile, recentFiles } from "../../state";
import { openPaths } from "../tabs";

/**
 * openRecentFile opens the recent file at `path`, or shows its tab if it's
 * open; one that is gone is said so and leaves the list
 */
export const openRecentFile =
  (path: string): Command =>
  (_state, dispatch) => {
    if (!dispatch) return true;
    void (async () => {
      const there = await exists(path).catch(() => false);
      if (!there) {
        forgetFile(path);
        sendNotification(`${basename(path)} isn't there any more`);
        return;
      }
      await openPaths([path]);
    })();
    return true;
  };

/**
 * clearRecentFiles empties the list of recent files
 */
export const clearRecentFiles = (): Command => (_state, dispatch) => {
  if (dispatch) {
    recentFiles.value = [];
    announce("Recent files cleared");
  }
  return true;
};

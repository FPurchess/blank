import type { Command } from "prosemirror-state";

import { open } from "@tauri-apps/plugin-dialog";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { errorMessage } from "../../errors";
import { OPEN_FILTERS } from "../../formats";
import { activeTabId, tabs } from "../../state";
import {
  activateTab,
  closeTabs,
  cycleTab,
  moveTab as move,
  openNewTab,
  openPaths,
  reopenTab as reopen,
  saveTab,
} from "../tabs";
import type { Options as SaveOptions } from "./saveFile";

// The commands of the tabs, for the keymap and the tab row. Each starts its
// change and returns true right away; the change runs after those asked for
// before it (see src/editor/tabs.ts).

/**
 * action returns a command that runs `run`
 */
const action =
  (run: () => unknown): Command =>
  (_state, dispatch) => {
    if (dispatch) void run();
    return true;
  };

// the tab `id`, or the active one
const tabOr = (id?: string) => id ?? activeTabId.value;

/**
 * newFile opens a new, empty tab
 */
export const newFile = (): Command => action(() => openNewTab());

/**
 * openFile lets the user choose files, each of which opens in a tab
 */
export const openFile = (): Command =>
  action(async () => {
    let chosen: string[] | null;
    try {
      chosen = await open({ filters: OPEN_FILTERS, multiple: true });
    } catch (err) {
      console.error(`Failed to open file: ${errorMessage(err)}`);
      sendNotification(`Failed to open file: ${errorMessage(err)}`);
      return;
    }
    if (chosen) await openPaths(chosen);
  });

/**
 * saveFile saves the tab `id`, the active one by default, to its file, or
 * with `force` where the user chooses
 */
export const saveFile = (
  options: SaveOptions = { force: false },
  id?: string,
): Command => {
  const frozen = Object.freeze({ ...options });
  return (state, dispatch) => {
    const tab = tabOr(id);
    if (dispatch && tab !== null) {
      // the shown tab saves the state the command was given
      void saveTab(tab, frozen, tab === activeTabId.value ? state : undefined);
    }
    return true;
  };
};

/**
 * selectTab shows the tab `id`
 */
export const selectTab = (id: string): Command => action(() => activateTab(id));

/**
 * cycleTabs shows the next tab to the right, or with -1 to the left,
 * wrapping around
 */
export const cycleTabs = (by: 1 | -1): Command => action(() => cycleTab(by));

/**
 * closeTab closes the tab `id`, the active one by default
 */
export const closeTab = (id?: string): Command =>
  action(() => {
    const tab = tabOr(id);
    return tab === null ? undefined : closeTabs([tab]);
  });

/**
 * closeOtherTabs closes every tab but `id`
 */
export const closeOtherTabs = (id: string): Command =>
  action(() =>
    closeTabs(tabs.value.filter((tab) => tab.id !== id).map((tab) => tab.id)),
  );

/**
 * closeTabsToRight closes the tabs right of `id`
 */
export const closeTabsToRight = (id: string): Command =>
  action(() => {
    const index = tabs.value.findIndex((tab) => tab.id === id);
    return closeTabs(tabs.value.slice(index + 1).map((tab) => tab.id));
  });

/**
 * moveTab moves the tab `id`, the active one by default, one place to the
 * right, or with -1 to the left
 */
export const moveTab = (by: 1 | -1, id?: string): Command =>
  action(() => {
    const tab = tabOr(id);
    if (tab !== null) move(tab, by);
  });

/**
 * reopenTab opens the file of the tab closed last again
 */
export const reopenTab = (): Command => action(() => reopen());

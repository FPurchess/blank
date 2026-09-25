import { browser, $ } from "@wdio/globals";
import { Key } from "webdriverio";

import { application } from "./app.ts";

/**
 * waits until the app has booted, i.e. the editor and the UI are rendered
 * (see the boot order in src/main.ts)
 */
export const waitForAppReady = async () => {
  await browser.waitUntil(
    async () => {
      try {
        return (
          (await $(".ProseMirror").isExisting()) &&
          (await $("#ui-bottom").isExisting())
        );
      } catch {
        // commands issued mid-navigation may fail, which just means "not ready yet"
        return false;
      }
    },
    {
      timeout: 30000,
      interval: 250,
      timeoutMsg: "the app did not boot (no editor / UI rendered)",
    },
  );
};

/**
 * restarts the app by creating a new session. tauri-driver keeps running, hence
 * the app keeps its profile (storage) from the previous run.
 * @param args CLI arguments to launch the app with
 */
export const restartApp = async (args: string[] = []) => {
  await browser.reloadSession({
    "tauri:options": { application, args },
  } as unknown as WebdriverIO.Capabilities);
  await waitForAppReady();
};

export const focusEditor = async () => {
  await $(".ProseMirror").click();
};

/**
 * presses a keyboard shortcut using `Mod`, which translates to Ctrl on Linux
 * @param keys keys to press along with `Mod`
 */
export const pressMod = async (...keys: string[]) => {
  await browser.keys([Key.Ctrl, ...keys]);
};

/**
 * types the given text. Every char is sent as separate key action, since WebKitWebDriver
 * drops consecutive identical chars within a single action (e.g. "ll" becomes "l")
 * @param text text to type
 */
export const type = async (text: string) => {
  for (const char of text) {
    await browser.keys(char);
  }
};

export { Key };

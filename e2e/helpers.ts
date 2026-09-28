import { browser, $, $$ } from "@wdio/globals";
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
          (await $("#editor").isExisting()) &&
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
  // and until it's laid out with its fonts and on screen: a click right
  // after the page is rendered can get lost otherwise
  await browser.executeAsync((done: () => void) => {
    void document.fonts.ready.then(() =>
      requestAnimationFrame(() => requestAnimationFrame(() => done())),
    );
  });
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

/**
 * clicks into the editor text at `selector` (the `index`th match) and waits until the editor has
 * taken in where the cursor went: the editor learns that from the
 * "selectionchange" event, which the webview queues after the click, and
 * keys sent before it would still go where the cursor was
 */
export const clickInto = async (selector: string, index = 0) => {
  await $$(selector)[index].click();
  await browser.executeAsync((done: () => void) => {
    // two frames: the queued events have run once the second one starts
    requestAnimationFrame(() => requestAnimationFrame(() => done()));
  });
};

export const focusEditor = async () => {
  await $("#editor").click();
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

/**
 * pastes `data` (by type, e.g. text/plain) into the editor the way the
 * keyboard's paste does: the system clipboard is out of the webview's reach
 * in E2E
 */
export const paste = (data: Record<string, string>) =>
  browser.execute((data: Record<string, string>) => {
    const clipboard = new DataTransfer();
    for (const [type, value] of Object.entries(data)) {
      clipboard.setData(type, value);
    }
    document.querySelector("#editor")!.dispatchEvent(
      new ClipboardEvent("paste", {
        clipboardData: clipboard,
        bubbles: true,
        cancelable: true,
      }),
    );
  }, data);

/**
 * moves the mouse to the middle of the top or bottom edge of the window,
 * where the hints to add a header or footer show
 */
export const hoverEdge = async (edge: "top" | "bottom") => {
  const { width, height } = await browser.getWindowSize();
  const y = edge === "top" ? 20 : height - 20;
  await browser
    .action("pointer")
    .move({ x: Math.round(width / 2), y: Math.round(y), origin: "viewport" })
    .perform();
};

export { Key };

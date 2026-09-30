import { browser, $, $$ } from "@wdio/globals";
import { Key } from "webdriverio";

import { application } from "./app.ts";

// the geometry of what the page view paints, see src/engine/geometry.ts
interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

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
 * clicks where the pages show the end of the text of the editor's element at
 * `selector` (the `index`th match), as a click right of its last line does,
 * and waits until the editor has taken in where the cursor went
 */
export const clickInto = async (
  selector: string,
  index = 0,
  button: 0 | 1 | 2 = 0,
) => {
  const box = await browser.executeAsync(
    (selector: string, index: number, done: (box: Box | null) => void) => {
      const geometry = (
        window as unknown as {
          blankGeometry: {
            endOf: (element: Element) => number;
            caretBox: (pos: number) => Box | null;
          };
        }
      ).blankGeometry;
      const element = document.querySelectorAll(selector)[index];
      if (!element) return done(null);
      const pos = geometry.endOf(element);
      const view = document.getElementById("page-view")!;
      const caret = geometry.caretBox(pos);
      if (caret && (caret.top < 80 || caret.bottom > view.clientHeight - 80)) {
        view.scrollTop += caret.top - view.clientHeight / 2;
        // the view measures a scroll once a frame
        return requestAnimationFrame(() =>
          requestAnimationFrame(() => done(geometry.caretBox(pos))),
        );
      }
      done(caret);
    },
    selector,
    index,
  );
  if (!box) throw new Error(`${selector} isn't painted on the pages`);
  await browser
    .action("pointer")
    .move({
      x: Math.round(box.left),
      y: Math.round((box.top + box.bottom) / 2),
      origin: "viewport",
    })
    .down({ button })
    .up({ button })
    .perform();
  await browser.executeAsync((done: () => void) => {
    // two frames: the queued events have run once the second one starts
    requestAnimationFrame(() => requestAnimationFrame(() => done()));
  });
};

/**
 * expectEditorText waits until the text of the editor's element at
 * `selector` (the `index`th match) is `expected`, or matches it; the editor
 * is hidden behind the pages, where WebDriver's getText reads nothing
 */
export const expectEditorText = async (
  selector: string,
  expected: string | RegExp,
  index = 0,
) => {
  let last: string | null = null;
  const matches = (text: string | null) =>
    text !== null &&
    (typeof expected === "string"
      ? text.trim() === expected
      : expected.test(text));
  await browser
    .waitUntil(async () => {
      last = await browser.execute(
        (selector: string, index: number) =>
          document.querySelectorAll(selector)[index]?.textContent ?? null,
        selector,
        index,
      );
      return matches(last);
    })
    .catch(() => {
      throw new Error(
        `${selector} has ${JSON.stringify(last)}, not ${String(expected)}`,
      );
    });
};

/**
 * focusEditor gives the editor the focus, as a click on the pages does
 */
export const focusEditor = async () => {
  await browser.execute(() =>
    document.querySelector<HTMLElement>("#editor")!.focus(),
  );
};

/**
 * textBox returns where the `index`th occurrence of `text` is painted, as
 * the caret before its `offset`th character, in viewport px, scrolling it
 * into view first
 */
export const textBox = async (text: string, offset = 0, index = 0) => {
  const box = await browser.executeAsync(
    (
      text: string,
      offset: number,
      index: number,
      done: (box: Box | null) => void,
    ) => {
      const geometry = (
        window as unknown as {
          blankGeometry: {
            find: (text: string, index: number) => number;
            caretBox: (pos: number) => Box | null;
          };
        }
      ).blankGeometry;
      const pos = geometry.find(text, index);
      if (pos < 0) return done(null);
      const view = document.getElementById("page-view")!;
      const caret = geometry.caretBox(pos + offset);
      if (caret && (caret.top < 80 || caret.bottom > view.clientHeight - 80)) {
        view.scrollTop += caret.top - view.clientHeight / 2;
        // the view measures a scroll once a frame
        return requestAnimationFrame(() =>
          requestAnimationFrame(() => done(geometry.caretBox(pos + offset))),
        );
      }
      done(caret);
    },
    text,
    offset,
    index,
  );
  if (!box) throw new Error(`"${text}" isn't painted on the pages`);
  return box;
};

/**
 * clickText clicks on the painted pages where the `offset`th character of
 * `text` starts (the right button with `button: 2`), and waits until the
 * editor took it in
 */
export const clickText = async (
  text: string,
  {
    offset = 0,
    index = 0,
    button = 0,
  }: { offset?: number; index?: number; button?: 0 | 1 | 2 } = {},
) => {
  const box = await textBox(text, offset, index);
  await browser
    .action("pointer")
    .move({
      x: Math.round(box.left + 1),
      y: Math.round((box.top + box.bottom) / 2),
      origin: "viewport",
    })
    .down({ button })
    .up({ button })
    .perform();
  await browser.executeAsync((done: () => void) => {
    requestAnimationFrame(() => requestAnimationFrame(() => done()));
  });
};

/**
 * editorText returns the text of the editor's elements at `selector`, which
 * are hidden behind the pages: WebDriver's getText only reads what is shown
 */
export const editorText = (selector = "#editor") =>
  browser.execute(
    (selector: string) =>
      [...document.querySelectorAll(selector)].map(
        (element) => element.textContent ?? "",
      ),
    selector,
  );

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

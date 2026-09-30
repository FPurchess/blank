import { browser, $, $$ } from "@wdio/globals";
import { Key } from "webdriverio";

import { application } from "./app.ts";

// the geometry of what the page view paints, see src/engine/geometry.ts
export interface Box {
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
 * `selector` (the `index`th match, from the end if negative), as a click
 * right of its last line does,
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
      const all = document.querySelectorAll(selector);
      // from the end for a negative index
      const element = all[index < 0 ? all.length + index : index];
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
  await clickAt(box.left, (box.top + box.bottom) / 2, button);
};

/**
 * clickAt clicks with the pointer at `x`, `y` in the viewport, and waits
 * until the page has run the events it queued
 */
export const clickAt = async (x: number, y: number, button: 0 | 1 | 2 = 0) => {
  await browser
    .action("pointer")
    .move({ x: Math.round(x), y: Math.round(y), origin: "viewport" })
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
 * focusEditor gives the editor the focus with a click on the pages, at the
 * end of the text
 */
export const focusEditor = async () => {
  await clickInto("#editor > :is(p, h1, h2, h3, h4, h5, h6)", -1);
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
  await clickAt(box.left + 1, (box.top + box.bottom) / 2, button);
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

export type Rgb = [number, number, number];

// what is painted in a box: the share of its pixels that show something,
// and their mean colour, null where nothing is
export interface Ink {
  share: number;
  ink: Rgb | null;
}

export interface InkOptions {
  // the part of the text: from its `offset`th character, `length` of them
  offset?: number;
  length?: number;
  // the `index`th occurrence of the text
  index?: number;
  // "canvas" reads the pages' canvases, "screen" a screenshot, which also
  // has what is shown over them, like the selection and the marks
  source?: "canvas" | "screen";
}

/**
 * boxOf returns the box around where `text` (its part in `options`) is
 * painted, in viewport px, scrolling it into view first; a box is returned
 * as it is
 */
export const boxOf = async (
  target: string | Box,
  { offset = 0, length, index = 0 }: InkOptions = {},
): Promise<Box> => {
  if (typeof target !== "string") return target;
  // scrolls it into view
  await textBox(target, offset, index);
  const box = await browser.execute(
    (text: string, from: number, count: number, index: number) => {
      const geometry = (
        window as unknown as {
          blankGeometry: {
            find: (text: string, index: number) => number;
            rangeRects: (from: number, to: number) => Box[];
          };
        }
      ).blankGeometry;
      const pos = geometry.find(text, index);
      if (pos < 0) return null;
      const rects = geometry.rangeRects(pos + from, pos + from + count);
      if (!rects.length) return null;
      return {
        left: Math.min(...rects.map((rect) => rect.left)),
        top: Math.min(...rects.map((rect) => rect.top)),
        right: Math.max(...rects.map((rect) => rect.right)),
        bottom: Math.max(...rects.map((rect) => rect.bottom)),
      };
    },
    target,
    offset,
    length ?? target.length - offset,
    index,
  );
  if (!box) throw new Error(`"${target}" isn't painted on the pages`);
  return box;
};

/**
 * canvasInk reads the pixels of the pages' canvases in `box`: a pixel shows
 * ink where it isn't transparent, since a page paints its text over nothing
 * (the sheet's colour is under it). It reads what the canvases show,
 * painted or drawn from a kept bitmap.
 */
const canvasInk = (box: Box) =>
  browser.execute((box: Box) => {
    let total = 0;
    let inked = 0;
    const sum = [0, 0, 0];
    // a frame's canvases lie over each other, its text and its header and
    // footer, so a pixel counts once, with the ink of either
    for (const frame of document.querySelectorAll<HTMLElement>(
      "#page-view .page-frame",
    )) {
      const canvases = [
        ...frame.querySelectorAll<HTMLCanvasElement>(".page-canvas"),
      ];
      if (!canvases.length) continue;
      const rect = canvases[0].getBoundingClientRect();
      const left = Math.max(box.left, rect.left);
      const top = Math.max(box.top, rect.top);
      const right = Math.min(box.right, rect.right);
      const bottom = Math.min(box.bottom, rect.bottom);
      if (right <= left || bottom <= top || !rect.width || !rect.height)
        continue;
      // device pixels of the canvas per CSS pixel
      const sx = canvases[0].width / rect.width;
      const sy = canvases[0].height / rect.height;
      const x = Math.floor((left - rect.left) * sx);
      const y = Math.floor((top - rect.top) * sy);
      const width = Math.max(1, Math.ceil((right - left) * sx));
      const height = Math.max(1, Math.ceil((bottom - top) * sy));
      const layers = canvases.map(
        (canvas) =>
          canvas.getContext("2d")!.getImageData(x, y, width, height).data,
      );
      for (let index = 0; index < layers[0].length; index += 4) {
        total++;
        // the layer on top, which is the one seen
        const shown = layers
          .slice()
          .reverse()
          .find((data) => data[index + 3] >= 24);
        // faint marks too: table lines paint at 0.2 (ROLE_OPACITY)
        if (!shown) continue;
        inked++;
        for (let channel = 0; channel < 3; channel++)
          sum[channel] += shown[index + channel];
      }
    }
    return { total, inked, sum };
  }, box);

export interface ScreenStats extends Ink {
  // the most common colour in the box, and the mean of all of it
  background: Rgb;
  mean: Rgb;
}

/**
 * screenStats reads the pixels of a screenshot in `box`: ink is what
 * differs from the most common colour there
 */
export const screenStats = async (box: Box): Promise<ScreenStats> => {
  const png = await browser.takeScreenshot();
  return browser.executeAsync(
    (png: string, box: Box, done: (stats: ScreenStats) => void) => {
      const image = new Image();
      image.onload = () => {
        const scale = image.width / window.innerWidth;
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d")!;
        context.drawImage(image, 0, 0);
        const x = Math.max(0, Math.floor(box.left * scale));
        const y = Math.max(0, Math.floor(box.top * scale));
        const width = Math.max(1, Math.ceil((box.right - box.left) * scale));
        const height = Math.max(1, Math.ceil((box.bottom - box.top) * scale));
        const { data } = context.getImageData(x, y, width, height);
        const counts = new Map<number, number>();
        const mean = [0, 0, 0];
        const pixels = data.length / 4;
        for (let index = 0; index < data.length; index += 4) {
          const key =
            (data[index] << 16) | (data[index + 1] << 8) | data[index + 2];
          counts.set(key, (counts.get(key) ?? 0) + 1);
          for (let channel = 0; channel < 3; channel++)
            mean[channel] += data[index + channel] / pixels;
        }
        let common = 0;
        let most = 0;
        for (const [key, count] of counts)
          if (count > most) [common, most] = [key, count];
        const background: Rgb = [
          (common >> 16) & 255,
          (common >> 8) & 255,
          common & 255,
        ];
        let inked = 0;
        const sum = [0, 0, 0];
        for (let index = 0; index < data.length; index += 4) {
          const distance =
            Math.abs(data[index] - background[0]) +
            Math.abs(data[index + 1] - background[1]) +
            Math.abs(data[index + 2] - background[2]);
          if (distance < 40) continue;
          inked++;
          for (let channel = 0; channel < 3; channel++)
            sum[channel] += data[index + channel];
        }
        done({
          share: inked / pixels,
          ink: inked ? [sum[0] / inked, sum[1] / inked, sum[2] / inked] : null,
          background,
          mean: mean as Rgb,
        });
      };
      image.src = `data:image/png;base64,${png}`;
    },
    png,
    box,
  );
};

/**
 * paintedInk returns how much is painted where `target` is (a text on the
 * pages, or a box in viewport px), and in what colour
 */
export const paintedInk = async (
  target: string | Box,
  options: InkOptions = {},
): Promise<Ink> => {
  const box = await boxOf(target, options);
  if (options.source === "screen") {
    const { share, ink } = await screenStats(box);
    return { share, ink };
  }
  const { total, inked, sum } = await canvasInk(box);
  if (!total) throw new Error(`no page is painted at ${JSON.stringify(box)}`);
  return {
    share: inked / total,
    ink: inked ? [sum[0] / inked, sum[1] / inked, sum[2] / inked] : null,
  };
};

/**
 * waitForInk waits until more than `min` of the pixels where `target` is
 * show ink: the pages paint in the frames after a change
 */
export const waitForInk = async (
  target: string | Box,
  options: InkOptions = {},
  min = 0.02,
) => {
  let last: Ink | string | null = null;
  await browser
    .waitUntil(async () => {
      try {
        last = await paintedInk(target, options);
      } catch (error) {
        last = String(error);
        return false;
      }
      return last.share > min;
    })
    .catch(() => {
      throw new Error(
        `${JSON.stringify(target)} isn't painted: ${JSON.stringify(last)}`,
      );
    });
  return last! as Ink;
};

/**
 * screenColor returns the mean colour a screenshot shows in `box`
 */
export const screenColor = async (box: Box) => (await screenStats(box)).mean;

/**
 * luminance returns the relative luminance of a colour of 0–255 channels,
 * as WCAG defines it
 */
export const luminance = ([r, g, b]: Rgb) => {
  const linear = (value: number) => {
    const c = value / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
};

/**
 * contrast returns the WCAG contrast ratio of two colours
 */
export const contrast = (a: Rgb, b: Rgb) => {
  const [dark, light] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (light + 0.05) / (dark + 0.05);
};

/**
 * doubleClickAt double-clicks with the pointer at `x`, `y` in the viewport
 */
export const doubleClickAt = async (x: number, y: number) => {
  await browser
    .action("pointer")
    .move({ x: Math.round(x), y: Math.round(y), origin: "viewport" })
    .down()
    .up()
    .pause(40)
    .down()
    .up()
    .perform();
  await browser.executeAsync((done: () => void) => {
    requestAnimationFrame(() => requestAnimationFrame(() => done()));
  });
};

/**
 * selectionColor returns the colour the pages show the selection in: the
 * most common one in the first selected box, whatever the text in it
 */
export const selectionColor = async () => {
  const box = await browser.execute(() => {
    const rect = document
      .querySelector("#page-view .page-selection")
      ?.getBoundingClientRect();
    return rect
      ? {
          left: rect.left + 1,
          right: rect.right - 1,
          top: rect.top + 1,
          bottom: rect.bottom - 1,
        }
      : null;
  });
  if (!box) throw new Error("no selection is shown on the pages");
  return (await screenStats(box)).background;
};

/**
 * topPage returns the page shown at the top of the page view, counted from
 * 1: the first whose frame reaches below the bar at the top
 */
export const topPage = () =>
  browser.execute(() => {
    const view = document.getElementById("page-view")!.getBoundingClientRect();
    for (const frame of document.querySelectorAll<HTMLElement>(
      "#page-view .page-frame",
    )) {
      if (frame.getBoundingClientRect().bottom > view.top + 60)
        return Number(frame.dataset.page);
    }
    return null;
  });

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

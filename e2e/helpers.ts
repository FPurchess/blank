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
      const geometry = window.blankGeometry;
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
 * nextFrames waits two frames of the app: the events queued before have run
 * once the second one starts, and what they changed is painted
 */
export const nextFrames = () =>
  browser.executeAsync((done: () => void) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done())),
  );

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
  await nextFrames();
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
      const geometry = window.blankGeometry;
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
 * pointAt returns a point on the `offset`th character of `text` as painted,
 * `dx` px right of its left edge and halfway down, for pointer actions
 */
export const pointAt = async (text: string, offset = 0, dx = 1) => {
  const box = await textBox(text, offset);
  return {
    x: Math.round(box.left + dx),
    y: Math.round((box.top + box.bottom) / 2),
    origin: "viewport" as const,
  };
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
  // which of a page's canvases, e.g. ".page-bands.header" for its header
  layers?: string;
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
      const geometry = window.blankGeometry;
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
const canvasInk = (box: Box, layers = ".page-canvas") =>
  browser.execute(
    (box: Box, layers: string) => {
      let total = 0;
      let inked = 0;
      // what the pixels show, as a number that changes when any of them does
      let print = 0;
      const sum = [0, 0, 0];
      // a frame's canvases lie over each other, its text and the strips of
      // its header and footer, so a pixel counts once, with the ink on top
      for (const frame of document.querySelectorAll<HTMLElement>(
        "#page-view .page-frame",
      )) {
        const canvases = [...frame.querySelectorAll<HTMLCanvasElement>(layers)];
        const base = frame
          .querySelector<HTMLCanvasElement>(".page-canvas")
          ?.getBoundingClientRect();
        if (!base?.width || !base.height) continue;
        const left = Math.max(box.left, base.left);
        const top = Math.max(box.top, base.top);
        const right = Math.min(box.right, base.right);
        const bottom = Math.min(box.bottom, base.bottom);
        if (right <= left || bottom <= top) continue;
        if (!canvases.length) continue;
        // device pixels per CSS pixel, the same for all of the frame's
        const ratio =
          canvases[0].width / canvases[0].getBoundingClientRect().width;
        const columns = Math.max(1, Math.ceil((right - left) * ratio));
        const rows = Math.max(1, Math.ceil((bottom - top) * ratio));
        total += columns * rows;
        // the colour seen at each device pixel of the box, by row and column
        const seen = new Map<number, number[]>();
        for (const canvas of canvases) {
          const rect = canvas.getBoundingClientRect();
          const x0 = Math.max(left, rect.left);
          const y0 = Math.max(top, rect.top);
          const x1 = Math.min(right, rect.right);
          const y1 = Math.min(bottom, rect.bottom);
          if (x1 <= x0 || y1 <= y0) continue;
          const x = Math.floor((x0 - rect.left) * ratio);
          const y = Math.floor((y0 - rect.top) * ratio);
          const width = Math.max(1, Math.ceil((x1 - x0) * ratio));
          const height = Math.max(1, Math.ceil((y1 - y0) * ratio));
          const { data } = canvas
            .getContext("2d")!
            .getImageData(x, y, width, height);
          // where this part lies in the box
          const column0 = Math.round((x0 - left) * ratio);
          const row0 = Math.round((y0 - top) * ratio);
          for (let row = 0; row < height; row++) {
            for (let column = 0; column < width; column++) {
              const index = (row * width + column) * 4;
              // faint marks too: table lines paint at 0.2 (ROLE_OPACITY)
              if (data[index + 3] < 24) continue;
              seen.set((row0 + row) * columns + column0 + column, [
                data[index],
                data[index + 1],
                data[index + 2],
              ]);
            }
          }
        }
        inked += seen.size;
        for (const [at, color] of seen) {
          print = (Math.imul(print, 31) + at * 7 + color[0] + color[1]) | 0;
          for (let channel = 0; channel < 3; channel++)
            sum[channel] += color[channel];
        }
      }
      return { total, inked, sum, print };
    },
    box,
    layers,
  );

export interface ScreenStats extends Ink {
  // the most common colour in the box, and the mean of all of it
  background: Rgb;
  mean: Rgb;
  // the colour farthest from the most common one, e.g. the core of the
  // glyphs over a selection, whose edges blend with it
  farthest: Rgb;
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
        // within the screenshot: what lies outside it would read as black
        const x = Math.max(0, Math.floor(box.left * scale));
        const y = Math.max(0, Math.floor(box.top * scale));
        const right = Math.min(image.width, Math.ceil(box.right * scale));
        const bottom = Math.min(image.height, Math.ceil(box.bottom * scale));
        const width = Math.max(1, right - x);
        const height = Math.max(1, bottom - y);
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
        let farthest: Rgb = background;
        let far = 0;
        for (let index = 0; index < data.length; index += 4) {
          const distance =
            Math.abs(data[index] - background[0]) +
            Math.abs(data[index + 1] - background[1]) +
            Math.abs(data[index + 2] - background[2]);
          if (distance > far) {
            far = distance;
            farthest = [data[index], data[index + 1], data[index + 2]];
          }
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
          farthest,
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
  const { total, inked, sum } = await canvasInk(box, options.layers);
  if (!total) throw new Error(`no page is painted at ${JSON.stringify(box)}`);
  return {
    share: inked / total,
    ink: inked ? [sum[0] / inked, sum[1] / inked, sum[2] / inked] : null,
  };
};

/**
 * inkPrint returns a number for what the pages' canvases show in `box`,
 * which changes when they are painted again with something else there
 */
export const inkPrint = async (box: Box) => (await canvasInk(box)).print;

/**
 * waitForRepaint waits until the pages show something else in `box` than
 * `before` (from inkPrint): a change to the text is painted, not merely laid
 * out, while the canvas still shows what it showed until its repaint
 */
export const waitForRepaint = async (box: Box, before: number) => {
  await browser.waitUntil(async () => (await inkPrint(box)) !== before, {
    timeoutMsg: `nothing was painted again at ${JSON.stringify(box)}`,
  });
};

/**
 * lineBox returns the box of the whole line `text` is on, as wide as the
 * view, scrolling it into view first
 */
export const lineBox = async (text: string): Promise<Box> => {
  const box = await boxOf(text);
  return { left: 0, right: 10_000, top: box.top, bottom: box.bottom };
};

/**
 * waitForInk waits until more than `min` of the pixels where `target` is
 * show ink: the pages paint in the frames after a change
 */
export const waitForInk = async (
  target: string | Box,
  options: InkOptions = {},
  // a word covers 15–30 % of its box, a line a bit less
  min = 0.05,
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
  await nextFrames();
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
 * pressShift presses `key` with Shift held, as separate actions:
 * WebKitWebDriver drops the Shift of `browser.keys`
 */
export const pressShift = async (key: string) => {
  await browser.performActions([
    {
      type: "key",
      id: "keyboard",
      actions: [
        { type: "keyDown", value: Key.Shift },
        { type: "keyDown", value: key },
        { type: "keyUp", value: key },
        { type: "keyUp", value: Key.Shift },
      ],
    },
  ]);
  await browser.releaseActions();
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

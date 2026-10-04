// What the docs shots (*.shots.ts next to this file) share: where the images
// go, the recorder that films a GIF, the stills, and new documents to film in.
// scripts/docs-shots.sh runs the spec files side by side, each in an app of
// its own; CI proposes what they capture in a PR (.github/workflows/e2e.yml).
//
// Every picture comes twice, in the light theme and as `<name>-dark`, which
// the docs show as the site's own theme is light or dark (`<Shot>` in
// docs/.vitepress/theme/). The frames repeat from run to run: each waits until
// the app has painted, and the CSS transitions and animations run on a
// virtual clock that the frames advance by their durations.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { $, browser } from "@wdio/globals";

import {
  activeTab,
  clickText,
  focusEditor,
  Key,
  onlyNewTab,
  pressMod,
  pressShift,
  restartApp,
  tabLabels,
  type,
} from "../helpers.ts";
import {
  BAND_HEIGHT,
  STATUS_HEIGHT,
  TOP_BAR_HEIGHT,
} from "../../src/chrome.ts";

const dirname = path.dirname(fileURLToPath(import.meta.url));
// CI captures into SHOTS_DIR and proposes the images in a PR; local runs go
// to a git-ignored folder to look at, so they never end up in a commit
export const outDir = process.env.SHOTS_DIR
  ? path.resolve(process.env.SHOTS_DIR)
  : path.resolve(dirname, "..", "screenshots", "docs");
export const out = (name: string) => path.join(outDir, name);

// the pixels per point of the pictures (GDK_SCALE, 2 from scripts/docs-shots.sh),
// so they're sharp on HiDPI screens; everything else here is in points
const SCALE = Number(process.env.GDK_SCALE ?? 1);

// the window (800 × 600), and the strip at its bottom every GIF keeps: the
// status bar and the keycaps above it
export const WINDOW_HEIGHT = 600;
const BOTTOM_STRIP = 80;
// a GIF of the whole window
export const FULL = WINDOW_HEIGHT - BOTTOM_STRIP;
// how much lower the first page starts than when the crops below were set: 24
// px below the top area (VIEW_TOP), where it once started 56 px below the
// window's top
export const SHIFT = TOP_BAR_HEIGHT + 24 - 56;
// the demo's crop: the writing area and the status bar, 800 × 400
const DEMO = WINDOW_HEIGHT - BOTTOM_STRIP - 200 + SHIFT;

// longer than the word count waits for typing to pause (TEXT_CONTENT_DELAY in
// src/state/document.ts); frames after an edit wait for it
const TEXT_SETTLE = 80;

// the symbols typed with Shift on a US keyboard, and the keys they're on
const SHIFTED = '~!@#$%^&*()_+{}|:"<>?';
const UNSHIFTED = "`1234567890-=[]\\;',./";

/**
 * typeChar types `char`. Capitals and the symbols on Shift are typed with
 * Shift held, since WebKitWebDriver types them without it after a right-click.
 */
export const typeChar = (char: string) => {
  const index = SHIFTED.indexOf(char);
  if (index >= 0) return pressShift(UNSHIFTED[index]);
  return char === char.toLowerCase()
    ? type(char)
    : pressShift(char.toLowerCase());
};

export const typeText = async (text: string) => {
  for (const char of text) await typeChar(char);
};

export interface Point {
  x: number;
  y: number;
}

// what the app shows on top in a frame: the cursor, the drawn mouse pointer
// (screenshots leave out the real one) and the keycaps of a shortcut
interface Overlays {
  caret: boolean;
  pointer: Point | null;
  pressed: boolean;
  keys: string[];
}

const NO_OVERLAYS: Overlays = {
  caret: false,
  pointer: null,
  pressed: false,
  keys: [],
};

// `Mod` is Ctrl on Linux, where the recording runs, and Cmd on macOS
const keyLabel = (key: string) => (key === "Mod" ? "Ctrl / ⌘" : key);

/**
 * paint brings the app to the next frame in one call: it shows `overlays`,
 * moves the virtual clock on by `advance` ms (the time the frame before was
 * shown), sets every animation to where that clock has it, and waits until
 * the app has painted all of it. `restart` finishes the animations that ran
 * before and starts the clock at 0.
 */
const paint = (overlays: Overlays, advance: number, restart = false) =>
  browser.executeAsync(
    (
      overlays: Overlays,
      advance: number,
      restart: boolean,
      statusHeight: number,
      done: () => void,
    ) => {
      document.body.classList.toggle("shots-no-caret", !overlays.caret);

      let pointer = document.getElementById("shots-pointer");
      if (!pointer) {
        pointer = document.createElement("div");
        pointer.id = "shots-pointer";
        // an arrow with a light outline, readable on every theme, and the
        // ring that shows a press
        pointer.innerHTML =
          '<div class="ring"></div><svg width="20" height="24" viewBox="0 0 20 24"><path d="M2 2 L2 19 L6.5 15 L9.5 22 L12.5 20.7 L9.6 14 L16 14 Z" fill="#1e2429" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
        pointer.style.cssText =
          "position:fixed;width:0;height:0;pointer-events:none;z-index:1001";
        pointer.querySelector<HTMLElement>(".ring")!.style.cssText =
          "position:absolute;left:-11px;top:-11px;width:22px;height:22px;border-radius:50%;background:rgba(38,50,60,.28);border:2px solid rgba(38,50,60,.55);box-sizing:border-box";
        pointer.querySelector<SVGElement>("svg")!.style.cssText =
          "position:absolute;left:-2px;top:-2px";
        document.body.appendChild(pointer);
      }
      pointer.style.display = overlays.pointer ? "block" : "none";
      if (overlays.pointer) {
        pointer.style.left = `${overlays.pointer.x}px`;
        pointer.style.top = `${overlays.pointer.y}px`;
      }
      pointer.querySelector<HTMLElement>(".ring")!.style.display =
        overlays.pressed ? "block" : "none";

      let keys = document.getElementById("shots-keys");
      if (!keys) {
        keys = document.createElement("div");
        keys.id = "shots-keys";
        // just above the status bar, so it covers none of its items, and
        // readable on the light and the dark themes
        keys.style.cssText = `position:fixed;left:50%;bottom:${statusHeight + 6}px;transform:translateX(-50%);gap:6px;padding:6px 10px;border-radius:12px;background:rgba(38,50,60,.78);border:1px solid rgba(255,255,255,.28);box-shadow:0 4px 16px rgba(0,0,0,.18);font:500 14px/1 'IBM Plex Sans',sans-serif;color:#fff;z-index:1000`;
        document.body.appendChild(keys);
      }
      keys.replaceChildren(
        ...overlays.keys.map((label) => {
          const key = document.createElement("span");
          key.textContent = label;
          key.style.cssText =
            "padding:4px 8px;border-radius:6px;background:rgba(255,255,255,.16);border:1px solid rgba(255,255,255,.22)";
          return key;
        }),
      );
      keys.style.display = overlays.keys.length ? "flex" : "none";

      // the virtual clock: an animation starts on it when a frame first sees
      // it, and shows what it shows that long after
      type Timed = Animation & { shotsStart?: number };
      const clock = window as unknown as { shotsClock?: number };
      if (restart) {
        clock.shotsClock = 0;
        for (const animation of document.getAnimations()) {
          try {
            animation.finish();
          } catch {
            // an endless one, which the clock takes over below
          }
        }
      }
      const now = (clock.shotsClock = (clock.shotsClock ?? 0) + advance);
      for (const animation of document.getAnimations() as Timed[]) {
        if (animation.shotsStart === undefined) {
          animation.shotsStart = now;
          animation.pause();
        }
        const elapsed = now - animation.shotsStart;
        const end = animation.effect?.getComputedTiming().endTime;
        if (typeof end === "number" && Number.isFinite(end) && elapsed >= end) {
          animation.finish();
        } else {
          animation.currentTime = elapsed;
        }
      }
      requestAnimationFrame(() => requestAnimationFrame(() => done()));
    },
    { ...overlays, keys: overlays.keys.map(keyLabel) },
    advance,
    restart,
    STATUS_HEIGHT,
  );

/**
 * shows the app in `theme` for a picture, as if it had always been in it: the
 * transitions the switch starts are finished at once
 */
const showTheme = (theme: string) =>
  browser.executeAsync((theme: string, done: () => void) => {
    const before = new Set(document.getAnimations());
    window.blankSetTheme(theme);
    // getAnimations brings the styles up to date, which starts them
    for (const animation of document.getAnimations()) {
      if (!before.has(animation)) animation.finish();
    }
    requestAnimationFrame(() => requestAnimationFrame(() => done()));
  }, theme);

/** the stills, and the frames of the recordings, in light and in dark */
const takeBoth = async (file: string, dark: boolean) => {
  await browser.saveScreenshot(file);
  if (!dark) return;
  await showTheme("dark");
  await browser.saveScreenshot(darkName(file));
  await showTheme("light");
};

/** `table.gif` → `table-dark.gif` */
export const darkName = (file: string) =>
  file.replace(/(\.[a-z]+)$/, "-dark$1");

/**
 * shot takes a still in the light and the dark theme, or only as the app is
 * with `dark: false`: no cursor, no drawn pointer, no message in the status
 * bar, and the real pointer away from what shows a hover, e.g. the bands
 * where a page ends
 */
export const shot = async (name: string, { dark = true } = {}) => {
  await quietStatus();
  await browser
    .action("pointer")
    .move({ x: 4, y: 300, origin: "viewport" })
    .perform();
  await paint(NO_OVERLAYS, 0, true);
  await takeBoth(out(`${name}.png`), dark);
};

/**
 * waits until what the status bar said a moment ago, e.g. "Pages" after
 * switching the view, has gone, which it does after a few seconds
 */
export const quietStatus = async () => {
  const announcement = $("#ui-announcement");
  await browser.waitUntil(
    async () =>
      !(await announcement.isExisting()) ||
      (await announcement.getText()).trim() === "",
    { timeout: 8000, timeoutMsg: "the status bar keeps a message" },
  );
};

/** switches the theme with its shortcut, as a user does */
export const setTheme = async (theme: string) => {
  while ((await browser.execute(() => document.body.dataset.theme)) !== theme) {
    await pressMod(Key.Alt, "t");
  }
};

export type View = "page-ends" | "pages";

/** switches the page view with its shortcut, unless it's `view` already */
export const setView = async (view: View) => {
  const shown = () =>
    browser.execute(() =>
      document.querySelector("#page-view")?.classList.contains("pages"),
    );
  if ((await shown()) === (view === "pages")) return;
  await pressMod(Key.Alt, "v");
  await browser.waitUntil(async () => (await shown()) === (view === "pages"));
};

// the GIFs being written, and the folders of frames they're written from
const encodes: Promise<void>[] = [];
const frameDirs: string[] = [];

const ffmpeg = (args: string[]) =>
  new Promise<void>((resolve, reject) => {
    const process = spawn("ffmpeg", args, { stdio: "inherit" });
    process.on("error", (error) =>
      reject(new Error(`ffmpeg failed to start (is it installed?): ${error}`)),
    );
    process.on("exit", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`ffmpeg failed to write a GIF (${code})`)),
    );
  });

/**
 * Recorder films typing as a GIF: a frame after every key, each shown for as
 * long as a writer would take for that key, and a blinking cursor while they
 * pause to think. Each frame is taken in light and dark, unless `dark` is
 * false, e.g. for a recording that switches themes itself.
 */
export class Recorder {
  private frames: { file: string; duration: number }[] = [];
  private overlays: Overlays = { ...NO_OVERLAYS, caret: true };
  // how long the frame before is shown, which the clock moves on by
  private shown = 0;
  private started = false;
  // whether a key may have changed the text since the last frame, which the
  // word count follows a moment later
  private edited = false;

  constructor(
    private dir: string,
    private dark = true,
  ) {}

  private async frame(duration: number) {
    const file = path.join(
      this.dir,
      `${String(this.frames.length).padStart(5, "0")}.png`,
    );
    if (this.edited) await browser.pause(TEXT_SETTLE);
    this.edited = false;
    await paint(this.overlays, this.shown, !this.started);
    this.started = true;
    await takeBoth(file, this.dark);
    this.frames.push({ file, duration });
    this.shown = duration * 1000;
  }

  /** pause for `seconds` with a blinking cursor */
  async pause(seconds: number) {
    const blinks = Math.max(1, Math.round(seconds / 0.5));
    for (let i = 0; i < blinks; i++) {
      this.overlays.caret = i % 2 === 1;
      await this.frame(seconds / blinks);
    }
    this.overlays.caret = true;
  }

  /** type `text` at the rhythm of a writer: quick within words, slower at punctuation */
  async type(text: string) {
    for (const [i, char] of [...text].entries()) {
      await typeChar(char);
      this.edited = true;
      // a small, repeatable variation, so the typing doesn't look mechanical
      const jitter = ((i * 7919) % 5) * 0.012;
      let duration = 0.045 + jitter;
      if (char === " ") duration = 0.09;
      if (",;:".includes(char)) duration = 0.3;
      if (".?!".includes(char)) duration = 0.5;
      await this.frame(duration);
    }
  }

  /** delete the last `count` characters, like a writer reconsidering a word */
  async erase(count: number) {
    for (let i = 0; i < count; i++) {
      await type(Key.Backspace);
      this.edited = true;
      await this.frame(0.07);
    }
  }

  /**
   * press a shortcut and show it the way a screencast would: keycaps in a translucent,
   * rounded overlay at the bottom center, e.g. `shortcut(["Mod", "I"], () => pressMod("i"))`
   */
  async shortcut(keys: string[], press: () => Promise<unknown>, seconds = 0.9) {
    this.overlays.keys = keys;
    await press();
    this.edited = true;
    await this.frame(seconds);
    this.overlays.keys = [];
  }

  // where filmNew puts the mouse: in the middle of the text, away from
  // the bars and the hints there
  private at: Point = { x: 400, y: 300 };

  /**
   * move the mouse to `to` in `seconds`, eased like a hand moves it, with a
   * frame per step; the page sees every step, so hovers show as they would
   */
  async moveTo(to: Point, seconds = 0.6) {
    const from = this.at;
    const steps = Math.max(2, Math.round(seconds / 0.06));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ease = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
      const at = {
        x: Math.round(from.x + (to.x - from.x) * ease),
        y: Math.round(from.y + (to.y - from.y) * ease),
      };
      // keeps the button pressed between the actions of a drag
      await browser.action("pointer").move(at).perform(true);
      this.overlays.pointer = at;
      await this.frame(seconds / steps);
    }
    this.at = to;
  }

  /** press the mouse button, drag it to `to` in `seconds` and let go */
  async drag(to: Point, seconds = 1, hold = 0.4) {
    await browser.action("pointer").move(this.at).down().perform(true);
    this.overlays.pointer = this.at;
    this.overlays.pressed = true;
    await this.frame(0.3);
    await this.moveTo(to, seconds);
    await this.frame(hold);
    await browser.action("pointer").move(to).up().perform(true);
    this.overlays.pressed = false;
    await this.frame(0.3);
  }

  /** click where the mouse is, showing the press */
  async click(seconds = 0.6) {
    this.overlays.pointer = this.at;
    this.overlays.pressed = true;
    await browser.action("pointer").move(this.at).down().up().perform(true);
    this.edited = true;
    await this.frame(0.25);
    this.overlays.pressed = false;
    await this.frame(seconds);
  }

  /** hide the drawn mouse pointer, e.g. before typing again */
  hidePointer() {
    this.overlays.pointer = null;
  }

  async enter(pause = 0.6) {
    await type(Key.Enter);
    this.edited = true;
    await this.frame(pause);
  }

  /**
   * move the mouse to where the pages show the end of the text of the
   * editor's element at `selector`, and click there
   */
  async clickInto(selector: string, seconds = 0.6, move = 0.5) {
    const at = await browser.execute((selector: string) => {
      const geometry = window.blankGeometry;
      const box = geometry.caretBox(
        geometry.endOf(document.querySelector(selector)!),
      )!;
      return {
        x: Math.round(box.left),
        y: Math.round((box.top + box.bottom) / 2),
      };
    }, selector);
    await this.moveTo(at, move);
    await this.click(seconds);
  }

  /** move the mouse onto `element` and click it */
  async clickOn(element: ReturnType<typeof $>, seconds = 0.6, move = 0.5) {
    await this.moveTo(await centerOf(element), move);
    await this.click(seconds);
  }

  /** move the mouse onto `element` and rest there until `shown` shows */
  async restOn(
    element: ReturnType<typeof $>,
    shown: ReturnType<typeof $>,
    seconds = 2,
  ) {
    await this.moveTo(await centerOf(element), 0.6);
    await this.frame(0.3);
    await expect(shown).toBeDisplayed();
    await this.frame(seconds);
  }

  /** move the mouse onto the top or bottom bar, which shows the hints there */
  async hover(edge: "top" | "bottom", seconds = 0.8) {
    const height = await browser.execute(() => window.innerHeight);
    const y = edge === "top" ? TOP_BAR_HEIGHT + BAND_HEIGHT / 2 : height - 20;
    await this.moveTo({ x: 400, y }, 0.6);
    await this.frame(seconds);
  }

  /** press `key`, shown as a keycap labelled `label`, e.g. Tab or an arrow */
  async press(label: string, key: string, seconds = 0.5) {
    await this.shortcut([label], () => type(key), seconds);
  }

  /** show what's there for `seconds`, without the blinking of a pause */
  async hold(seconds: number) {
    await this.frame(seconds);
  }

  /**
   * write the GIF (and its dark twin) to `name` in the shots folder, with the
   * frame durations from above. It shows the top `height` pixels of the
   * window and the status bar below them. ffmpeg writes it while the next
   * scene runs; finishShots waits for it.
   */
  save(name: string, height = FULL) {
    const variants: [string, (file: string) => string][] = [
      [out(name), (file) => file],
    ];
    if (this.dark) variants.push([darkName(out(name)), darkName]);
    for (const [gif, frameOf] of variants) {
      const list = `${frameOf(path.join(this.dir, "frames.txt"))}`;
      const entries = this.frames.map(
        ({ file, duration }) =>
          `file '${frameOf(file)}'\nduration ${duration.toFixed(3)}`,
      );
      // the concat demuxer ignores the duration of the last entry unless the file is repeated
      fs.writeFileSync(
        list,
        [...entries, `file '${frameOf(this.frames.at(-1)!.file)}'`].join("\n") +
          "\n",
      );
      encodes.push(
        ffmpeg([
          ...["-y", "-loglevel", "error", "-f", "concat", "-safe", "0"],
          ...["-i", list, "-vf"],
          // a shorter window: the writing area on top, the status bar (fixed to the bottom
          // of the window in the app) and the keycaps just above it below, without the
          // empty page in between
          `split[t][b];[t]crop=${800 * SCALE}:${height * SCALE}:0:0[top];[b]crop=${800 * SCALE}:${BOTTOM_STRIP * SCALE}:0:${(WINDOW_HEIGHT - BOTTOM_STRIP) * SCALE}[bar];[top][bar]vstack,` +
            "split[c][d];[c]palettegen=max_colors=64:stats_mode=full[p];[d][p]paletteuse=dither=none",
          ...["-fps_mode", "vfr", gif],
        ]),
      );
    }
  }
}

/** the middle of `element` in the window */
export const centerOf = async (element: ReturnType<typeof $>) => {
  const { x, y } = await element.getLocation();
  const { width, height } = await element.getSize();
  return { x: Math.round(x + width / 2), y: Math.round(y + height / 2) };
};

/** a recorder that writes its frames to a folder of their own */
export const recorder = ({ dark = true } = {}) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-frames-"));
  frameDirs.push(dir);
  return new Recorder(dir, dark);
};

export interface DocumentOptions {
  // a header and a footer, as a finished document has them (see newDocument)
  bands?: boolean;
  view?: View;
}

/**
 * leaves one new, untitled tab (onlyNewTab), so the pictures don't show the
 * tabs of the ones before. They show its pages with a header and a footer,
 * as a finished document has them, rather than the hints to add them; only
 * those about adding them start without (`bands: false`). The texts are
 * typed, since the fields of an untitled document come out empty. `view` is
 * the page view to show it in.
 */
export const newDocument = async ({
  bands = true,
  view = "page-ends",
}: DocumentOptions = {}) => {
  // no pointer or keycaps left over from the recording before
  await paint(NO_OVERLAYS, 0, true);
  await onlyNewTab();
  await setView(view);
  if (!bands) return;
  const strip = $("#band-editor");
  // the keys go to the editor, even where a pane had the focus
  await focusEditor();
  await pressMod(Key.Alt, "h");
  await expect(strip).toBeDisplayed();
  await strip.$(".slot.left .ProseMirror").click();
  await typeText("Notes on craft");
  await strip.$(".slot.right .ProseMirror").click();
  await typeText("Draft");
  await strip.$("button=Done").click();
  await expect(strip).not.toExist();
  await pressMod(Key.Alt, "f");
  await strip.$(".slot.right .ProseMirror").click();
  await strip.$("button=# Page number ▾").click();
  await $("#context-menu").$('[data-id="Page {page} of {pages}"]').click();
  await strip.$("button=Done").click();
  await expect(strip).not.toExist();
  await focusEditor();
};

/**
 * starts a recording in a new, untitled document (see newDocument); the film
 * shows only the frames taken after this, not how the document was set up
 */
export const filmNew = async (
  options: DocumentOptions & { dark?: boolean } = {},
) => {
  await newDocument(options);
  // the pointer in the middle of the text, so no button looks hovered and
  // no hint shows at the edges
  await browser
    .action("pointer")
    .move({ x: 400, y: 300, origin: "viewport" })
    .perform();
  const film = recorder(options);
  await film.pause(0.8);
  return film;
};

// opened from a neutral path, since its tab shows the name and the path
const sampleDir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-shots-"));
export const sample = path.join(sampleDir, "on-writing.md");

/**
 * readies the app of a spec file for its pictures: with `sample`, it shows
 * e2e/shots/sample.md alone in its tab, in `view`. The pictures show English,
 * whatever the system language is, and no tooltips: they open after the
 * pointer rested for a while of real time (TIP_DELAY in
 * src/ui/tooltipModel.ts), which a recording doesn't keep.
 */
export const prepare = async ({
  withSample = false,
  view = "page-ends" as View,
} = {}) => {
  fs.mkdirSync(outDir, { recursive: true });
  if (withSample) {
    fs.copyFileSync(path.join(dirname, "sample.md"), sample);
    await restartApp([sample]);
    // the sample alone, without the welcome tab beside it
    if ((await tabLabels()).length > 1) {
      await activeTab().click({ button: "right" });
      await $('.context-menus [data-id="close-others"]').click();
      await browser.waitUntil(async () => (await tabLabels()).length === 1);
    }
  }
  await focusEditor();
  await pressMod(Key.Alt, "l");
  await type("en");
  await type(Key.Enter);
  await setView(view);
  if (withSample) {
    // the cursor in the first paragraph, so the toolbar shows plain text
    await clickText("Good writing");
  }
  await browser.execute(() => {
    const style = document.createElement("style");
    // the painted caret: shown in every frame while typing, hidden in the
    // stills and between the blinks of a pause
    style.textContent =
      ".page-caret { animation: none; } .shots-no-caret .page-caret { visibility: hidden; } " +
      '.tooltip[role="tooltip"] { display: none !important; }';
    document.head.appendChild(style);
  });
};

/** waits for the GIFs still being written, then drops their frames */
export const finishShots = async () => {
  await Promise.all(encodes.splice(0));
  for (const dir of frameDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  fs.rmSync(sampleDir, { recursive: true, force: true });
};

export { DEMO };

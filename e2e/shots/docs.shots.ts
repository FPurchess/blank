import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { $, browser } from "@wdio/globals";

import {
  editorText,
  focusEditor,
  textBox,
  Key,
  paste,
  pressMod,
  restartApp,
  type,
  hoverEdge,
  pressShift,
} from "../helpers.ts";
import { STATUS_HEIGHT } from "../../src/chrome.ts";

const dirname = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(
  dirname,
  "..",
  "..",
  "docs",
  "public",
  "screenshots",
);
// opened from a neutral path, since the app shows it in the top bar
const sample = path.join(os.tmpdir(), "on-writing.md");
const themes = ["light", "dark", "black", "red", "green", "blue"];

/**
 * shot takes a still, without the pointer a recording drew and away from
 * what shows a hover, e.g. the bands where a page ends
 */
const shot = async (name: string) => {
  await showPointer(null);
  await browser
    .action("pointer")
    .move({ x: 4, y: 300, origin: "viewport" })
    .perform();
  await browser.saveScreenshot(path.join(outDir, `${name}.png`));
};

const setTheme = async (theme: string) => {
  while ((await browser.execute(() => document.body.dataset.theme)) !== theme) {
    await pressMod(Key.Alt, "t");
  }
};

// the symbols typed with Shift on a US keyboard, and the keys they're on
const SHIFTED = '~!@#$%^&*()_+{}|:"<>?';
const UNSHIFTED = "`1234567890-=[]\\;',./";

/**
 * typeChar types `char`. Capitals and the symbols on Shift are typed with
 * Shift held, since WebKitWebDriver types them without it after a right-click.
 */
const typeChar = (char: string) => {
  const index = SHIFTED.indexOf(char);
  if (index >= 0) return pressShift(UNSHIFTED[index]);
  return char === char.toLowerCase()
    ? type(char)
    : pressShift(char.toLowerCase());
};

// the window (800 × 600), and the strip at its bottom every GIF keeps: the
// status bar and the keycaps above it
const WINDOW_HEIGHT = 600;
const BOTTOM_STRIP = 80;
// a GIF of the whole window
const FULL = WINDOW_HEIGHT - BOTTOM_STRIP;

/**
 * Recorder films typing as a GIF: a frame after every key, each shown for as long as a
 * writer would take for that key, and a blinking cursor while they pause to think
 */
class Recorder {
  private frames: { file: string; duration: number }[] = [];
  constructor(private dir: string) {}

  private async frame(duration: number) {
    const file = path.join(
      this.dir,
      `${String(this.frames.length).padStart(5, "0")}.png`,
    );
    await browser.saveScreenshot(file);
    this.frames.push({ file, duration });
  }

  /** pause for `seconds` with a blinking cursor */
  async pause(seconds: number) {
    const blinks = Math.max(1, Math.round(seconds / 0.5));
    for (let i = 0; i < blinks; i++) {
      await setCaret(i % 2 === 1);
      await this.frame(seconds / blinks);
    }
    await setCaret(true);
  }

  /** type `text` at the rhythm of a writer: quick within words, slower at punctuation */
  async type(text: string) {
    for (const [i, char] of [...text].entries()) {
      await typeChar(char);
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
      await this.frame(0.07);
    }
  }

  /**
   * press a shortcut and show it the way a screencast would: keycaps in a translucent,
   * rounded overlay at the bottom center, e.g. `shortcut(["Mod", "I"], () => pressMod("i"))`
   */
  async shortcut(keys: string[], press: () => Promise<void>, seconds = 0.9) {
    await showKeys(keys);
    await press();
    await this.frame(seconds);
    await showKeys([]);
  }

  // where filmNew puts the mouse: in the middle of the text, away from
  // the bars and the hints there
  private at: Point = { x: 400, y: 300 };
  private down = false;

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
      await showPointer(at, this.down);
      await this.frame(seconds / steps);
    }
    this.at = to;
  }

  /** press the mouse button, drag it to `to` in `seconds` and let go */
  async drag(to: Point, seconds = 1, hold = 0.4) {
    await browser.action("pointer").move(this.at).down().perform(true);
    this.down = true;
    await showPointer(this.at, true);
    await this.frame(0.3);
    await this.moveTo(to, seconds);
    await this.frame(hold);
    await browser.action("pointer").move(to).up().perform(true);
    this.down = false;
    await showPointer(to);
    await this.frame(0.3);
  }

  /** click where the mouse is, showing the press */
  async click(seconds = 0.6) {
    await showPointer(this.at, true);
    await browser.action("pointer").move(this.at).down().up().perform(true);
    await this.frame(0.25);
    await showPointer(this.at);
    await this.frame(seconds);
  }

  /** hide the drawn mouse pointer, e.g. before typing again */
  async hidePointer() {
    await showPointer(null);
  }

  async enter(pause = 0.6) {
    await type(Key.Enter);
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
    const { x, y } = await element.getLocation();
    const { width, height } = await element.getSize();
    await this.moveTo(
      { x: Math.round(x + width / 2), y: Math.round(y + height / 2) },
      move,
    );
    await this.click(seconds);
  }

  /** move the mouse onto `element` and rest there until `shown` shows */
  async restOn(
    element: ReturnType<typeof $>,
    shown: ReturnType<typeof $>,
    seconds = 2,
  ) {
    const { x, y } = await element.getLocation();
    const { width, height } = await element.getSize();
    await this.moveTo(
      { x: Math.round(x + width / 2), y: Math.round(y + height / 2) },
      0.6,
    );
    await this.frame(0.3);
    await expect(shown).toBeDisplayed();
    await this.frame(seconds);
  }

  /** move the mouse onto the top or bottom bar, which shows the hints there */
  async hover(edge: "top" | "bottom", seconds = 0.8) {
    const height = await browser.execute(() => window.innerHeight);
    await this.moveTo({ x: 400, y: edge === "top" ? 20 : height - 20 }, 0.6);
    await this.frame(seconds);
  }

  /** press `key`, shown as a keycap labelled `label`, e.g. Tab or an arrow */
  async press(label: string, key: string, seconds = 0.5) {
    await this.shortcut([label], () => type(key), seconds);
  }

  /**
   * write the GIF, with the frame durations from above. It shows the top
   * `height` pixels of the window and the status bar below them.
   */
  save(gif: string, height = WINDOW_HEIGHT - BOTTOM_STRIP - 200) {
    const list = path.join(this.dir, "frames.txt");
    const entries = this.frames.map(
      ({ file, duration }) => `file '${file}'\nduration ${duration.toFixed(3)}`,
    );
    // the concat demuxer ignores the duration of the last entry unless the file is repeated
    fs.writeFileSync(
      list,
      [...entries, `file '${this.frames.at(-1)!.file}'`].join("\n") + "\n",
    );
    const ffmpeg = spawnSync(
      "ffmpeg",
      [
        ...[
          "-y",
          "-loglevel",
          "error",
          "-f",
          "concat",
          "-safe",
          "0",
          "-i",
          list,
        ],
        ...[
          "-vf",
          // a shorter window: the writing area on top, the status bar (fixed to the bottom
          // of the window in the app) and the keycaps just above it below, without the
          // empty page in between
          `split[t][b];[t]crop=800:${height}:0:0[top];[b]crop=800:${BOTTOM_STRIP}:0:${WINDOW_HEIGHT - BOTTOM_STRIP}[bar];[top][bar]vstack,` +
            "split[c][d];[c]palettegen=max_colors=64:stats_mode=full[p];[d][p]paletteuse=dither=none",
        ],
        ...["-fps_mode", "vfr", gif],
      ],
      { stdio: "inherit" },
    );
    if (ffmpeg.status !== 0)
      throw new Error("ffmpeg failed to create the GIF (is it installed?)");
  }
}

// `Mod` is Ctrl on Linux, where the recording runs, and Cmd on macOS
const keyLabel = (key: string) => (key === "Mod" ? "Ctrl / ⌘" : key);

interface Point {
  x: number;
  y: number;
}

/**
 * draws the mouse pointer at `at`, with a ring while its button is down, or
 * hides it for null: screenshots leave out the real one
 */
const showPointer = (at: Point | null, pressed = false) =>
  browser.execute(
    (at: Point | null, pressed: boolean) => {
      let pointer = document.getElementById("shots-pointer");
      if (!pointer) {
        pointer = document.createElement("div");
        pointer.id = "shots-pointer";
        // an arrow with a light outline, readable on every theme, and the
        // ring that shows a press
        pointer.innerHTML =
          '<div class="ring"></div><svg width="20" height="24" viewBox="0 0 20 24"><path d="M2 2 L2 19 L6.5 15 L9.5 22 L12.5 20.7 L9.6 14 L16 14 Z" fill="#1e2429" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>';
        Object.assign(pointer.style, {
          position: "fixed",
          width: "0",
          height: "0",
          pointerEvents: "none",
          zIndex: "1001",
        });
        const ring = pointer.querySelector<HTMLElement>(".ring")!;
        Object.assign(ring.style, {
          position: "absolute",
          left: "-11px",
          top: "-11px",
          width: "22px",
          height: "22px",
          borderRadius: "50%",
          background: "rgba(38, 50, 60, 0.28)",
          border: "2px solid rgba(38, 50, 60, 0.55)",
          boxSizing: "border-box",
        });
        const arrow = pointer.querySelector<SVGElement>("svg")!;
        Object.assign(arrow.style, {
          position: "absolute",
          left: "-2px",
          top: "-2px",
        });
        document.body.appendChild(pointer);
      }
      pointer.style.display = at ? "block" : "none";
      if (!at) return;
      pointer.style.left = `${at.x}px`;
      pointer.style.top = `${at.y}px`;
      pointer.querySelector<HTMLElement>(".ring")!.style.display = pressed
        ? "block"
        : "none";
    },
    at,
    pressed,
  );

/** shows `keys` in the shortcut overlay, or hides it for no keys */
const showKeys = (keys: string[]) =>
  browser.execute(
    (labels: string[], STATUS_HEIGHT: number) => {
      let overlay = document.getElementById("shots-keys");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "shots-keys";
        Object.assign(overlay.style, {
          position: "fixed",
          left: "50%",
          // just above the status bar, so it covers none of its items
          bottom: `${STATUS_HEIGHT + 6}px`,
          transform: "translateX(-50%)",
          display: "flex",
          gap: "6px",
          padding: "6px 10px",
          borderRadius: "12px",
          // readable on the light and the dark themes
          background: "rgba(38, 50, 60, 0.78)",
          border: "1px solid rgba(255, 255, 255, 0.28)",
          boxShadow: "0 4px 16px rgba(0, 0, 0, 0.18)",
          font: "500 14px/1 'IBM Plex Sans', sans-serif",
          color: "#fff",
          zIndex: "1000",
        });
        document.body.appendChild(overlay);
      }
      overlay.replaceChildren(
        ...labels.map((label) => {
          const key = document.createElement("span");
          key.textContent = label;
          Object.assign(key.style, {
            padding: "4px 8px",
            borderRadius: "6px",
            background: "rgba(255, 255, 255, 0.16)",
            border: "1px solid rgba(255, 255, 255, 0.22)",
          });
          return key;
        }),
      );
      overlay.style.display = labels.length ? "flex" : "none";
    },
    keys.map(keyLabel),
    STATUS_HEIGHT,
  );

/** hides the cursor while the body has `shots-no-caret` */
const addCaretStyle = () =>
  browser.execute(() => {
    const style = document.createElement("style");
    // the painted caret: shown in every frame while typing, hidden in the
    // stills and between the blinks of a pause
    style.textContent =
      ".page-caret { animation: none; } .shots-no-caret .page-caret { visibility: hidden; }";
    document.head.appendChild(style);
  });

const setCaret = (visible: boolean) =>
  browser.execute((visible) => {
    document.body.classList.toggle("shots-no-caret", !visible);
  }, visible);

const recordings: string[] = [];

/** starts a recording in a new, untitled document */
const filmNew = async () => {
  const frames = fs.mkdtempSync(path.join(os.tmpdir(), "blank-frames-"));
  recordings.push(frames);
  await pressMod("n");
  await expect($("#ui-top")).toHaveText("» Untitled");
  // the pointer in the middle of the text, so no button looks hovered and
  // no hint shows at the edges
  await browser
    .action("pointer")
    .move({ x: 400, y: 300, origin: "viewport" })
    .perform();
  const film = new Recorder(frames);
  await film.pause(0.8);
  return film;
};

describe("docs screenshots", () => {
  after(() => {
    for (const frames of recordings) {
      fs.rmSync(frames, { recursive: true, force: true });
    }
  });

  before(async () => {
    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(path.join(dirname, "sample.md"), sample);
    await restartApp([sample]);
    await focusEditor();
    // the pictures show English, whatever the system language is
    await pressMod(Key.Alt, "l");
    await type("en");
    await type(Key.Enter);
    // the stills show no cursor, the GIF shows it blinking (see Recorder)
    await addCaretStyle();
  });

  it("captures every theme", async () => {
    await setCaret(false);
    for (const theme of themes) {
      await setTheme(theme);
      await shot(`theme-${theme}`);
    }
    await setTheme("light");
  });

  it("captures the language chooser", async () => {
    await pressMod(Key.Alt, "l");
    await shot("language");
    await type(Key.Escape);
  });

  it("captures the page setup", async () => {
    await focusEditor();
    await pressMod(Key.Alt, "u");
    await $("#page-setup").waitForDisplayed();
    // landscape, with the picture turned
    await browser.keys(Key.ArrowDown);
    await browser.keys(Key.ArrowRight);
    await shot("page-setup");
    await type(Key.Escape);
  });

  it("records adding page numbers and a header", async () => {
    const film = await filmNew();
    await film.type("# The Lighthouse");
    await film.enter(0.4);
    await film.type("It was a dark and stormy night.");
    await film.pause(0.6);

    // page numbers in one click, from the hint at the bottom edge
    await film.hover("bottom");
    await film.clickOn($("#band-footer").$("button=# Page numbers"), 1.2);
    await film.clickOn($("#band-editor").$("button=Done"), 1);

    // the header: the chapter on the left, the page on the right
    await film.shortcut(["Mod", "Alt", "H"], () => pressMod(Key.Alt, "h"), 1);
    await film.clickOn($("#band-editor .slot.left .ProseMirror"), 0.3);
    await film.clickOn($("#band-editor").$("button=Chapter"), 0.8);
    await film.clickOn($("#band-editor .slot.right .ProseMirror"), 0.3);
    await film.clickOn($("#band-editor").$("button=# Page number ▾"), 1);
    await film.clickOn(
      $("#context-menu").$('[data-id="Page {page} of {pages}"]'),
      1,
    );
    // a title page without them
    await film.clickOn($("#band-editor").$("button=First Page ▾"), 1);
    await film.clickOn(
      $("#context-menu").$('[data-id="first-page:plain"]'),
      0.8,
    );
    await film.clickOn($("#band-editor").$("button=Done"), 0.6);
    await film.clickInto("#editor p", 0.3);
    await film.hidePointer();
    // a second page, whose header shows where the first page ends
    await film.shortcut(["Mod", "Enter"], () => pressMod(Key.Enter), 0.8);
    await film.type("The next morning, the sea was calm.");
    await film.pause(2.5);
    film.save(path.join(outDir, "header-footer.gif"), FULL);
  });

  it("records different even pages", async () => {
    const film = await filmNew();
    await film.type("# The Lighthouse");
    await film.enter(0.4);
    await film.type("It was a dark and stormy night.");
    await film.shortcut(["Mod", "Alt", "F"], () => pressMod(Key.Alt, "f"), 0.8);
    await film.clickOn($("#band-editor").$("button=Title"), 0.6);
    await film.clickOn($("#band-editor .slot.right .ProseMirror"), 0.3);
    await film.clickOn($("#band-editor").$("button=# Page number ▾"), 0.8);
    await film.clickOn($("#context-menu").$('[data-id="{page}"]'), 0.8);
    // the even pages start mirrored: the page number on the outside
    await film.clickOn($("#band-editor").$("button=Odd & Even Pages"), 1.6);
    await film.clickOn($("#band-editor").$("button=Odd Pages"), 1.2);
    await film.clickOn($("#band-editor").$("button=Even Pages"), 1.2);
    await film.clickOn($("#band-editor").$("button=Done"), 0.6);
    await film.clickInto("#editor p", 0.3);
    await film.hidePointer();
    // an even page, whose own header shows where the first page ends
    await film.shortcut(["Mod", "Enter"], () => pressMod(Key.Enter), 0.8);
    await film.type("The next morning, the sea was calm.");
    await film.pause(2);
    film.save(path.join(outDir, "even-pages.gif"), FULL);
  });

  it("records switching between page ends and pages", async () => {
    const film = await filmNew();
    await film.type("The lighthouse keeper wrote every evening.");
    await film.enter(0.4);
    await film.type("The first page ends here.");
    await film.shortcut(["Mod", "Enter"], () => pressMod(Key.Enter), 0.8);
    await film.type("And the next one starts.");
    await film.pause(0.8);
    await film.shortcut(["Mod", "Alt", "V"], () => pressMod(Key.Alt, "v"), 1.8);
    await film.shortcut(["Mod", "Alt", "V"], () => pressMod(Key.Alt, "v"), 1.6);
    await film.pause(1);
    film.save(path.join(outDir, "page-views.gif"), FULL);
  });

  it("records the status bar", async () => {
    const film = await filmNew();
    await film.type("The lighthouse keeper wrote every evening.");
    await film.enter(0.3);
    await film.type("He counted the ships, and the words.");
    await film.shortcut(["Mod", "Enter"], () => pressMod(Key.Enter), 0.6);
    await film.type("The next page starts here.");
    await film.pause(0.6);
    // the details of the word count, after resting on it
    await film.restOn($("#ui-stats"), $("#word-count-card"), 2.4);
    // the view, by mouse and by keys
    await film.clickOn($("#ui-view"), 1.6, 0.8);
    await expect($("#word-count-card")).not.toExist();
    await film.clickOn($("#ui-view"), 1.2, 0.3);
    // back into the text, away from the hints near the bar
    await film.moveTo({ x: 400, y: 300 }, 0.5);
    await film.hidePointer();
    await film.shortcut(["Mod", "Alt", "V"], () => pressMod(Key.Alt, "v"), 1.6);
    await film.shortcut(["Mod", "Alt", "V"], () => pressMod(Key.Alt, "v"), 1);
    film.save(path.join(outDir, "status-bar.gif"), FULL);
  });

  it("records the outline", async () => {
    const film = await filmNew();
    const story = [
      ["h1", "The lighthouse"],
      ["h2", "The keeper"],
      ["h2", "The lamp"],
      ["h1", "The storm"],
      ["h2", "The night"],
      ["h2", "The ship"],
      ["h1", "The morning"],
    ]
      .map(
        ([tag, title]) =>
          `<${tag}>${title}</${tag}>` +
          "<p>The keeper climbed the stairs every evening, lit the lamp and wrote down the weather, the ships and the wind.</p>".repeat(
            4,
          ),
      )
      .join("");
    await paste({ "text/html": story });
    await browser.execute(() => {
      document.querySelector("#page-view")!.scrollTop = 0;
    });
    await film.pause(1);
    const centre = (selector: string, text?: string) =>
      browser.execute(
        (selector, text) => {
          const element = [...document.querySelectorAll(selector)].find(
            (found) => !text || found.textContent?.trim() === text,
          )!;
          const box = element.getBoundingClientRect();
          return {
            x: Math.round(box.left + box.width / 2),
            y: Math.round(box.top + box.height / 2),
          };
        },
        selector,
        text,
      );
    // pointing at the dashes shows the headings, a click scrolls to one
    await film.moveTo(await centre(".outline-dashes"), 1);
    await film.pause(1.2);
    await film.moveTo(await centre(".outline-entry", "The storm"), 0.8);
    await film.click(1.6);
    // away again, and the list goes with the pointer
    await film.moveTo({ x: 400, y: 300 }, 0.6);
    await film.hidePointer();
    await film.pause(0.6);
    // the shortcut opens it and puts it away
    await film.shortcut(["Mod", "Alt", "O"], () => pressMod(Key.Alt, "o"), 1.8);
    await film.shortcut(["Mod", "Alt", "O"], () => pressMod(Key.Alt, "o"), 1);
    await film.pause(0.6);
    film.save(path.join(outDir, "outline.gif"), FULL);
  });

  it("records a table of contents", async () => {
    const film = await filmNew();
    // the block picker, and a table of contents still without headings
    await film.shortcut(["Mod", "Alt", "B"], () => pressMod(Key.Alt, "b"), 1.4);
    await film.press("Enter", Key.Enter, 1.2);
    // the story, each chapter on a page of its own: the entries come
    const paragraph =
      "<p>The keeper climbed the stairs every evening, lit the lamp and wrote down the weather, the ships and the wind.</p>";
    const story = [
      ["h1", "The lighthouse"],
      ["h2", "The keeper"],
      ["h2", "The lamp"],
      ["h1", "The storm"],
      ["h2", "The ship"],
      ["h1", "The morning"],
    ]
      .map(
        ([tag, title], index) =>
          (tag === "h1" && index > 0 ? '<hr data-page-break="">' : "") +
          `<${tag}>${title}</${tag}>` +
          paragraph.repeat(2),
      )
      .join("");
    await paste({ "text/html": story });
    await browser.execute(() => {
      document.querySelector("#page-view")!.scrollTop = 0;
    });
    await film.pause(1.6);
    // a heading renamed, and its entry follows
    await film.clickInto("#editor h1", 0.4);
    await film.hidePointer();
    await film.type(" at the cape");
    await film.pause(2.2);
    film.save(path.join(outDir, "toc.gif"), 545);
  });

  it("records filling in a form", async () => {
    const film = await filmNew();
    await film.shortcut(["Mod", "Alt", "B"], () => pressMod(Key.Alt, "b"), 1);
    await film.press("↓", Key.ArrowDown, 0.6);
    await film.press("Enter", Key.Enter, 1.4);
    await film.type("Pancakes");
    await film.press("Tab", Key.Tab, 0.6);
    await film.press("Tab", Key.Tab, 0.6);
    await film.type("200 g");
    await film.press("Tab", Key.Tab, 0.4);
    await film.type("flour");
    await film.press("Tab", Key.Tab, 0.6);
    await film.type("Whisk the flour with the milk and the eggs.");
    await film.pause(2.2);
    film.save(path.join(outDir, "form.gif"), 545);
  });

  it("records writing a letter", async () => {
    const film = await filmNew();
    await film.shortcut(["Mod", "Alt", "B"], () => pressMod(Key.Alt, "b"), 1);
    await film.press("↓", Key.ArrowDown, 0.4);
    await film.press("↓", Key.ArrowDown, 0.6);
    await film.press("Enter", Key.Enter, 1.4);
    await film.type("Bea Sender · Hill Road 3 · 54321 Village");
    await film.press("Tab", Key.Tab, 0.5);
    await film.type("Ann Example");
    await film.press("Tab", Key.Tab, 0.5);
    await film.type("2 October");
    await film.press("Tab", Key.Tab, 0.5);
    await film.type("Our meeting");
    await film.press("Tab", Key.Tab, 0.5);
    await film.type("Dear Ann, thank you for the meeting.");
    await film.pause(2.2);
    film.save(path.join(outDir, "letter.gif"), 545);
  });

  it("captures a page break", async () => {
    await pressMod("n");
    await type("the end of the first chapter.");
    await pressMod(Key.Enter);
    await type("the second chapter starts on a new page.");
    await setCaret(false);
    await shot("page-break");
    await setCaret(true);
  });

  it("captures spell check", async () => {
    await pressMod("n");
    await pressMod(Key.Alt, "s");
    await expect($("#ui-spellcheck")).toHaveText("Spelling");
    await type("every story begins with a blank page and a singel idea.");
    await browser.waitUntil(async () =>
      (await editorText("#editor .spelling-error")).includes("singel"),
    );
    // at the end of the word, so the menu leaves it visible
    const word = await textBox("singel", 5);
    await browser
      .action("pointer")
      .move({
        x: Math.round(word.left),
        y: Math.round((word.top + word.bottom) / 2),
        origin: "viewport",
      })
      .down({ button: 2 })
      .up({ button: 2 })
      .perform();
    await $(`[data-id^="suggestion:"]`).waitForExist();
    await shot("spelling");

    await type(Key.Escape);
    await pressMod(Key.Alt, "s");
  });

  it("records making a table", async () => {
    const film = await filmNew();
    await film.type("# Fruit stock");
    await film.enter(0.5);
    await film.shortcut(["Mod", "T"], () => pressMod("t"), 1);
    await film.press("→", Key.ArrowRight, 0.6);
    await film.press("↓", Key.ArrowDown, 0.6);
    await film.press("Enter", Key.Enter, 0.8);
    const cells = ["Fruit", "Origin", "Qty", "Price"];
    const rows = [
      ["Apples", "Tyrol", "40", "1.20"],
      ["Pears", "Valais", "12", "0.80"],
      ["Kiwis", "Italy", "25", "0.45"],
    ];
    for (const [i, text] of [...cells, ...rows.flat()].entries()) {
      if (i > 0) await film.press("Tab", Key.Tab, 0.35);
      await film.type(text);
    }
    await film.pause(0.8);
    // out of the table and on with the text
    await film.press("↓", Key.ArrowDown, 0.8);
    await film.type("Prices are per piece.");
    await film.pause(2.5);
    film.save(path.join(outDir, "table-insert.gif"), 395);
  });

  it("records typing a table header", async () => {
    const film = await filmNew();
    await film.type("| Name | Role |");
    await film.pause(0.6);
    await film.press("Enter", Key.Enter, 1);
    for (const [i, text] of ["Ada", "Engineer", "Grace", "Admiral"].entries()) {
      if (i > 0) await film.press("Tab", Key.Tab, 0.35);
      await film.type(text);
    }
    await film.pause(2.5);
    film.save(path.join(outDir, "table-header.gif"), 275);
  });

  it("records writing in cells", async () => {
    const film = await filmNew();
    await film.type("| Task | Notes |");
    await film.enter(0.6);
    await film.type("Print");
    await film.press("Tab", Key.Tab, 0.35);
    await film.type("A4, both sides");
    // a second line in the same cell
    await film.press("Enter", Key.Enter, 0.6);
    await film.type("Staple it");
    await film.press("Tab", Key.Tab, 0.35);
    await film.type("Send");
    await film.press("Tab", Key.Tab, 0.35);
    await film.type("By Friday");
    await film.pause(1);
    // from the start of the cell, Shift+← selects both cells of the row
    await film.press("Home", Key.Home, 0.4);
    await film.shortcut(["Shift", "←"], () => pressShift(Key.ArrowLeft), 0.9);
    await film.press("Backspace", Key.Backspace, 1);
    await film.pause(2);
    film.save(path.join(outDir, "table-cells.gif"), 335);
  });

  it("records table mode", async () => {
    const film = await filmNew();
    await film.type("| Fruit | Qty |");
    await film.enter(0.5);
    for (const [i, text] of [
      "Pears",
      "12",
      "Apples",
      "40",
      "Kiwis",
      "25",
    ].entries()) {
      if (i > 0) await film.press("Tab", Key.Tab, 0.3);
      await film.type(text);
    }
    await film.pause(0.8);
    // the toolbar shows its keys, which then change the table
    await film.shortcut(["Mod", "T"], () => pressMod("t"), 1.4);
    await film.press("↓", Key.ArrowDown, 1);
    await film.press("S", "s", 1.2);
    await film.press("R", "r", 1.2);
    await film.press("Esc", Key.Escape, 0.8);
    await film.pause(2);
    film.save(path.join(outDir, "table-mode.gif"), 335);
  });

  it("records pasting cells from a spreadsheet", async () => {
    const film = await filmNew();
    await film.type("# Fruit stock");
    await film.enter(0.6);
    // cells copied in a spreadsheet: tab-separated text
    await film.shortcut(
      ["Mod", "V"],
      () =>
        paste({
          "text/plain": "Fruit\tQty\tPrice\nApples\t40\t1.20\nPears\t12\t0.80",
        }),
      1.6,
    );
    // Tab in the last cell adds a row, where two more rows get pasted
    const lastCell = await browser.execute(() => {
      const table = window.blankGeometry.tables()[0]!;
      const { rows, columns } = table.pieces[table.pieces.length - 1];
      return {
        x: Math.round(columns[columns.length - 2] + 30),
        y: Math.round((rows[rows.length - 2] + rows[rows.length - 1]) / 2),
      };
    });
    await browser.action("pointer").move(lastCell).down().up().perform();
    await film.pause(0.4);
    await film.press("Tab", Key.Tab, 0.6);
    await film.shortcut(
      ["Mod", "V"],
      () => paste({ "text/plain": "Kiwis\t25\t0.40\nPlums\t30\t0.25" }),
      1.6,
    );
    await film.pause(2);
    film.save(path.join(outDir, "table-paste.gif"), 335);
  });

  it("records changing a table with the mouse", async () => {
    const film = await filmNew();
    // the table is there before the film starts
    for (const [i, line] of [
      "| Fruit | Qty | Note |",
      "Pears",
      "12",
      "ripe",
      "Apples",
      "40",
      "",
      "Kiwis",
      "25",
    ].entries()) {
      if (i > 1) await type(Key.Tab);
      for (const char of line) await typeChar(char);
      if (i === 0) await type(Key.Enter);
    }
    await film.pause(0.8);
    // the painted table, see src/engine/geometry.ts
    const layout = () =>
      browser.execute(() => {
        const table = window.blankGeometry.tables()[0]!;
        const { box, rows, columns } = table.pieces[0];
        return { rows, columns, left: box.left, bottom: box.bottom };
      });
    const middle = (lines: number[], i: number) =>
      Math.round((lines[i] + lines[i + 1]) / 2);

    // the handle of the Kiwis row moves it to the top
    let table = await layout();
    await film.moveTo({ x: table.left + 70, y: middle(table.rows, 3) }, 0.8);
    await film.moveTo({ x: table.left, y: middle(table.rows, 3) }, 0.4);
    await film.drag({ x: table.left, y: table.rows[1] + 4 }, 0.9);

    // the + between two rows inserts one, which gets filled: it shows
    // while the pointer is over the table, near the line
    table = await layout();
    await film.moveTo(
      { x: table.left + 40, y: Math.round(table.rows[3]) + 8 },
      0.5,
    );
    await film.moveTo(
      { x: table.left + 1, y: Math.round(table.rows[3]) + 1 },
      0.5,
    );
    await $("#table-handles .insert").waitForDisplayed();
    await film.clickOn($("#table-handles .insert"), 0.6);
    await film.hidePointer();
    await film.type("Plums");
    await film.press("Tab", Key.Tab, 0.3);
    await film.type("7");
    await film.pause(0.6);

    // the line between two columns resizes them
    table = await layout();
    const y = middle(table.rows, 2);
    await film.moveTo({ x: Math.round(table.columns[1]), y }, 0.8);
    await film.drag({ x: Math.round(table.columns[1]) + 110, y }, 0.8);

    // the bottom edge adds rows
    table = await layout();
    const x = Math.round((table.columns[0] + table.columns[1]) / 2);
    await film.moveTo({ x, y: Math.round(table.bottom) + 1 }, 0.7);
    await film.drag({ x, y: Math.round(table.bottom) + 70 }, 0.9);
    await film.moveTo({ x: 700, y: 20 }, 0.6);
    await film.hidePointer();
    await film.pause(2);
    await browser.releaseActions();
    film.save(path.join(outDir, "table-mouse.gif"), 415);
  });

  it("records the writing demo", async () => {
    const frames = fs.mkdtempSync(path.join(os.tmpdir(), "blank-frames-"));
    const film = new Recorder(frames);
    await pressMod("n");
    await expect($("#ui-top")).toHaveText("» Untitled");

    // an empty page and a blinking cursor, then a writer finding their way in.
    // autocorrect does the rest: headings, quotes, dashes, apostrophes and capitals
    await film.pause(1.5);
    await film.type("# A great start");
    await film.enter(0.9);
    await film.type(
      'every story begins the same way: a blank page, a blinking cursor and a quiet "what if?"',
    );
    await film.pause(1.2);
    await film.enter();
    await film.type(
      "you write one word, then another. the room goes quiet -- and for a moment, everything is uncertain",
    );
    await film.pause(1.2);
    await film.erase("uncertain".length);
    await film.pause(0.6);
    await film.type("possible.");
    await film.pause(1.2);
    await film.enter();
    await film.type("that's the joy of it: ");
    await film.shortcut(["Mod", "I"], () => pressMod("i"));
    await film.type("nothing between you and your words.");
    await film.shortcut(["Mod", "I"], () => pressMod("i"), 0.6);
    await film.pause(2);
    // and as the evening comes, the page goes dark
    await film.shortcut(["Mod", "Alt", "T"], () => pressMod(Key.Alt, "t"), 1.4);
    await film.pause(3.5);

    film.save(path.join(outDir, "demo.gif"));
    fs.rmSync(frames, { recursive: true, force: true });
    fs.rmSync(sample, { force: true });
  });
});

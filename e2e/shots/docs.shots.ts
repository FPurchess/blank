import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { $, browser } from "@wdio/globals";

import { focusEditor, Key, pressMod, restartApp, type } from "../helpers.ts";

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

const shot = (name: string) =>
  browser.saveScreenshot(path.join(outDir, `${name}.png`));

const setTheme = async (theme: string) => {
  while ((await browser.execute(() => document.body.dataset.theme)) !== theme) {
    await pressMod(Key.Alt, "t");
  }
};

/**
 * shift presses `key` with Shift held, as separate actions: WebKitWebDriver
 * drops the Shift of `browser.keys`
 */
const shift = async (key: string) => {
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

// the symbols typed with Shift on a US keyboard, and the keys they're on
const SHIFTED = '~!@#$%^&*()_+{}|:"<>?';
const UNSHIFTED = "`1234567890-=[]\\;',./";

/**
 * typeChar types `char`. Capitals and the symbols on Shift are typed with
 * Shift held, since WebKitWebDriver types them without it after a right-click.
 */
const typeChar = (char: string) => {
  const index = SHIFTED.indexOf(char);
  if (index >= 0) return shift(UNSHIFTED[index]);
  return char === char.toLowerCase() ? type(char) : shift(char.toLowerCase());
};

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

  async enter(pause = 0.6) {
    await type(Key.Enter);
    await this.frame(pause);
  }

  /** press `key`, shown as a keycap labelled `label`, e.g. Tab or an arrow */
  async press(label: string, key: string, seconds = 0.5) {
    await this.shortcut([label], () => type(key), seconds);
  }

  /**
   * write the GIF, with the frame durations from above. It shows the top
   * `height` pixels of the window and the status bar below them.
   */
  save(gif: string, height = 345) {
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
          // of the window in the app) below it, without the empty page in between
          `split[t][b];[t]crop=800:${height}:0:0[top];[b]crop=800:55:0:545[bar];[top][bar]vstack,` +
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

/** shows `keys` in the shortcut overlay, or hides it for no keys */
const showKeys = (keys: string[]) =>
  browser.execute((labels: string[]) => {
    let overlay = document.getElementById("shots-keys");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "shots-keys";
      Object.assign(overlay.style, {
        position: "fixed",
        left: "50%",
        bottom: "9px",
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
  }, keys.map(keyLabel));

/** hides the cursor while the body has `shots-no-caret` */
const addCaretStyle = () =>
  browser.execute(() => {
    const style = document.createElement("style");
    style.textContent =
      ".shots-no-caret .ProseMirror { caret-color: transparent; }";
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

  it("captures spell check", async () => {
    await pressMod("n");
    await pressMod(Key.Alt, "s");
    await expect($("#ui-spellcheck")).toHaveText("Spelling");
    await type("every story begins with a blank page and a singel idea.");
    await browser.waitUntil(
      async () => (await $(".spelling-error").getText()) === "singel",
    );
    // at the end of the word, so the menu leaves it visible
    const word = $(".spelling-error");
    await word.click({
      button: "right",
      x: Math.floor((await word.getSize("width")) / 2) - 2,
    });
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
    film.save(path.join(outDir, "table-insert.gif"), 420);
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
    film.save(path.join(outDir, "table-header.gif"), 300);
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
    await film.shortcut(["Shift", "←"], () => shift(Key.ArrowLeft), 0.9);
    await film.press("Backspace", Key.Backspace, 1);
    await film.pause(2);
    film.save(path.join(outDir, "table-cells.gif"), 360);
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

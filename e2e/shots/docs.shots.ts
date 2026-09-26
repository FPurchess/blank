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
 * types `text` and saves a frame after every key, so the frames can be turned into a GIF
 */
const record = async (frames: string, text: string) => {
  for (const char of text) {
    await type(char);
    const count = fs.readdirSync(frames).length;
    await browser.saveScreenshot(
      path.join(frames, `${String(count).padStart(5, "0")}.png`),
    );
  }
};

describe("docs screenshots", () => {
  before(async () => {
    fs.mkdirSync(outDir, { recursive: true });
    fs.copyFileSync(path.join(dirname, "sample.md"), sample);
    await restartApp([sample]);
    await focusEditor();
    // the pictures show English, whatever the system language is
    await pressMod(Key.Alt, "l");
    await type("en");
    await type(Key.Enter);
    // no blinking cursor in the pictures
    await browser.execute(() => {
      const style = document.createElement("style");
      style.textContent = ".ProseMirror { caret-color: transparent; }";
      document.head.appendChild(style);
    });
  });

  it("captures every theme", async () => {
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

  it("records the autocorrect demo", async () => {
    const frames = fs.mkdtempSync(path.join(os.tmpdir(), "blank-frames-"));
    await pressMod("n");
    await expect($("#ui-top")).toHaveText("» Untitled");
    await record(frames, "## A new idea");
    await type(Key.Enter);
    await record(frames, 'write "quotes", dashes -- and arrows --> as usual. ');
    await record(frames, "blank sets them for you.");
    await type(Key.Enter);
    await record(frames, "- a list starts with a dash");

    // a steady frame rate, and the last frame held for two seconds
    const gif = path.join(outDir, "demo.gif");
    const ffmpeg = spawnSync(
      "ffmpeg",
      [
        ...["-y", "-loglevel", "error", "-framerate", "14"],
        ...["-i", path.join(frames, "%05d.png")],
        ...[
          "-vf",
          "tpad=stop_mode=clone:stop_duration=2,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=64[p];[b][p]paletteuse=dither=none",
        ],
        gif,
      ],
      { stdio: "inherit" },
    );
    fs.rmSync(frames, { recursive: true, force: true });
    fs.rmSync(sample, { force: true });
    if (ffmpeg.status !== 0)
      throw new Error("ffmpeg failed to create the GIF (is it installed?)");
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import {
  clickAt,
  focusEditor,
  Key,
  pressMod,
  restartApp,
  type,
} from "../helpers.ts";

// Without the layout engine, e.g. when its wasm can't start, the editor shows
// the text itself and everything but the pages keeps working. The debug
// switch `blank.engine` in localStorage turns it off (engine-editor, see
// PROGRESS-ui.md for what needs engine/editor merged first).

// what the PDF export says without the engine: the constant engine-editor
// exports for it, copied, since the e2e package doesn't load the app's code
const NO_PDF = "The PDF export needs the page layout, which couldn't start.";

// the start of the last line, which typing keeps in view, clear of the
// header and the bars at the edges
const lastLine = () =>
  browser.execute(() => {
    const lines = document.querySelectorAll("#editor > p");
    const rect = lines[lines.length - 1].getBoundingClientRect();
    return {
      x: Math.round(rect.left + 10),
      y: Math.round(rect.top + rect.height / 2),
    };
  });

describe("without the layout engine", () => {
  let dir: string;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-no-engine-"));
    const file = path.join(dir, "no-engine.md");
    fs.writeFileSync(
      file,
      '---\npage:\n  header: {left: "{title}"}\n---\n\n# plain\n\nsome text.\n',
    );
    await browser.execute(() => localStorage.setItem("blank.engine", "off"));
    await restartApp([file]);
    await expect($("body")).toHaveElementClass("without-engine");
  });

  after(async () => {
    await browser.execute(() => localStorage.removeItem("blank.engine"));
    await restartApp();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("shows the text in IBM Plex Sans", async () => {
    const font = await browser.execute(
      () => getComputedStyle(document.querySelector("#editor")!).fontFamily,
    );
    expect(font).toMatch(/IBM Plex Sans/);
  });

  it("shows the header at the top edge", async () => {
    await expect($("#band-header")).toBeDisplayed();
    await expect($("#band-header .band-line")).toHaveText(
      expect.stringContaining("plain"),
    );
  });

  it("keeps the text in view while typing past the fold", async () => {
    await $("#editor p").click();
    await type(Key.End);
    for (let line = 0; line < 50; line++) await browser.keys(Key.Enter);
    await type("bottom");
    const caret = await browser.execute(() => {
      const range = getSelection()!.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom, height: innerHeight };
    });
    expect(caret.bottom).toBeGreaterThan(0);
    expect(caret.bottom).toBeLessThanOrEqual(caret.height);
  });

  it("opens the menu once from the keyboard, with its first item focused", async () => {
    await focusEditor();
    // the shortcut, after which WebKitGTK sends a contextmenu event of its
    // own, which mustn't open the menu again as a mouse's
    await browser.keys([Key.Shift, Key.F10]);
    await expect($("#context-menu")).toBeDisplayed();
    await browser.pause(300);
    const focused = await browser.execute(
      () =>
        document.activeElement?.closest("#context-menu [role^='menuitem']")
          ?.textContent ?? null,
    );
    expect(focused).not.toBeNull();
    await browser.keys(Key.Escape);
    await expect($("#context-menu")).not.toBeExisting();
  });

  it("opens the context menu where it's right clicked", async () => {
    const { x, y } = await lastLine();
    await clickAt(x, y, 2);
    const menu = $("#context-menu");
    await expect(menu).toBeDisplayed();
    expect(Math.abs((await menu.getLocation("x")) - x)).toBeLessThan(40);
    await browser.keys(Key.Escape);
  });

  it("shows the table toolbar in a table", async () => {
    const { x, y } = await lastLine();
    await clickAt(x, y);
    await type(Key.End);
    await type(Key.Enter);
    await pressMod("t");
    await expect($("#table-picker")).toBeDisplayed();
    await type(Key.Enter);
    await expect($("#table-toolbar")).toBeDisplayed();
  });

  it("says the PDF export needs the page layout", async () => {
    await pressMod(Key.Alt, "p");
    await expect($("#ui-announcement")).toHaveText(NO_PDF);
  });
});

describe("when the layout engine fails while running", () => {
  it("goes on in the editor without it", async () => {
    await restartApp();
    await expect($("#page-view .page-canvas")).toBeExisting();
    // the caret at the end of the text, placed through the engine while it
    // still works
    await focusEditor();
    // a debug hook of engine-editor's that makes the engine's next call fail
    await browser.execute(() =>
      (
        window as unknown as { blankBreakEngine: () => void }
      ).blankBreakEngine(),
    );
    // nothing has called it yet
    await expect($("body")).not.toHaveElementClass("without-engine");
    // a word the welcome document doesn't have, typed into the failing
    // engine's layout
    await type(" zqk");
    await expect($("body")).toHaveElementClass("without-engine");
    // the editor takes over and shows it
    await expect($("#editor")).toBeDisplayed();
    await expect($("#editor")).toHaveText(expect.stringContaining("zqk"));
  });
});

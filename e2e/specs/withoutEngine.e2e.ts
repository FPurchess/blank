import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import { Key, pressMod, restartApp, type } from "../helpers.ts";

// Without the layout engine, e.g. when its wasm can't start, the editor shows
// the text itself and everything but the pages keeps working. The debug
// switch `blank.engine` in localStorage turns it off (engine-editor, see
// PROGRESS-ui.md for what needs engine/editor merged first).

// what the PDF export says without the engine: the constant engine-editor
// exports for it, copied, since the e2e package doesn't load the app's code
const NO_PDF = "The PDF export needs the page layout, which couldn't start.";

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

  it("opens the context menu where it's right clicked", async () => {
    const heading = await $("#editor h1");
    const { x, y } = await heading.getLocation();
    await browser
      .action("pointer")
      .move({ x: Math.round(x + 10), y: Math.round(y + 8), origin: "viewport" })
      .down({ button: 2 })
      .up({ button: 2 })
      .perform();
    const menu = $("#context-menu");
    await expect(menu).toBeDisplayed();
    expect(Math.abs((await menu.getLocation("x")) - (x + 10))).toBeLessThan(40);
    await browser.keys(Key.Escape);
  });

  it("shows the table toolbar in a table", async () => {
    await $("#editor h1").click();
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
    // a debug hook of engine-editor's that makes the engine's next call fail
    await browser.execute(() =>
      (
        window as unknown as { blankBreakEngine: () => void }
      ).blankBreakEngine(),
    );
    await $("#page-view").click();
    await type("x");
    await expect($("body")).toHaveElementClass("without-engine");
    await expect($("#editor")).toBeDisplayed();
    await expect($("#editor")).toHaveText(expect.stringContaining("x"));
  });
});

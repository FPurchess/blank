import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import {
  activeTab,
  clickInto,
  expectActiveTab,
  expectEditorText,
  Key,
  pressMod,
  pressShift,
  restartApp,
  type,
} from "../helpers.ts";

// The formatting toolbar under the tab row, and the keys of alignment and
// underline it shows

const toolbarButton = (id: string) => $(`#format-toolbar [data-id="${id}"]`);

/**
 * waits until the file at `filePath` holds `text`
 */
const waitForFileWith = async (filePath: string, text: string) => {
  await browser.waitUntil(
    () => fs.readFileSync(filePath, "utf8").includes(text),
    {
      timeoutMsg: `${filePath} doesn't hold ${text}: ${fs.readFileSync(filePath, "utf8")}`,
    },
  );
};

/**
 * selects the text of the first paragraph with the keyboard
 */
const selectParagraph = async () => {
  await clickInto("#editor p");
  await type(Key.Home);
  await pressShift(Key.End);
};

describe("formatting toolbar", () => {
  let dir: string;
  let file: string;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-toolbar-"));
    file = path.join(dir, "toolbar.md");
    fs.writeFileSync(file, "# Toolbar\n\nsome words here\n");
    await restartApp([file]);
    await expectActiveTab("toolbar", file);
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("formats the selection on a click and keeps the selection", async () => {
    await selectParagraph();
    await toolbarButton("format.bold").click();

    await expectEditorText("#editor p strong", "some words here");
    await expect(toolbarButton("format.bold")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    // the selection is still there: typing replaces it
    await type("xyz");
    await expectEditorText("#editor p", "xyz");
    await pressMod("z");
    await expectEditorText("#editor p", "some words here");
  });

  it("centers with Mod-Shift-E, which a save and a restart keep", async () => {
    await clickInto("#editor p");
    await pressMod(Key.Shift, "e");
    await expect(toolbarButton("format.align_center")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await pressMod("s");
    await waitForFileWith(file, '<div align="center">');

    await restartApp([file]);
    await expectActiveTab("toolbar", file);
    await expectEditorText("#editor p", "some words here");
    await expect($("#editor p")).toHaveAttribute(
      "style",
      expect.stringContaining("center"),
    );
  });

  it("underlines with Mod-U", async () => {
    await selectParagraph();
    await pressMod("u");
    await expectEditorText("#editor p u", "some words here");
    await pressMod("s");
    await waitForFileWith(file, "<u>");
  });

  it("takes the focus from Alt-F10, moves with the arrows and gives it back on Escape", async () => {
    await clickInto("#editor p");
    await browser.keys([Key.Alt, Key.F10]);
    await expect(toolbarButton("undo")).toBeFocused();
    await browser.keys(Key.ArrowRight);
    await expect(toolbarButton("redo")).toBeFocused();
    await browser.keys(Key.Escape);
    await expect($("#editor")).toBeFocused();
  });

  it("is where F6 goes after the tabs, and Alt-F10 goes from the tabs too", async () => {
    // the toolbar remembers the button it had, so any of its buttons
    const inToolbar = () =>
      browser.waitUntil(
        () =>
          browser.execute(
            () => !!document.activeElement?.closest("#format-toolbar"),
          ),
        { timeoutMsg: "the focus isn't in the toolbar" },
      );
    await clickInto("#editor p");
    await browser.keys(Key.F6);
    await expect(activeTab()).toBeFocused();
    await browser.keys(Key.F6);
    await inToolbar();
    await browser.keys(Key.F6);
    await expect($("#editor")).toBeFocused();
    // the other way round
    await pressShift(Key.F6);
    await inToolbar();
    await browser.keys(Key.Escape);
    await browser.keys(Key.F6);
    await expect(activeTab()).toBeFocused();
    await browser.keys([Key.Alt, Key.F10]);
    await inToolbar();
    await browser.keys(Key.Escape);
    await expect($("#editor")).toBeFocused();
  });
});

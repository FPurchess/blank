import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import { clickInto, Key, pressMod, restartApp, type } from "../helpers.ts";

// The hand on everything that acts on a click, the text cursor in text
// fields and the arrow on what's disabled (src/scss/_controls.scss), as the
// webview computes them, in the toolbar, the picker, the menu and a dialog.

const file = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "blank-pointer-")),
  "pointer.md",
);

// what the controls in the UI show, by what they are
const cursors = () =>
  browser.execute(() => {
    const clickable =
      'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="menuitemcheckbox"], [role="menuitemradio"], [role="option"], [role="radio"], [role="switch"]';
    const wrong: string[] = [];
    let seen = 0;
    for (const element of document.querySelectorAll<HTMLElement>(
      `#ui ${clickable.split(", ").join(", #ui ")}`,
    )) {
      if (!element.getClientRects().length) continue;
      seen++;
      const disabled =
        element.matches(":disabled") ||
        element.getAttribute("aria-disabled") === "true";
      const cursor = getComputedStyle(element).cursor;
      if (cursor !== (disabled ? "default" : "pointer")) {
        wrong.push(`${element.outerHTML.slice(0, 80)}: ${cursor}`);
      }
    }
    for (const element of document.querySelectorAll<HTMLElement>(
      '#ui input[type="text"], #ui input:not([type]), #ui textarea',
    )) {
      if (!element.getClientRects().length) continue;
      seen++;
      const cursor = getComputedStyle(element).cursor;
      if (cursor !== "text") wrong.push(`${element.id}: ${cursor}`);
    }
    return { seen, wrong };
  });

const expectCursors = async () => {
  const { seen, wrong } = await cursors();
  expect(seen).toBeGreaterThan(0);
  expect(wrong).toEqual([]);
};

describe("the pointer", () => {
  before(async () => {
    fs.writeFileSync(file, "# Pointer\n\nsome text\n");
    await restartApp([file]);
  });

  after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));

  it("shows the hand on the table picker and the toolbar", async () => {
    await clickInto("#editor p");
    await type(Key.End);
    await type(Key.Enter);
    await pressMod("t");
    await expect($("#table-picker")).toBeDisplayed();
    await type(Key.Enter);
    await expect($("#table-toolbar")).toBeDisplayed();
    await expectCursors();
  });

  it("shows the hand on the menu's items", async () => {
    await browser.keys([Key.Shift, Key.F10]);
    await expect($("#context-menu")).toBeDisplayed();
    await expectCursors();
    await type(Key.Escape);
    await expect($("#context-menu")).not.toBeExisting();
  });

  it("shows the hand on a dialog's buttons and the text cursor in its fields", async () => {
    await clickInto("#editor p");
    await pressMod("k");
    await expect($("#link-dialog")).toBeDisplayed();
    await expectCursors();
    await type(Key.Escape);
    await expect($("#link-dialog")).not.toBeExisting();
  });
});

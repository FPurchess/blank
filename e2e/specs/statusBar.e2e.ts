import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { $, $$, browser, expect } from "@wdio/globals";

import { STATUS_HEIGHT } from "../../src/chrome.ts";
import { Key, pressMod, restartApp, type } from "../helpers.ts";

// The status bar at the bottom: every item is a button, and what the keys
// do there the mouse can do too

describe("status bar", () => {
  let dir: string;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-status-"));
    const file = path.join(dir, "two pages.md");
    fs.writeFileSync(
      file,
      // a first page longer than the window, so the view can scroll to the
      // second
      `# Field notes\n\n${"One two three.\n\n".repeat(20)}<!-- pagebreak -->\n\n# The flow\n\nFour five.\n`,
    );
    await restartApp([file]);
    await expect($("#ui-page-number")).toHaveText("Page 1 of 2");
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("sits above the pages, which end at its top", async () => {
    const [bar, view] = await browser.execute(() =>
      ["ui-bottom", "page-view"].map((id) => {
        const box = document.getElementById(id)!.getBoundingClientRect();
        return { top: box.top, bottom: box.bottom, height: box.height };
      }),
    );
    expect(bar.height).toBe(STATUS_HEIGHT);
    expect(view.bottom).toBe(bar.top);
  });

  it("goes to a page from the menu of the page number", async () => {
    await $("#ui-page-number").click();
    const items = await $$("#context-menu [role=menuitem]");
    expect(items).toHaveLength(2);
    await expect(items[1]).toHaveText(expect.stringContaining("The flow"));

    await items[1].click();
    await expect($("#context-menu")).not.toExist();
    await expect($("#ui-page-number")).toHaveText("Page 2 of 2");
  });

  it("switches the view with one button", async () => {
    await expect($("#page-view")).toHaveElementClass("page-ends");
    await $("#ui-view").click();
    await expect($("#page-view")).toHaveElementClass("pages");
    await expect($("#ui-view")).toHaveAttribute(
      "aria-label",
      "View: pages. Switch to page ends",
    );
    await $("#ui-view").click();
    await expect($("#page-view")).toHaveElementClass("page-ends");
  });

  it("shows the details of the word count, which a key closes", async () => {
    await $("#ui-stats").click();
    await expect($("#word-count-card")).toBeDisplayed();
    // the name is set in capitals
    await expect($("#word-count-card")).toHaveText(/TWO PAGES\.MD/);

    await type("x");
    await expect($("#word-count-card")).not.toExist();

    await pressMod(Key.Alt, "c");
    await expect($("#word-count-card")).toBeDisplayed();
    await browser.keys(Key.Escape);
    await expect($("#word-count-card")).not.toExist();
  });

  it("turns spell check on and off, with the misspellings beside it", async () => {
    await expect($("#ui-spellcheck")).toHaveText("Spelling off");
    await expect($("#ui-misspelling-next")).not.toExist();

    await $("#ui-spellcheck").click();
    await expect($("#ui-spellcheck")).toHaveAttribute("aria-pressed", "true");
    // there, but shown only where the window is wider than its 800 px
    await expect($("#ui-misspelling-next")).toExist();

    await $("#ui-spellcheck").click();
    await expect($("#ui-spellcheck")).toHaveText("Spelling off");
  });
});

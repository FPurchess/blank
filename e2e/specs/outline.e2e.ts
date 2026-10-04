import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, $$, expect } from "@wdio/globals";

import { STATUS_HEIGHT, TOP_BAR_HEIGHT } from "../../src/chrome.ts";
import { Key, pressMod, restartApp } from "../helpers.ts";

// The outline: the dashes at the right edge, the list they open, a click on
// a heading that scrolls to it and leaves the cursor, and the list kept open
// beside the pages on a wide window, across restarts.

const paragraph =
  "Writing is thinking on paper, and every line of this paragraph ends where the layout says it ends, on the screen and in the PDF alike.";

const markdown = Array.from({ length: 6 }, (_, chapter) => [
  `# Chapter ${chapter + 1}`,
  "",
  ...Array.from({ length: 6 }, () => `${paragraph}\n`),
  `## Section ${chapter + 1}.1`,
  "",
  `${paragraph}\n`,
])
  .flat()
  .join("\n");

const file = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "blank-outline-")),
  "outline.md",
);

// how far below the top of the view the text of the heading `text` starts
const headingOffset = (text: string) =>
  browser.execute((text) => {
    const { blankGeometry } = window;
    const [top] = blankGeometry.scrollTops([blankGeometry.find(text)]);
    const state = blankGeometry.scrollState();
    return top === null || !state ? null : top - state.top;
  }, text);

// where the editor's selection is
const selection = () =>
  browser.execute(() => {
    const { anchorNode, anchorOffset } = document.getSelection()!;
    return `${anchorNode?.textContent?.slice(0, 20)}@${anchorOffset}`;
  });

const windowWidth = () => browser.execute(() => window.innerWidth);

describe("the outline", () => {
  before(async () => {
    fs.writeFileSync(file, markdown);
    await restartApp([file]);
  });

  after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));

  it("shows a dash for each heading", async () => {
    await expect($$("#outline .outline-dash")).toBeElementsArrayOfSize(12);
    await expect($("#outline .outline-dash.current")).toBeExisting();
    await expect($(".outline-list")).not.toBeExisting();
  });

  it("shows the headings while the pointer is over the dashes", async () => {
    await $(".outline-dashes").moveTo();
    await expect($(".outline-list.peek")).toBeExisting();
    await expect($$(".outline-entry")).toBeElementsArrayOfSize(12);
  });

  it("scrolls to a heading and leaves the cursor where it was", async () => {
    const before = await selection();
    await $$(".outline-entry")[6].click();
    await browser.waitUntil(
      async () => Math.abs(((await headingOffset("Chapter 4")) ?? 0) - 108) < 2,
      { timeoutMsg: "the heading didn't land below the top of the view" },
    );
    await expect($(".outline-entry.current")).toHaveText("Chapter 4");
    expect(await selection()).toBe(before);
    // the pointer leaves, and the list with it
    await $("#ui-top").moveTo();
    await expect($(".outline-list")).not.toBeExisting();
  });

  it("floats over the pages on a narrow window from the keyboard", async () => {
    expect(await windowWidth()).toBeLessThan(1000);
    await pressMod(Key.Alt, "o");
    // a side pane over the pages, which hides the dashes until it closes
    await expect($(".outline-list.floating")).toBeExisting();
    await expect($('button[aria-label="Hide outline"]')).toBeExisting();
    await expect($(".outline-dashes")).not.toBeExisting();
    await pressMod(Key.Alt, "o");
    await expect($(".outline-list")).not.toBeExisting();
    await expect($(".outline-dashes")).toBeExisting();
  });

  it("stays open beside the pages on a wide window, across restarts", async () => {
    await browser.setWindowSize(1280, 800);
    await browser.waitUntil(async () => (await windowWidth()) >= 1000, {
      timeoutMsg: "the window didn't grow",
    });
    await pressMod(Key.Alt, "o");
    await expect($("#outline.docked, #outline.beside")).toBeExisting();
    await expect($(".outline-list.open")).toBeExisting();
    await expect($(".outline-dashes")).not.toBeExisting();
    // a short outline still fills the room between the top bar and the
    // status bar
    const room = await browser.execute(() => {
      const list = document.querySelector(".outline-list")!;
      const { top, bottom } = list.getBoundingClientRect();
      return { top, below: window.innerHeight - bottom };
    });
    expect(room).toEqual({ top: TOP_BAR_HEIGHT, below: STATUS_HEIGHT });

    await restartApp([file]);
    await browser.setWindowSize(1280, 800);
    await expect($(".outline-list.open")).toBeExisting();

    await $('button[aria-label="Hide outline"]').click();
    await expect($(".outline-list")).not.toBeExisting();
    await expect($(".outline-dashes")).toBeExisting();
  });
});

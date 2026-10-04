import { $, browser, expect } from "@wdio/globals";

import {
  focusEditor,
  Key,
  nextFrames,
  pointAt,
  pressMod,
  restartApp,
  type,
} from "../helpers.ts";

// The blocks pane: inserting a block by dragging its tile between two
// paragraphs, moving a selected block on the pages, what Blank says when a
// block goes, and the pane staying open across a restart.

// the kinds of the blocks at the top of the document, in order
const kinds = () =>
  browser.execute(() =>
    window.blankGeometry.topBlocks().map((block) => block.type),
  );

// where the table of contents shows on the pages, in the window
const tocBox = () =>
  browser.execute(() => {
    const geometry = window.blankGeometry;
    const toc = geometry.topBlocks().find((block) => block.type === "toc");
    return toc ? geometry.blockBoxes(toc.from, toc.to)[0] : null;
  });

// a point in the upper half of the line of `text`, where a block dropped
// goes before that paragraph. Each paragraph is found by its second word,
// which autocorrect never capitalizes, as it does the first once a space or
// Enter follows it.
const above = async (text: string) => {
  const at = await pointAt(text, 0, 2);
  return { ...at, y: at.y - 3 };
};

describe("the blocks pane", () => {
  before(async () => {
    await focusEditor();
    await pressMod("a");
    await type("alpha one");
    await type(Key.Enter);
    await type("beta two");
    await type(Key.Enter);
    await type("gamma three");
    await nextFrames();
  });

  it("inserts the block of a tile dragged between two paragraphs", async () => {
    await pressMod(Key.Alt, "b");
    const tile = $('#blocks-pane .tile[data-block="toc"]');
    await expect(tile).toBeDisplayed();
    const from = await tile.getLocation();
    const to = await above("three");
    await browser
      .action("pointer")
      .move({ x: Math.round(from.x + 20), y: Math.round(from.y + 20) })
      .down()
      .move({
        x: Math.round(from.x + 40),
        y: Math.round(from.y + 20),
        duration: 50,
      })
      .move({ ...to, duration: 150 })
      .perform(true);
    // the line shows where it goes before it is let go
    await expect($(".block-drop-line")).toBeDisplayed();
    await browser.action("pointer").up().perform();
    await expect($(".block-drop-line")).not.toBeExisting();
    expect(await kinds()).toEqual([
      "paragraph",
      "paragraph",
      "toc",
      "paragraph",
    ]);
    await expect($("#ui-announcement")).toHaveText(
      "Table of contents inserted",
    );
    await expect($("#editor nav.toc.ProseMirror-selectednode")).toBeExisting();
  });

  it("moves a selected block where it is dragged", async () => {
    await nextFrames();
    const box = await tocBox();
    if (!box) throw new Error("the table of contents isn't on the pages");
    const from = {
      x: Math.round((box.left + box.right) / 2),
      y: Math.round((box.top + box.bottom) / 2),
    };
    const to = await above("two");
    await browser
      .action("pointer")
      .move(from)
      .down()
      .move({ ...from, y: from.y - 10, duration: 50 })
      .move({ ...to, duration: 150 })
      .up()
      .perform();
    await nextFrames();
    expect(await kinds()).toEqual([
      "paragraph",
      "toc",
      "paragraph",
      "paragraph",
    ]);
  });

  it("says a block removed with Delete is gone", async () => {
    await expect($("#editor nav.toc.ProseMirror-selectednode")).toBeExisting();
    await type(Key.Delete);
    await expect($("#ui-announcement")).toHaveText("Table of contents removed");
    expect(await kinds()).not.toContain("toc");
  });

  it("stays open across a restart, until its shortcut closes it", async () => {
    await expect($("#blocks-pane")).toBeDisplayed();
    await restartApp();
    await expect($("#blocks-pane")).toBeDisplayed();
    await focusEditor();
    await pressMod(Key.Alt, "b");
    await expect($("#blocks-pane input[type=search]")).toBeFocused();
    await pressMod(Key.Alt, "b");
    await expect($("#blocks-pane")).not.toBeExisting();
  });
});

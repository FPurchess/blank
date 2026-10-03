import { browser, expect } from "@wdio/globals";

import {
  editorText,
  focusEditor,
  paste,
  pressMod,
  type,
  nextFrames,
  pointAt,
} from "../helpers.ts";

// Moving selected text on the painted pages with the pointer, and the clicks
// in a selection that must not move it.

// typed in lowercase, which autocorrect starts with a capital
const LINE = "alpha beta gamma delta";
const SHOWN = "Alpha beta gamma delta";

// what the editor has selected, from its hidden DOM
const selected = () =>
  browser.execute(() => window.getSelection()?.toString() ?? "");

// a double click, which selects a word
const selectWord = async (word: string) => {
  const at = await pointAt(word, 1, 2);
  await browser
    .action("pointer")
    .move(at)
    .down()
    .up()
    .pause(50)
    .down()
    .up()
    .perform();
  await nextFrames();
  // not a third click
  await browser.pause(600);
};

describe("moving text on the pages", () => {
  beforeEach(async () => {
    await focusEditor();
    await pressMod("a");
    await type(LINE);
    await nextFrames();
  });

  it("selects the line with a triple click in a selected word", async () => {
    const at = await pointAt("beta", 1, 2);
    await browser
      .action("pointer")
      .move(at)
      .down()
      .up()
      .pause(50)
      .down()
      .up()
      .pause(50)
      .down()
      .up()
      .perform();
    await nextFrames();
    expect(await selected()).toBe(SHOWN);
  });

  it("moves a selected word where it's dropped", async () => {
    await selectWord("gamma");
    expect(await selected()).toBe("gamma");
    const from = await pointAt("gamma", 2, 2);
    const to = await pointAt("Alpha", 0, 2);
    await browser
      .action("pointer")
      .move(from)
      .down()
      .move({ ...from, x: from.x - 10, duration: 50 })
      .move({ ...to, duration: 100 })
      .up()
      .perform();
    await nextFrames();
    // where "gamma" was, its spaces stay
    expect((await editorText())[0]).toBe("gammaAlpha beta  delta");
  });

  it("leaves the text where it was when it's let go on the bar below the pages", async () => {
    await selectWord("beta");
    const from = await pointAt("beta", 2, 2);
    // the bottom bar, below the pages
    const bar = await browser.execute(() => {
      const box = document.getElementById("ui-bottom")!.getBoundingClientRect();
      return { x: box.left, y: box.top };
    });
    await browser
      .action("pointer")
      .move(from)
      .down()
      .move({ ...from, x: from.x + 10, duration: 50 })
      .move({
        x: Math.round(bar.x + 20),
        y: Math.round(bar.y + 5),
        origin: "viewport",
        duration: 100,
      })
      .up()
      .perform();
    await nextFrames();
    expect((await editorText())[0]).toBe(SHOWN);
  });

  it("scrolls at the bottom edge while a word is dragged there", async () => {
    // lines enough for a few pages after the first
    await pressMod("End");
    await paste({
      "text/plain": Array.from({ length: 120 }, (_, n) => `line ${n}`).join(
        "\n\n",
      ),
    });
    await nextFrames();
    await pressMod("Home");
    await nextFrames();
    await selectWord("beta");
    const from = await pointAt("beta", 2, 2);
    const height = await browser.execute(() => window.innerHeight);
    await browser
      .action("pointer")
      .move(from)
      .down()
      .move({ ...from, y: from.y + 10, duration: 50 })
      // at the bottom edge, where the view scrolls
      .move({ ...from, y: height - 4, duration: 100 })
      .pause(800)
      // back up onto the pages, and let go there
      .move({ ...from, y: Math.round(height / 2), duration: 100 })
      .up()
      .perform();
    await nextFrames();
    const scrolled = await browser.execute(
      () => document.getElementById("page-view")!.scrollTop,
    );
    expect(scrolled).toBeGreaterThan(200);
    const [first, ...rest] = await editorText("#editor p");
    // gone from the first line, and dropped further down
    expect(first).not.toContain("beta");
    expect(rest.join("\n")).toContain("beta");
  });
});

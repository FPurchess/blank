import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, $$, expect } from "@wdio/globals";

import {
  boxOf,
  clickText,
  doubleClickAt,
  editorText,
  Key,
  pressShift,
  restartApp,
  textBox,
} from "../helpers.ts";

// Moving through the painted lines with the keys and the pointer, as
// engine-editor's fixes make it (see PROGRESS-ui.md for what needs
// engine/editor merged first).

// where the painted caret is, in the window
const caretTop = async () => {
  await browser.executeAsync((done: () => void) =>
    requestAnimationFrame(() => requestAnimationFrame(() => done())),
  );
  return browser.execute(
    () =>
      document.querySelector("#page-view .page-caret")?.getBoundingClientRect()
        .top ?? null,
  );
};

const URL = `https://example.com/${"a-rather-long-path-segment/".repeat(8)}end`;

describe("navigation", () => {
  let dir: string;
  const open = async (content: string) => {
    const file = path.join(dir, "navigation.md");
    fs.writeFileSync(file, content);
    await restartApp([file]);
    await $("#page-view .page-canvas").waitForExist();
  };

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-navigation-"));
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("visits each ragged line once with down, down, up, up", async () => {
    await open(
      [
        "first line.",
        "",
        "a much longer second paragraph, which is still one line on the page.",
        "",
        "third.",
        "",
        "and a fourth line to end on.",
        "",
      ].join("\n"),
    );
    await clickText("line.", { offset: 4 });
    const tops = [await caretTop()];
    for (const key of [
      Key.ArrowDown,
      Key.ArrowDown,
      Key.ArrowUp,
      Key.ArrowUp,
    ]) {
      await browser.keys(key);
      tops.push(await caretTop());
    }
    const [one, two, three, back, again] = tops as number[];
    expect(two).toBeGreaterThan(one);
    expect(three).toBeGreaterThan(two);
    expect(back).toBe(two);
    expect(again).toBe(one);
  });

  it("stays on the line of a long web address with End", async () => {
    await open(`see ${URL} for more.\n`);
    await clickText("see");
    const before = await caretTop();
    await browser.keys(Key.End);
    expect(await caretTop()).toBe(before);
  });

  it("selects cells with Shift and down, and with a drag", async () => {
    await open("| a | b |\n| - | - |\n| c | d |\n| e | f |\n");
    await clickText("c");
    await pressShift(Key.ArrowDown);
    await browser.waitUntil(
      async () => (await $$("#editor .selectedCell").length) >= 2,
      { timeoutMsg: "Shift+↓ made no cell selection" },
    );

    // from the middle of one cell to another
    const { rows, columns } = await browser.execute(() => {
      const geometry = (
        window as unknown as {
          blankGeometry: {
            tables: () => { pieces: { rows: number[]; columns: number[] }[] }[];
          };
        }
      ).blankGeometry;
      return geometry.tables()[0].pieces[0];
    });
    const at = (column: number, row: number) => ({
      x: Math.round((columns[column] + columns[column + 1]) / 2),
      y: Math.round((rows[row] + rows[row + 1]) / 2),
    });
    // the pages paint it over both rows of the column
    const painted = await browser.execute(() => {
      const rects = [
        ...document.querySelectorAll("#page-view .page-selection"),
      ].map((element) => element.getBoundingClientRect());
      return {
        top: Math.min(...rects.map((rect) => rect.top)),
        bottom: Math.max(...rects.map((rect) => rect.bottom)),
      };
    });
    expect(painted.top).toBeLessThanOrEqual(rows[1] + 2);
    expect(painted.bottom).toBeGreaterThanOrEqual(rows[3] - 2);

    await clickText("a");
    await browser
      .action("pointer")
      .move(at(0, 1))
      .down()
      .move(at(1, 1))
      .move(at(1, 2))
      .up()
      .perform();
    await browser.waitUntil(
      async () => (await $$("#editor .selectedCell").length) >= 4,
      { timeoutMsg: "the drag made no cell selection" },
    );
  });

  it("moves a selected word where it's dragged", async () => {
    await open("move me here, then to the end.\n");
    // the word's box: pressed in its middle, inside the selection, not on
    // its edge
    const word = await boxOf("me");
    const middle = (word.top + word.bottom) / 2;
    const inside = (word.left + word.right) / 2;
    await doubleClickAt(inside, middle);
    // longer than a double click, so the press isn't a third click
    await browser.pause(800);
    const end = await textBox("end.", 4);
    const steps = 6;
    let action = browser
      .action("pointer")
      .move({ x: Math.round(inside), y: Math.round(middle) })
      .down();
    for (let step = 1; step <= steps; step++) {
      action = action.move({
        x: Math.round(inside + ((end.left - inside) * step) / steps),
        y: Math.round(middle + ((end.top - word.top) * step) / steps),
      });
    }
    await action.up().perform();
    await browser.waitUntil(
      async () => (await editorText("#editor p"))[0].endsWith("end.me"),
      {
        timeoutMsg: `the word didn't move: ${(await editorText("#editor p"))[0]}`,
      },
    );
  });
});

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
  waitForInk,
} from "../helpers.ts";

// Math: a file's formulas set on the pages, typed as $…$, edited in place
// with a preview, display math opened and numbered, and saved back as it was
// written. Types lowercase only (WebKitWebDriver types no capitals).

const file = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "blank-math-")),
  "math.md",
);

const maths = () => browser.execute(() => window.blankGeometry.maths());

// waits until the formulas are set, the math module and fonts loaded
const waitForMath = (count: number) =>
  browser.waitUntil(async () => {
    const found = await maths();
    return found.length === count && found.every((math) => math.box !== null);
  });

describe("math", () => {
  before(async () => {
    fs.writeFileSync(
      file,
      [
        "the mean is $\\bar{x} = \\frac{1}{n}\\sum x_i$ of all.",
        "$$\nE = mc^2\n$$ {#eq-1}",
        "the end.",
      ].join("\n\n"),
    );
    await restartApp([file]);
  });

  after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));

  it("sets a file's formulas on the pages", async () => {
    await waitForMath(2);
    const [inline, display] = await maths();
    expect(inline.type).toBe("math_inline");
    expect(display.type).toBe("math_display");
    await waitForInk(inline.box!);
    // display math's box is as wide as the text, the formula in its middle
    await waitForInk(display.box!, {}, 0.01);
    expect(
      await browser.execute(() => window.blankGeometry.mathNumbers()),
    ).toEqual([[display.pos, 1]]);
  });

  it("makes a formula of $…$ typed, and leaves prices alone", async () => {
    await focusEditor();
    await type(" so $y^2$ and $5 and $10 ");
    await waitForMath(3);
    const sources = (await maths()).map((math) => math.source);
    expect(sources).toContain("y^2");
    expect(sources).not.toContain("5 and ");
  });

  it("shows the source and a preview while the caret is in a formula", async () => {
    const [inline] = await maths();
    // a click on the formula opens it
    const box = inline.box!;
    await clickAt((box.left + box.right) / 2, (box.top + box.bottom) / 2);
    await expect($("#math-preview")).toBeExisting();
    await expect($("#math-preview canvas")).toBeExisting();
    await type(Key.Escape);
    await expect($("#math-preview")).not.toBeExisting();
  });

  it("says what's wrong with a formula being typed", async () => {
    await focusEditor();
    await type(" $\\nosuch");
    // inside the formula once it's closed and opened again
    await type("$ ");
    // back over the space and into the formula
    await type(Key.ArrowLeft);
    await type(Key.ArrowLeft);
    await expect($("#math-preview .error")).toHaveText(/line 1, column 1/);
    await type(Key.Escape);
  });

  it("opens display math with Enter, and closes it with Esc", async () => {
    await focusEditor();
    await type(Key.Enter);
    await type("$$");
    await type(Key.Enter);
    await type("a+b");
    await type(Key.Escape);
    await browser.waitUntil(async () =>
      (await maths()).some((math) => math.source === "a+b"),
    );
  });

  it("saves the formulas as they were written", async () => {
    await pressMod("s");
    await browser.waitUntil(() =>
      fs.readFileSync(file, "utf8").includes("$$\na+b\n$$"),
    );
    const saved = fs.readFileSync(file, "utf8");
    expect(saved).toContain("$\\bar{x} = \\frac{1}{n}\\sum x_i$");
    expect(saved).toContain("$$\nE = mc^2\n$$ {#eq-1}");
    expect(saved).toContain("$y^2$");
    expect(saved).toContain("$5 and $10");
  });
});

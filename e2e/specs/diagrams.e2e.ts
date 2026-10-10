import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import {
  clickAt,
  clickInto,
  Key,
  pressMod,
  pressShift,
  restartApp,
  type,
  waitForInk,
} from "../helpers.ts";

// A Mermaid diagram: drawn on the pages from the fence in a file, opened
// with a click or Enter and closed with Esc, its settings on Shift+Enter, aligned with
// the toolbar's keys, and saved as the fence with its settings around it.

const file = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "blank-diagrams-")),
  "diagrams.md",
);

// the box on the screen of the diagram, the second block
const diagramBox = () =>
  browser.execute(() => {
    const geometry = window.blankGeometry;
    const block = geometry.topBlocks().find(({ type }) => type === "diagram");
    if (!block) return null;
    const box = geometry.blockBoxes(block.from, block.to)[0];
    return box
      ? { left: box.left, right: box.right, top: box.top, bottom: box.bottom }
      : null;
  });

// the diagram's source, from the hidden editor (WebDriver's text is only
// what shows)
const sourceText = () =>
  browser.execute(
    () =>
      document.querySelector("#editor figure.diagram pre")?.textContent ?? "",
  );

// waits until the diagram's source holds `text`
const sourceHas = (text: string) =>
  browser.waitUntil(async () => (await sourceText()).includes(text), {
    timeoutMsg: `the diagram's source never held "${text}"`,
  });

const isOpen = () =>
  browser.execute(() =>
    document
      .querySelector("#editor figure.diagram")!
      .classList.contains("open"),
  );

describe("a diagram", () => {
  before(async () => {
    fs.writeFileSync(
      file,
      [
        "before the diagram.",
        "```mermaid\nflowchart LR\n  idea --> draft --> done\n```",
        "after the diagram.",
      ].join("\n\n"),
    );
    await restartApp([file]);
  });

  after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));

  it("is drawn on the pages from its fence", async () => {
    // Mermaid loads with the first diagram, and draws it then
    await browser.waitUntil(
      async () => {
        const box = await diagramBox();
        return box !== null && box.bottom - box.top > 30;
      },
      { timeout: 20_000, timeoutMsg: "the diagram was never laid out" },
    );
    await waitForInk((await diagramBox())!, {}, 0.005);
  });

  it("opens on Enter, follows what is typed, and closes on Esc", async () => {
    await clickInto("#editor p");
    await type(Key.ArrowDown);
    expect(await isOpen()).toBe(false);
    await type(Key.Enter);
    expect(await isOpen()).toBe(true);
    await type(" --> print");
    await sourceHas("done --> print");
    await type(Key.Escape);
    expect(await isOpen()).toBe(false);
  });

  it("opens again on a click once the caret left it, where Enter starts a line", async () => {
    await clickInto("#editor p");
    expect(await isOpen()).toBe(false);
    const box = (await diagramBox())!;
    await clickAt((box.left + box.right) / 2, (box.top + box.bottom) / 2);
    await browser.waitUntil(isOpen, {
      timeoutMsg: "a click didn't open the diagram",
    });
    // a new line in its source, not its settings
    await type(Key.End);
    await type(Key.Enter);
    await type("  done --> read");
    await expect($("#diagram-popover")).not.toBeExisting();
    await sourceHas("done --> read");
    await type(Key.Escape);
    expect(await isOpen()).toBe(false);
  });

  it("takes a width and a caption from its settings, and an alignment", async () => {
    const width = async () => {
      const box = (await diagramBox())!;
      return box.right - box.left;
    };
    const choose = (value: string) =>
      $(`#diagram-popover [data-row="width"] [data-value="${value}"]`).click();
    await pressShift(Key.Enter);
    await expect($("#diagram-popover")).toBeDisplayed();
    // the whole width first, which "50%" is half of; Fit is the diagram's
    // own size, which may be narrower or wider than half
    await choose("100%");
    let full = 0;
    await browser.waitUntil(
      async () => {
        const now = await width();
        const settled = now === full;
        full = now;
        return settled && now > 0;
      },
      { timeoutMsg: "the diagram didn't take the whole width" },
    );
    await choose("50%");
    await browser.waitUntil(
      async () => Math.abs((await width()) - full / 2) < 2,
      { timeoutMsg: "the diagram didn't take half the width" },
    );
    await $("#diagram-popover-caption").setValue("the plan");
    await type(Key.Escape);
    await expect($("#diagram-popover")).not.toBeExisting();
    await pressMod(Key.Shift, "e");
    await pressMod("s");
    await browser.waitUntil(() =>
      fs.readFileSync(file, "utf8").includes("<!-- /blank:diagram -->"),
    );
    const saved = fs.readFileSync(file, "utf8");
    expect(saved).toContain('<div align="center">');
    expect(saved).toContain(
      '<!-- blank:diagram@1 width="50%" caption="the plan" -->',
    );
    expect(saved).toContain(
      "```mermaid\nflowchart LR\n  idea --> draft --> done --> print\n",
    );
    expect(saved).toMatch(/done --> read\n```/);
  });
});

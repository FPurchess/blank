import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import { pressMod, restartApp } from "../helpers.ts";

// An embed, content of another app, read from a file: the pages show its
// drawing, it is saved as it was, and the block toolbar removes it.

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="120" viewBox="0 0 240 120"><rect width="240" height="120" fill="#d33"/></svg>';

const EMBED = [
  '<!-- blank:embed@1 type="org.example/sketch@1" id="k3x9" alt="A red box" -->',
  '````json\n{"shapes": [1, 2]}\n````',
  `\`\`\`\`svg\n${SVG}\n\`\`\`\``,
  "<!-- /blank:embed -->",
].join("\n\n");

const file = path.join(
  fs.mkdtempSync(path.join(os.tmpdir(), "blank-embeds-")),
  "embeds.md",
);

// the box of the embed on the screen, as the engine laid it out
const embedBox = () =>
  browser.execute(() => {
    const geometry = (
      window as unknown as {
        blankGeometry: {
          blockBoxes: (
            from: number,
            to: number,
          ) => { left: number; top: number; right: number; bottom: number }[];
        };
      }
    ).blankGeometry;
    const figure = document.querySelector("#editor figure.embed");
    if (!figure) return null;
    // the embed comes after the first paragraph, "before" and its tokens
    return geometry.blockBoxes(8, 9)[0] ?? null;
  });

describe("an embed", () => {
  before(async () => {
    fs.writeFileSync(file, `before\n\n${EMBED}\n\nafter\n`);
    await restartApp([file]);
  });

  after(() => fs.rmSync(path.dirname(file), { recursive: true, force: true }));

  it("shows its drawing on the pages", async () => {
    await expect($("#editor figure.embed")).toBeExisting();
    await browser.waitUntil(
      async () => {
        const box = await embedBox();
        return !!box && box.bottom - box.top > 20;
      },
      { timeoutMsg: "the embed's drawing isn't on the pages" },
    );
  });

  it("is saved as it was", async () => {
    await pressMod("s");
    await browser.waitUntil(() =>
      fs.readFileSync(file, "utf8").includes("<!-- /blank:embed -->"),
    );
    expect(fs.readFileSync(file, "utf8")).toContain(
      `before\n\n${EMBED}\n\nafter`,
    );
  });

  it("is removed from its toolbar once selected", async () => {
    const box = (await embedBox())!;
    await browser
      .action("pointer")
      .move({
        x: Math.round((box.left + box.right) / 2),
        y: Math.round((box.top + box.bottom) / 2),
        origin: "viewport",
      })
      .down()
      .up()
      .perform();
    await $('#block-toolbar [data-id="block-remove"]').click();
    await expect($("#editor figure.embed")).not.toBeExisting();
  });
});

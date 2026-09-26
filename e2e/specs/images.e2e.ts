import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $$, expect } from "@wdio/globals";

import { restartApp } from "../helpers.ts";

// a 3x2 PNG
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAMAAAACCAIAAAASFvFNAAAAFUlEQVR4nGM8ISfHwMDAwMDAxAADABMuAQhqwGVhAAAAAElFTkSuQmCC",
  "base64",
);

describe("images", () => {
  let fixtureDir: string;

  before(async () => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-images-"));
    fs.mkdirSync(path.join(fixtureDir, "img"));
    fs.writeFileSync(path.join(fixtureDir, "img", "pixel one.png"), PNG);
    fs.writeFileSync(path.join(fixtureDir, "absolute.png"), PNG);
    const absolute = path.join(fixtureDir, "absolute.png");
    const dataUrl = `data:image/png;base64,${PNG.toString("base64")}`;
    fs.writeFileSync(
      path.join(fixtureDir, "images.md"),
      [
        "# Images",
        "",
        "Relative ![relative](img/pixel%20one.png)",
        "",
        `Absolute ![absolute](${absolute})`,
        "",
        `Inline ![inline](${dataUrl})`,
        "",
      ].join("\n"),
    );

    await restartApp([path.join(fixtureDir, "images.md")]);
  });

  after(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it("shows relative, absolute and data: images", async () => {
    await expect($$(".ProseMirror .image img")).toBeElementsArrayOfSize(3);

    // the images decoded, i.e. the asset protocol served the local files
    await browser.waitUntil(
      () =>
        browser.execute(() =>
          [
            ...document.querySelectorAll<HTMLImageElement>(
              ".ProseMirror .image img",
            ),
          ]
            .map((img) => img.complete && img.naturalWidth === 3)
            .every(Boolean),
        ),
      { timeoutMsg: "not every image loaded" },
    );
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, $$, expect } from "@wdio/globals";

import { Key, pressMod, restartApp, type } from "../helpers.ts";

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

  it("inserts, edits and removes an image with the dialog", async () => {
    const images = () => $$(".ProseMirror .image img");
    await $(".ProseMirror h1").click();
    await type(Key.End);

    await pressMod(Key.Alt, "i");
    await expect($("#image-dialog")).toBeExisting();
    await expect($("#image-dialog-title")).toHaveText("Image");
    await type("img/pixel%20one.png");
    await type(Key.Tab); // Choose file…
    await type(Key.Tab);
    await type("Pixel");
    await type(Key.Enter);

    await expect($("#image-dialog")).not.toBeExisting();
    await expect(images()).toBeElementsArrayOfSize(4);
    const inserted = $(".ProseMirror h1 .image img");
    await expect(inserted).toHaveAttribute("alt", "Pixel");
    await browser.waitUntil(
      () =>
        browser.execute(
          () =>
            document.querySelector<HTMLImageElement>(
              ".ProseMirror h1 .image img",
            )?.naturalWidth === 3,
        ),
      { timeoutMsg: "the inserted image didn't load" },
    );

    // the cursor is right after the new image, so the dialog edits it
    await pressMod(Key.Alt, "i");
    await expect($("#image-dialog-title")).toHaveText("Edit image");
    await expect($("#image-dialog-alt")).toHaveValue("Pixel");
    await $("#image-dialog").$("button=Remove").click();

    await expect($("#image-dialog")).not.toBeExisting();
    await expect(images()).toBeElementsArrayOfSize(3);
    await expect($(".ProseMirror h1")).toHaveText("Images");
  });
});

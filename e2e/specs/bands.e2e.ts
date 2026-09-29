import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, $$, expect } from "@wdio/globals";

import {
  clickText,
  editorText,
  hoverEdge,
  Key,
  pressMod,
  restartApp,
  type,
} from "../helpers.ts";

const strip = () => $("#band-editor");
const tool = (label: string) => strip().$(`button=${label}`);
// what a band says, kept in the edge behind the pages, which show it
const bandText = (band: string, slot: string) =>
  editorText(`#band-${band} .band-line .${slot}`).then((texts) => texts[0]);

describe("header and footer", () => {
  let fixtureDir: string;
  let fixturePath: string;

  before(async () => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-fixture-"));
    fixturePath = path.join(fixtureDir, "report.md");
    fs.writeFileSync(fixturePath, "# report\n\ntext.\n");
    await restartApp([fixturePath]);
  });

  after(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  const saved = (content: string) =>
    browser.waitUntil(() => fs.readFileSync(fixturePath, "utf8") === content, {
      timeoutMsg: `the file has not been saved, it contains: ${fs.readFileSync(fixturePath, "utf8")}`,
    });

  it("adds page numbers from the hint at the bottom edge", async () => {
    await hoverEdge("bottom");
    await $("#band-footer").$("button=# Page numbers").click();

    await expect(strip()).toBeDisplayed();
    await expect(strip().$(".slot.center .chip")).toHaveText("page");
    await tool("Done").click();

    await expect(strip()).not.toExist();
    await expect(bandText("footer", "center")).resolves.toBe("page");
    // where the page ends, the footer shows its number
    await expect($(".page-end .band.footer")).toHaveText("1");
    await pressMod("s");
    await saved(
      '---\npage:\n  footer: {center: "{page}"}\n---\n\n# report\n\ntext.',
    );
  });

  it("writes a header with the title and a typed text", async () => {
    await hoverEdge("top");
    await $("#band-header").$("button=+ Header").click();
    await expect(strip()).toBeDisplayed();

    await strip().$(".slot.left .ProseMirror").click();
    await tool("Title").click();
    await strip().$(".slot.right .ProseMirror").click();
    await type("draft");
    // the page number menu, with its presets as they read
    await tool("# Page number ▾").click();
    await $("#context-menu").$('[data-id="Page {page} of {pages}"]').click();
    // none on the first page
    await tool("First Page ▾").click();
    await $("#context-menu").$('[data-id="first-page:plain"]').click();
    await browser.keys(Key.Escape);

    await expect(strip()).not.toExist();
    await expect(bandText("header", "left")).resolves.toBe("report");
    await pressMod("s");
    await saved(
      '---\npage:\n  footer: {center: "{page}"}\n  header: {left: "{title}", right: "draft Page {page} of {pages}"}\n  first-page: plain\n---\n\n# report\n\ntext.',
    );
  });

  it("undoes a strip's changes in one step", async () => {
    await clickText("text.");
    await pressMod("z");

    await expect($("#band-header .band-line")).not.toExist();
    await pressMod(Key.Shift, "z");
    await expect($("#band-header .band-line")).toExist();
  });

  it("opens a strip from where the page ends", async () => {
    await $(".page-end .band.footer").click();
    await expect(strip()).toBeDisplayed();
    await expect(strip()).toHaveElementClass("footer");
    await browser.keys(Key.Escape);
    await expect(strip()).not.toExist();
  });

  it("opens a strip from the margin of a sheet", async () => {
    await pressMod(Key.Alt, "v");
    await expect($("#page-view")).toHaveElementClass("pages");
    await $(".page-band.header").click();
    await expect(strip()).toBeDisplayed();
    await expect(strip()).toHaveElementClass("header");
    await browser.saveScreenshot(
      path.resolve(import.meta.dirname, "../screenshots/engine-strip.png"),
    );
    await browser.keys(Key.Escape);
    await pressMod(Key.Alt, "v");
    await expect($("#page-view")).toHaveElementClass("page-ends");
  });

  it("opens the strips with the keyboard too, and fades the text", async () => {
    await pressMod(Key.Alt, "f");

    await expect(strip()).toBeDisplayed();
    await expect($("body")).toHaveElementClass("band-editing");
    await browser.keys(Key.Escape);
    await expect($("body")).not.toHaveElementClass("band-editing");
  });

  it("keeps the main text apart from the strip's editors", async () => {
    await pressMod(Key.Alt, "h");
    await expect(strip()).toBeDisplayed();
    await type("x");

    // the slots are ProseMirror editors too; #editor is the text
    await expect(editorText("#editor p")).resolves.toEqual(["text."]);
    await expect($$("#editor")).toBeElementsArrayOfSize(1);
    await expect(strip().$(".slot.center .ProseMirror")).toHaveText("x");
    // left as it was, so closing changes nothing
    await browser.keys(Key.Backspace);
    await browser.keys(Key.Escape);
    await expect(strip()).not.toExist();
  });

  it("gives even pages their own footer, in roman numerals", async () => {
    await pressMod(Key.Alt, "f");
    await tool("Odd & Even Pages").click();
    await expect(strip().$("[role=tab][aria-selected=true]")).toHaveText(
      "Even Pages",
    );
    await tool("# Page number ▾").click();
    await $("#context-menu").$('[data-id="number-style:i"]').click();
    await tool("Done").click();

    await pressMod("s");
    await saved(
      '---\npage:\n  footer: {center: "{page}"}\n  header: {left: "{title}", right: "draft Page {page} of {pages}"}\n  first-page: plain\n  even-pages:\n    footer: {center: "{page}"}\n  number-style: i\n---\n\n# report\n\ntext.',
    );
  });
});

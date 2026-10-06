import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, $$, expect } from "@wdio/globals";

import {
  clickText,
  editorText,
  Key,
  pressMod,
  restartApp,
  type,
  waitForInk,
} from "../helpers.ts";

const strip = () => $("#band-editor");
const tool = (label: string) => strip().$(`button=${label}`);
// the select of what the first page has, and the switch of even pages
const firstPage = () => strip().$("button.select");
const evenPages = () => strip().$("[role=switch]");
// the hint that adds a band, once the pointer is on it
const hint = async (name: string) => {
  const button = $(`button.band-hint[aria-label="${name}"]`);
  await button.moveTo();
  return button;
};
// where an element is in the window
const rect = (selector: string) =>
  browser.execute(
    (selector: string) =>
      document.querySelector(selector)!.getBoundingClientRect().toJSON() as {
        top: number;
        bottom: number;
        left: number;
        right: number;
      },
    selector,
  );

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

  it("adds page numbers from the hint below the last page", async () => {
    // a page that is the last ends in no mark, and without a footer in
    // nothing but the hint to add one
    await expect($(".page-frame")).toBeExisting();
    await expect($(".page-end")).not.toExist();
    await expect($(".page-last-footer")).not.toExist();
    await (await hint("Add a footer")).click();

    await expect(strip()).toBeDisplayed();
    await expect(strip()).toHaveElementClass("footer");
    await tool("Page number").click();
    await $("#context-menu").$('[data-id="{page}"]').click();
    await expect(strip().$(".slot.center .chip")).toHaveText("Page");
    await tool("Done").click();

    await expect(strip()).not.toExist();
    // below the text of the last page, its footer shows its number, and no
    // line where it would end
    await expect($(".page-last-footer")).toHaveText("1");
    await expect($(".page-end")).not.toExist();
    await pressMod("s");
    await saved(
      '---\npage:\n  footer: {center: "{page}"}\n---\n\n# report\n\ntext.',
    );
  });

  it("opens a strip from the footer below the last page", async () => {
    await $(".page-last-footer").click();
    await expect(strip()).toBeDisplayed();
    await expect(strip()).toHaveElementClass("footer");
    await browser.keys(Key.Escape);
    await expect(strip()).not.toExist();
  });

  it("writes a header with the title and a typed text", async () => {
    await pressMod(Key.Alt, "h");
    await expect(strip()).toBeDisplayed();

    await strip().$(".slot.left .ProseMirror").click();
    await tool("Title").click();
    await strip().$(".slot.right .ProseMirror").click();
    await type("draft");
    // the page number menu, with its presets as they read
    await tool("Page number").click();
    await $("#context-menu").$('[data-id="Page {page} of {pages}"]').click();
    // none on the first page
    await firstPage().click();
    await $("#context-menu").$('[data-id="first-page:plain"]').click();
    await expect(firstPage()).toHaveText("None");
    await browser.keys(Key.Escape);

    await expect(strip()).not.toExist();
    // the first page has none, so nothing shows above its text
    await expect($(".page-first-header")).not.toExist();
    await pressMod("s");
    await saved(
      '---\npage:\n  footer: {center: "{page}"}\n  header: {left: "{title}", right: "draft Page {page} of {pages}"}\n  first-page: plain\n---\n\n# report\n\ntext.',
    );
  });

  it("undoes a strip's changes in one step", async () => {
    await clickText("text.");
    await pressMod("z");
    await pressMod("s");
    await saved(
      '---\npage:\n  footer: {center: "{page}"}\n---\n\n# report\n\ntext.',
    );

    await pressMod(Key.Shift, "z");
    await pressMod("s");
    await saved(
      '---\npage:\n  footer: {center: "{page}"}\n  header: {left: "{title}", right: "draft Page {page} of {pages}"}\n  first-page: plain\n---\n\n# report\n\ntext.',
    );
  });

  it("opens a strip from the margin of a sheet", async () => {
    await pressMod(Key.Alt, "v");
    await expect($("#page-view")).toHaveElementClass("pages");
    await $(".page-band.header").doubleClick();
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

  it("puts the strip beside the band's slots, in the view", async () => {
    // beside them, and over neither them nor the bars
    const beside = async () => {
      const view = await rect("#page-view");
      const card = await rect("#band-editor .band-card");
      const slots = await rect("#band-editor .band-slots");
      expect(card.bottom <= slots.top + 1 || card.top >= slots.bottom - 1).toBe(
        true,
      );
      expect(card.top).toBeGreaterThanOrEqual(view.top);
      expect(card.bottom).toBeLessThanOrEqual(view.bottom);
    };
    for (const key of ["f", "h"]) {
      await pressMod(Key.Alt, key);
      await expect(strip()).toBeDisplayed();
      try {
        await beside();
      } finally {
        await browser.keys(Key.Escape);
      }
      await expect(strip()).not.toExist();
    }
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
    await evenPages().click();
    await expect(evenPages()).toHaveAttribute("aria-checked", "true");
    await expect(strip().$("[role=tab][aria-selected=true]")).toHaveText(
      "Even pages",
    );
    await expect(tool("Mirror the odd pages")).toBeDisplayed();
    await tool("Page number").click();
    await $("#context-menu").$('[data-id="number-style:i"]').click();
    await tool("Done").click();

    await pressMod("s");
    await saved(
      '---\npage:\n  footer: {center: "{page}"}\n  header: {left: "{title}", right: "draft Page {page} of {pages}"}\n  first-page: plain\n  even-pages:\n    footer: {center: "{page}"}\n  number-style: i\n---\n\n# report\n\ntext.',
    );
  });

  it("shows the first page's header above its text", async () => {
    const file = path.join(fixtureDir, "header.md");
    fs.writeFileSync(
      file,
      '---\npage:\n  header: {left: "{title}", right: "draft"}\n---\n\n# report\n\ntext.\n',
    );
    await restartApp([file]);
    const header = $(".page-first-header");
    await expect(header).toBeDisplayed();
    await expect(header).toHaveText(expect.stringContaining("report"));
    await expect(header).toHaveText(expect.stringContaining("draft"));
    // above the text of the first page
    const text = await $('.page-frame[data-page="1"]').getLocation("y");
    const top = await header.getLocation("y");
    expect(top).toBeLessThan(text);
    // on the sheet it is painted in the top margin
    await pressMod(Key.Alt, "v");
    await expect($("#page-view")).toHaveElementClass("pages");
    const sheet = await browser.execute(() =>
      document
        .querySelector('.page-frame[data-page="1"]')!
        .getBoundingClientRect()
        .toJSON(),
    );
    // in the header's own strip, not the text's canvas: two short words over
    // the width of the sheet and the height of its margin cover about 0.3 %,
    // and a strip without them nothing
    const headerStrip = await browser.execute(() =>
      document
        .querySelector('.page-frame[data-page="1"] .page-bands.header')!
        .getBoundingClientRect()
        .toJSON(),
    );
    await waitForInk(headerStrip, { layers: ".page-bands.header" }, 0.001);
    await pressMod(Key.Alt, "v");
    await expect($("#page-view")).toHaveElementClass("page-ends");
  });

  it("lines the bands up with the text where pages end", async () => {
    const file = path.join(fixtureDir, "aligned.md");
    fs.writeFileSync(
      file,
      [
        "---",
        "page:",
        "  header: {left: '{title}', right: 'draft'}",
        "  footer: {left: 'left foot', right: 'right foot'}",
        "---",
        "",
        "# report",
        "",
        ...Array.from(
          { length: 40 },
          () =>
            "Writing is thinking on paper, and every line of it ends where the layout says.\n",
        ),
      ].join("\n"),
    );
    await restartApp([file]);
    await expect($(".page-end .band.footer")).toBeExisting();
    const edges = await browser.execute(() => {
      const geometry = window.blankGeometry;
      // where the page's text starts, and its column ends: "page ends"
      // shows as much room beside it on both sides
      const left = geometry.caretBox(geometry.find("Writing"))!.left;
      const frame = document
        .querySelector('.page-frame[data-page="1"]')!
        .getBoundingClientRect();
      const right = frame.right - (left - frame.left);
      // where each slot's text is drawn
      const text = (selector: string) => {
        const slot = document.querySelector(selector)!;
        const range = document.createRange();
        range.selectNodeContents(slot);
        const rect = range.getBoundingClientRect();
        return { left: rect.left, right: rect.right };
      };
      return {
        left,
        right,
        slots: [
          [".page-first-header span:first-child", "left"],
          [".page-end .band.footer span:first-child", "left"],
          [".page-end .band.header span:first-child", "left"],
          [".page-last-footer span:first-child", "left"],
          [".page-first-header span:last-child", "right"],
          [".page-end .band.footer span:last-child", "right"],
          [".page-end .band.header span:last-child", "right"],
          [".page-last-footer span:last-child", "right"],
          // the number of a page whose footer doesn't show it
          [".page-end .line .number", "right"],
        ].map(([selector, side]) => ({
          selector,
          side,
          at: text(selector)[side as "left" | "right"],
        })),
      };
    });
    for (const { selector, side, at } of edges.slots) {
      const edge = side === "left" ? edges.left : edges.right;
      expect([selector, Math.abs(at - edge) <= 1]).toEqual([selector, true]);
    }
  });

  it("opens the footer of page 2 on its margin, and types into it there", async () => {
    const file = path.join(fixtureDir, "second.md");
    fs.writeFileSync(
      file,
      "# report\n\ntext.\n\n<!-- pagebreak -->\n\nmore.\n",
    );
    await restartApp([file]);
    await pressMod(Key.Alt, "v");
    await expect($("#page-view")).toHaveElementClass("pages");
    const margin = $('.page-frame[data-page="2"] .page-band.footer');
    await margin.scrollIntoView({ block: "center" });
    // a click near the margin's left end, away from the hint: the whole
    // margin opens the band
    const { width } = await margin.getSize();
    await browser
      .action("pointer")
      .move({ origin: margin, x: -Math.round(width / 2) + 30, y: 0 })
      .down()
      .up()
      .perform();
    await expect(strip()).toBeDisplayed();
    await expect(strip()).toHaveElementClass("footer");

    await strip().$(".slot.right .ProseMirror").click();
    await type("two");
    // the slot is in page 2's bottom margin
    const sheet = await rect('.page-frame[data-page="2"]');
    const footer = await rect('.page-frame[data-page="2"] .page-band.footer');
    const slot = await rect("#band-editor .slot.right");
    expect(slot.left).toBeGreaterThanOrEqual(sheet.left);
    expect(slot.right).toBeLessThanOrEqual(sheet.right);
    expect(slot.top).toBeGreaterThanOrEqual(footer.top - 8);
    expect(slot.bottom).toBeLessThanOrEqual(sheet.bottom);
    await tool("Done").click();
    await expect(strip()).not.toExist();

    await pressMod("s");
    await browser.waitUntil(
      () =>
        fs
          .readFileSync(file, "utf8")
          .startsWith("---\npage:\n  footer: {right: two}\n---"),
      { timeoutMsg: `not saved: ${fs.readFileSync(file, "utf8")}` },
    );
    await pressMod(Key.Alt, "v");
    await expect($("#page-view")).toHaveElementClass("page-ends");
  });

  it("names the placeholders that come out empty, in both views", async () => {
    // no author, and no heading for a chapter
    const file = path.join(fixtureDir, "unnamed.md");
    fs.writeFileSync(
      file,
      '---\npage:\n  header: {left: "{author} {chapter}"}\n---\n\n',
    );
    await restartApp([file]);
    await expect($("#page-view .page-canvas")).toBeExisting();
    const names = (selector: string) =>
      browser.execute(
        (selector: string) =>
          [...document.querySelectorAll(`${selector} .band-placeholder`)].map(
            (name) => name.textContent,
          ),
        selector,
      );
    // above the text, where the header keeps its room
    const header = $(".page-first-header");
    await expect(header).toBeDisplayed();
    expect(await names(".page-first-header")).toEqual(["Author", "Chapter"]);
    await header.click();
    await expect(strip()).toBeDisplayed();
    await expect(strip()).toHaveElementClass("header");
    await tool("Done").click();
    await expect(strip()).not.toExist();
    // which tells why it shows nothing on the page, and how to set an author
    await expect($("#ui-announcement")).toHaveText(
      expect.stringContaining(
        "The header is empty on this page: no author is set and the document has no chapter heading yet. Add an author to the properties at the top of the file",
      ),
    );
    // and on the sheet, in its top margin
    await pressMod(Key.Alt, "v");
    await expect($("#page-view")).toHaveElementClass("pages");
    await expect($(".page-band-names")).toBeDisplayed();
    expect(await names(".page-band-names")).toEqual(["Author", "Chapter"]);
    const margin = await browser.execute(() => {
      const sheet = document
        .querySelector('.page-frame[data-page="1"]')!
        .getBoundingClientRect();
      const name = document
        .querySelector(".page-band-names")!
        .getBoundingClientRect();
      return { top: name.top - sheet.top, sheet: sheet.height };
    });
    expect(margin.top).toBeGreaterThan(0);
    expect(margin.top).toBeLessThan(margin.sheet * 0.1);
    await browser.saveScreenshot(
      path.resolve(import.meta.dirname, "../screenshots/engine-unnamed.png"),
    );
    await $(".page-band.header").doubleClick();
    await expect(strip()).toBeDisplayed();
    await browser.keys(Key.Escape);
    await expect(strip()).not.toExist();
    await pressMod(Key.Alt, "v");
    await expect($("#page-view")).toHaveElementClass("page-ends");
  });
});

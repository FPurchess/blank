import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { browser, $, expect } from "@wdio/globals";

import { expectActiveTab, Key, pressMod, restartApp } from "../helpers.ts";

// a page turned by /Rotate 90 with a black box on it, and an A5 page, see
// scripts/build-pdf-fixtures.ts
const FIXTURE = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../src-tauri/pdf/fixtures/rotated.pdf",
);

/**
 * the dark pixels of the first page's canvas, which the PDF helper drew
 */
const firstPageInk = () =>
  browser.execute(() => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      "#pdf-view .page-canvas",
    );
    if (!canvas?.width) return 0;
    const { data } = canvas
      .getContext("2d")!
      .getImageData(0, 0, canvas.width, canvas.height);
    let dark = 0;
    for (let at = 0; at < data.length; at += 4) {
      if (data[at + 3] > 200 && data[at] < 100) dark++;
    }
    return dark;
  });

const waitForPages = async () => {
  await expect($("#pdf-view")).toBeExisting();
  await browser.waitUntil(async () => (await firstPageInk()) > 500, {
    timeout: 20_000,
    timeoutMsg: "the PDF's first page wasn't drawn",
  });
};

describe("PDF tabs", () => {
  let dir: string;
  let pdfPath: string;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-pdf-"));
    pdfPath = path.join(dir, "turned.pdf");
    fs.copyFileSync(FIXTURE, pdfPath);
    await restartApp([pdfPath]);
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("opens a PDF in a tab of its own and draws its pages", async () => {
    await expectActiveTab("turned", pdfPath);
    await waitForPages();
    await expect($("#page-view")).not.toBeExisting();
    await expect($("#ui-signatures")).toHaveText("Not signed");
    await expect($("#ui-page-number")).toHaveText(/^Page 1 of 2/);
  });

  it("says why a command of the text doesn't work in it", async () => {
    await expect($("#pdf-view")).toBeFocused();
    await pressMod("b");
    await expect($("#ui-announcement")).toHaveText(
      "Blank can't change the text of a PDF",
    );
  });

  it("zooms its pages with the window's zoom", async () => {
    const width = async () =>
      (await $("#pdf-view .page-sheet").getSize()).width;
    await expect($("#ui-zoom")).toHaveText("Fit");
    const fit = await width();
    // the step after Fit, which depends on the page and the window
    await pressMod("=");
    await expect($("#ui-zoom")).toHaveText(/^\d+%$/);
    await browser.waitUntil(async () => (await width()) > fit, {
      timeoutMsg: "the pages didn't grow",
    });
    // a click on the zoom fits them again
    await $("#ui-zoom").click();
    await expect($("#ui-zoom")).toHaveText("Fit");
  });

  it("greys out in the main menu what isn't for PDFs, saying why", async () => {
    await pressMod("k");
    await expect($("#main-menu")).toExist();
    const save = $('#main-menu [data-id="file.save"]');
    await expect(save).toHaveAttribute("aria-disabled", "true");
    await expect(save).toHaveAttribute(
      "data-tip",
      "Sign the PDF to keep what you placed on it",
    );
    await expect($('#main-menu [data-id="file.print"]')).not.toHaveAttribute(
      "aria-disabled",
    );
    // the search is empty, so Esc closes the menu
    await browser.keys(Key.Escape);
    await expect($("#main-menu")).not.toExist();
  });

  it("places a stamp from the signing toolbar, moves it by keys and undoes it", async () => {
    await $("#pdf-view").click();
    // Alt-F10 goes to the toolbar's first tool; the date needs no signature
    await browser.keys([Key.Alt, Key.F10]);
    await expect($('#signing-toolbar [data-tool="signature"]')).toBeFocused();
    await browser.keys(Key.ArrowRight);
    await browser.keys(Key.ArrowRight);
    await expect($('#signing-toolbar [data-tool="date"]')).toBeFocused();
    await browser.keys(Key.Enter);
    const stamp = $('#pdf-view .pdf-stamp[role="group"]');
    await expect(stamp).toBeFocused();
    await expect(stamp).toHaveAttribute(
      "aria-label",
      "Date on page 1, selected",
    );
    await expect($("#ui-announcement")).toHaveText(
      "Date placed on page 1, use the arrow keys to move it",
    );
    const left = () =>
      browser.execute(() =>
        parseFloat(
          document.querySelector<HTMLElement>(
            '#pdf-view .pdf-stamp[role="group"]',
          )?.style.left ?? "NaN",
        ),
      );
    const placed = await left();
    // 10 pt to the right, then back with undo
    await browser.keys([Key.Shift, Key.ArrowRight]);
    await browser.waitUntil(async () => (await left()) > placed, {
      timeoutMsg: "the stamp didn't move",
    });
    await pressMod("z");
    await browser.waitUntil(async () => (await left()) === placed, {
      timeoutMsg: "undo didn't move the stamp back",
    });
    // and once more takes it off the page, so the tab has nothing unsaved
    await pressMod("z");
    await expect(stamp).not.toExist();
    await expect($("#pdf-view")).toBeFocused();
  });

  it("prints the PDF file itself", async () => {
    await browser.execute(() => {
      window.blankPrintCapture = { sent: [] };
    });
    await $("#pdf-view").click();
    await pressMod("p");
    await expect($("#print")).not.toExist();
    await browser.waitUntil(
      () => browser.execute(() => window.blankPrintCapture!.sent.length > 0),
      { timeoutMsg: "nothing was printed" },
    );
    const sent = await browser.execute(() => window.blankPrintCapture!.sent);
    expect(sent).toEqual([{ sheets: 2, pdf: "%PDF-" }]);
  });

  it("opens it again from its file after a restart", async () => {
    await restartApp();
    await expectActiveTab("turned", pdfPath);
    await waitForPages();
  });
});

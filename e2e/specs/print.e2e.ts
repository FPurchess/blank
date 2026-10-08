import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import { clickInto, Key, pressMod, restartApp, type } from "../helpers.ts";

// Blank's print dialog, up to the system's print dialog, which can't be
// automated: a debug build hands the print PDF to `blankPrintCapture`
// instead, once the test sets it.

const dialog = () => $("#print");
const submit = () => $('#print button[type="submit"]');
const summary = () => $("#print .summary");
const option = (row: string, label: string) =>
  $(`#print [data-row="${row}"]`).$(`button=${label}`);

describe("print", () => {
  let dir: string;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-print-"));
    const file = path.join(dir, "three pages.md");
    fs.writeFileSync(
      file,
      "# one\n\n<!-- pagebreak -->\n\ntwo\n\n<!-- pagebreak -->\n\nthree\n",
    );
    await restartApp([file]);
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("opens with Mod+P, ready to print with Enter", async () => {
    await clickInto("#editor p");
    await pressMod("p");

    await expect(dialog()).toBeDisplayed();
    await expect(submit()).toBeFocused();
    await expect(submit()).toHaveText("Print…");
    await expect(summary()).toHaveText("3 pages");
    await expect($("#print .pager p")).toHaveText("Page 1 of 3");
    // the preview paints the first page
    await expect($("#print .sheet canvas")).toBeExisting();
  });

  it("says when a page typed isn't there, and won't print it", async () => {
    await option("pages", "Custom").click();
    await expect($("#print-custom")).toBeFocused();
    await type("9");
    await browser.keys(Key.Tab);

    await expect($("#print-custom-error")).toHaveText(
      "There is no page 9. This document has 3 pages.",
    );
    await expect($("#print-custom")).toHaveAttribute("aria-invalid", "true");
    await expect(submit()).toBeDisabled();

    await option("pages", "All").click();
    await expect(submit()).toBeEnabled();
  });

  it("prints two pages per sheet", async () => {
    await $("#print button.disclosure").click();
    await option("perSheet", "2").click();

    await expect(summary()).toHaveText("3 pages on 2 sheets");
    await expect($("#print .pager p")).toHaveText("Sheet 1 of 2, pages 1, 2");
  });

  it("offers Save PDF… for a PDF file", async () => {
    await option("destination", "PDF file").click();
    await expect(submit()).toHaveText("Save PDF…");
    await expect($("#print-copies")).not.toExist();

    await option("destination", "Printer").click();
    await expect(submit()).toHaveText("Print…");
  });

  it("hands the sheets to the system's print dialog", async () => {
    await browser.execute(() => {
      window.blankPrintCapture = { sent: [] };
    });

    await browser.keys(Key.Enter);

    await expect(dialog()).not.toExist();
    await browser.waitUntil(
      () => browser.execute(() => window.blankPrintCapture!.sent.length > 0),
      { timeoutMsg: "nothing was printed" },
    );
    const sent = await browser.execute(() => window.blankPrintCapture!.sent);
    expect(sent).toEqual([{ sheets: 2, pdf: "%PDF-" }]);
  });

  it("remembers pages per sheet", async () => {
    await pressMod("p");
    await expect(dialog()).toBeDisplayed();
    await expect(summary()).toHaveText("3 pages on 2 sheets");
    await browser.keys(Key.Escape);
    await expect(dialog()).not.toExist();
  });
});

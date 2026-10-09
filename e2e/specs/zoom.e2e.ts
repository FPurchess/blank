import { $, browser, expect } from "@wdio/globals";

import { focusEditor, Key, pressMod } from "../helpers.ts";

// The zoom of the pages: the status bar and the keys make the sheets wider
// and narrower, and the zoom between − and + fits them again

const sheetWidth = () =>
  browser.execute(
    () =>
      document.querySelector(".page-sheet")?.getBoundingClientRect().width ?? 0,
  );

describe("zoom", () => {
  before(async () => {
    await focusEditor();
    // the sheets show in "pages"
    if (!(await $("#page-view.pages").isExisting()))
      await pressMod(Key.Alt, "v");
    await expect($(".page-sheet")).toExist();
  });

  after(async () => {
    await $("#ui-zoom").click();
    await pressMod(Key.Alt, "v");
  });

  it("zooms in and out from the status bar, and fits again", async () => {
    await expect($("#ui-zoom")).toHaveText("Fit");
    const fit = await sheetWidth();
    await $("#ui-zoom-in").click();
    await browser.waitUntil(async () => (await sheetWidth()) > fit);
    await expect($("#ui-zoom")).not.toHaveText("Fit");
    await $("#ui-zoom").click();
    await browser.waitUntil(async () => (await sheetWidth()) === fit);
    await $("#ui-zoom-out").click();
    await browser.waitUntil(async () => (await sheetWidth()) < fit);
    await $("#ui-zoom").click();
  });

  it("zooms with its keys", async () => {
    const fit = await sheetWidth();
    await focusEditor();
    await pressMod("=");
    await browser.waitUntil(async () => (await sheetWidth()) > fit);
    await pressMod("-");
    await pressMod("-");
    await browser.waitUntil(async () => (await sheetWidth()) < fit);
  });
});

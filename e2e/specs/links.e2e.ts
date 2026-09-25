import { $, browser, expect } from "@wdio/globals";

import { focusEditor, Key, pressMod, type } from "../helpers.ts";

const dialog = () => $("#link-dialog");

// WebDriver reads href as resolved URL, so the URLs carry a path to stay as typed
const BLANK = "https://blank.app/docs";
const DOCS = "https://docs.blank.app/start";

// Home and End don't move the cursor via WebKitWebDriver, arrow keys do
const press = async (key: string, times: number) => {
  for (let i = 0; i < times; i++) await browser.keys(key);
};

describe("links", () => {
  before(async () => {
    await focusEditor();
    await pressMod("n");
  });

  it("links the selected text via Mod+K", async () => {
    await type("Blank");
    await browser.keys([Key.Shift, Key.Home]);

    await pressMod("k");
    await expect(dialog()).toBeExisting();
    await expect($("#link-dialog-text")).toHaveValue("Blank");
    // the URL is selected, so typing replaces a URL prefilled from the clipboard
    await type(BLANK);
    await type(Key.Enter);

    await expect(dialog()).not.toBeExisting();
    await expect($(".ProseMirror a")).toHaveAttribute("href", BLANK);
    await expect($(".ProseMirror a")).toHaveText("Blank");
  });

  it("returns the focus to the editor", async () => {
    await type(" rocks");

    await expect($(".ProseMirror p")).toHaveText("Blank rocks");
  });

  it("cancels the dialog on Escape", async () => {
    await pressMod("k");
    await expect(dialog()).toBeExisting();

    await type(Key.Escape);

    await expect(dialog()).not.toBeExisting();
    await type("!");
    await expect($(".ProseMirror p")).toHaveText("Blank rocks!");
  });

  it("edits the link at the cursor and converts it to text", async () => {
    // to the end of the link, before " rocks!"
    await press(Key.ArrowLeft, 7);

    await pressMod("k");
    await expect($("#link-dialog-url")).toHaveValue(BLANK);
    await expect($("#link-dialog-text")).toHaveValue("Blank");
    // URL → Link Text → Save → Convert to Text
    await type(Key.Tab);
    await type(Key.Tab);
    await type(Key.Tab);
    await type(Key.Enter);

    await expect(dialog()).not.toBeExisting();
    await expect($(".ProseMirror a")).not.toBeExisting();
    await expect($(".ProseMirror p")).toHaveText("Blank rocks!");
  });

  it("links markdown typed as [title](url)", async () => {
    await press(Key.ArrowRight, 7);
    await type(Key.Enter);
    await type(`[Docs](${DOCS}) `);

    await expect($(".ProseMirror a")).toHaveAttribute("href", DOCS);
    await expect($(".ProseMirror a")).toHaveText("Docs");
  });
});

import { browser, $, expect } from "@wdio/globals";

import { focusEditor, Key, pressMod, restartApp, type } from "../helpers.ts";

describe("persistence", () => {
  it("restores the document and theme after a restart", async () => {
    await focusEditor();
    await pressMod("n");
    await type("Remember me 4711");
    await pressMod(Key.Alt, "t");

    await expect($(".ProseMirror p")).toHaveText("Remember me 4711");
    await expect($("body")).toHaveAttribute("data-theme", "dark");

    // the document is written to storage debounced by 1000ms, see src/storage.ts
    await browser.pause(2000);
    await restartApp();

    await expect($(".ProseMirror p")).toHaveText("Remember me 4711");
    await expect($("#ui-top")).toHaveText("» Untitled");
    await expect($("body")).toHaveAttribute("data-theme", "dark");
  });
});

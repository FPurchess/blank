import { browser, $, expect } from "@wdio/globals";

import { focusEditor, Key, pressMod, restartApp, type } from "../helpers.ts";

describe("persistence", () => {
  it("restores the document, theme and language after a restart", async () => {
    await focusEditor();
    await pressMod("n");
    await type("Remember me 4711");
    await pressMod(Key.Alt, "t");
    await pressMod(Key.Alt, "l");
    await type("fr");
    await type(Key.Enter);

    await expect($(".ProseMirror p")).toHaveText("Remember me 4711");
    await expect($("body")).toHaveAttribute("data-theme", "dark");

    // the document is written to storage at most 1000ms after a change, see src/storage.ts
    await browser.pause(2000);
    await restartApp();

    await expect($(".ProseMirror p")).toHaveText("Remember me 4711");
    await expect($("#ui-top")).toHaveText("» Untitled");
    await expect($("body")).toHaveAttribute("data-theme", "dark");
    await expect($("#ui-language")).toHaveText("FR");
  });

  it("keeps what was typed until a second before the restart", async () => {
    await focusEditor();
    await pressMod("n");

    // type numbers without a pause for about 3 seconds
    const typed: { word: string; at: number }[] = [];
    const start = Date.now();
    for (let i = 100; Date.now() - start < 3000; i++) {
      await type(`${i} `);
      typed.push({ word: String(i), at: Date.now() });
    }
    const restartAt = Date.now();
    await restartApp();

    const restored = (await $(".ProseMirror p").getText()).trim().split(/\s+/);
    const expected = typed
      .filter(({ at }) => at < restartAt - 1300)
      .map(({ word }) => word);
    expect(expected.length).toBeGreaterThan(0);
    expect(restored.slice(0, expected.length)).toEqual(expected);
  });
});

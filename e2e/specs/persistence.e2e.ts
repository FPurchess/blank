import { browser, $, expect } from "@wdio/globals";

import {
  editorText,
  expectActiveTab,
  expectEditorText,
  focusEditor,
  Key,
  pressMod,
  restartApp,
  type,
} from "../helpers.ts";

describe("persistence", () => {
  it("restores the document, theme and language after a restart", async () => {
    await focusEditor();
    await pressMod("n");
    await type("Remember me 4711");
    await pressMod(Key.Alt, "t");
    await pressMod(Key.Alt, "l");
    await type("fr");
    await type(Key.Enter);

    await expectEditorText("#editor p", "Remember me 4711");
    await expect($("body")).toHaveAttribute("data-theme", "dark");

    // the document is written to storage at most 1000ms after a change, see src/storage.ts
    await browser.pause(2000);
    await restartApp();

    await expectEditorText("#editor p", "Remember me 4711");
    await expectActiveTab("Untitled");
    await expect($("body")).toHaveAttribute("data-theme", "dark");
    await expect($("#ui-language")).toHaveText("FR");
  });

  it("keeps what was typed until a second before a crash", async () => {
    await focusEditor();
    await pressMod("n");

    // type numbers without a pause for about 3 seconds
    const typed: { word: string; at: number }[] = [];
    const start = Date.now();
    for (let i = 100; Date.now() - start < 3000; i++) {
      await type(`${i} `);
      typed.push({ word: String(i), at: Date.now() });
    }
    // without the store a closing window makes: what Blank stored while it
    // was typed, at most a second after a change (maxWait in src/storage.ts)
    const restartAt = Date.now();
    await restartApp([], { crash: true });

    const restored = (await editorText("#editor p"))[0].trim().split(/\s+/);
    // a second for the store, and one for its timer and the write, which a
    // busy machine can make late
    const expected = typed
      .filter(({ at }) => at < restartAt - 2000)
      .map(({ word }) => word);
    expect(expected.length).toBeGreaterThan(0);
    expect(restored.slice(0, expected.length)).toEqual(expected);
  });
});

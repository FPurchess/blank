import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { $, $$, browser, expect } from "@wdio/globals";

import {
  appConfigDir,
  editorText,
  expectEditorText,
  focusEditor,
  Key,
  onlyNewTab,
  pressMod,
  restartApp,
  type,
} from "../helpers.ts";

const dialog = () => $("#settings-dialog");
const panel = () => $("#settings-panel");
const row = (name: string) => $(`#settings-panel [data-row="${name}"]`);
const blankJson = () =>
  JSON.parse(
    fs.readFileSync(path.join(appConfigDir(), "blank.json"), "utf8"),
  ) as Record<string, Record<string, unknown>>;

const openSettings = async (section?: string) => {
  await focusEditor();
  await pressMod(",");
  await dialog().waitForDisplayed();
  if (section) {
    await $(`#settings-tab-${section}`).click();
    await expect(panel()).toHaveAttribute("data-section", section);
  }
};
const closeSettings = async () => {
  await $("#settings-dialog .dialog-foot button[type=submit]").click();
  await dialog().waitForExist({ reverse: true });
};
const opacityOf = (selector: string) =>
  browser.execute(
    (selector) => getComputedStyle(document.querySelector(selector)!).opacity,
    selector,
  );

describe("settings", () => {
  it("opens with Mod-, and keeps the theme it chose", async () => {
    await openSettings();
    await expect($("#settings-tab-appearance")).toBeFocused();

    await $('.theme-card[data-value="dark"]').click();
    await expect($("body")).toHaveAttribute("data-theme", "dark");
    await closeSettings();

    await restartApp();
    await expect($("body")).toHaveAttribute("data-theme", "dark");

    await openSettings();
    await $('.theme-card[data-value="light"]').click();
    await closeSettings();
  });

  it("turns dashes off at once, in blank.json", async () => {
    await onlyNewTab();
    await openSettings("writing");
    await row("autocorrect-dashes").$("[role=switch]").click();
    await expect(row("autocorrect-dashes").$("[role=switch]")).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await closeSettings();

    await focusEditor();
    await type("a -- b ");
    // autocorrect capitalizes the sentence, but leaves the dashes
    await expectEditorText("#editor p", "A -- b");
    expect(blankJson().autocorrect).toEqual({ dashes: false });

    await openSettings("writing");
    await row("autocorrect-dashes").$("[role=switch]").click();
    await closeSettings();
  });

  it("records a new key for Save, which saves at once", async () => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "blank-settings-")),
      "keys.md",
    );
    fs.writeFileSync(file, "start\n");
    await restartApp([file]);

    await openSettings("shortcuts");
    const save = $('.shortcut[data-command="file.save"] .shortcut-key');
    await save.click();
    await expect(save).toHaveText("Press keys…");
    // Ctrl+Alt+B inserts a block: the first press asks, the second moves it
    await pressMod(Key.Alt, "b");
    await expect($('.shortcut[data-command="file.save"] .message')).toHaveText(
      expect.stringContaining("is used by Insert a block"),
    );
    await pressMod(Key.Alt, "b");
    await expect(save).toHaveText("Ctrl+Alt+B");
    await expect(
      $('.shortcut[data-command="insert.block"] .shortcut-key'),
    ).toHaveText("None");
    await closeSettings();

    await focusEditor();
    await type("saved ");
    await pressMod(Key.Alt, "b");
    await browser.waitUntil(
      () => fs.readFileSync(file, "utf8").includes("saved"),
      { timeoutMsg: "Ctrl+Alt+B didn't save the file" },
    );
    expect(blankJson().keymap).toEqual({
      "file.save": "Mod-Alt-b",
      "insert.block": "",
    });

    await openSettings("shortcuts");
    await $("button.reset-all").click();
    await $(".shortcuts-top.confirm button.reset").click();
    await expect(save).toHaveText("Ctrl+S");
    await closeSettings();
  });

  it("adds a word to your dictionary, whose underline goes", async () => {
    await onlyNewTab();
    await openSettings("spelling");
    await row("spellcheck").$("[role=switch]").click();
    // the system language may be another one: English, from the menu
    await $("#settings-language").click();
    await $(
      '//*[@id="context-menu"]//*[@role="menuitemradio"][.//*[text()="English"]]',
    ).click();
    await expect($("#settings-language")).toHaveText(
      expect.stringContaining("English"),
    );
    await closeSettings();

    await focusEditor();
    await type("a blankword here ");
    await browser.waitUntil(
      async () =>
        (await editorText("#editor .spelling-error")).includes("blankword"),
      { timeoutMsg: "blankword isn't underlined" },
    );

    await openSettings("spelling");
    await row("dictionary").$("button").click();
    await expect($("#settings-dictionary-add")).toBeFocused();
    await type("blankword");
    await type(Key.Enter);
    await expect($("#settings-dictionary-list")).toHaveText(
      expect.stringContaining("blankword"),
    );
    await closeSettings();
    await browser.waitUntil(
      async () => (await $$("#editor .spelling-error").length) === 0,
      { timeoutMsg: "blankword is still underlined" },
    );
  });

  it("fades the controls in focus mode and brings them back", async () => {
    await onlyNewTab();
    await focusEditor();
    await pressMod(Key.Shift, "f");
    await expect($("#ui-focus-mode")).toHaveAttribute("aria-pressed", "true");

    await type("the controls fade ");
    await browser.waitUntil(async () => (await opacityOf("#ui-top")) === "0", {
      timeoutMsg: "the top area didn't fade",
    });
    expect(await opacityOf("#ui-bottom")).toBe("0");
    // where the bars were, the window has the color around the pages
    const [behind, around] = await browser.execute(() => [
      getComputedStyle(document.body).backgroundColor,
      getComputedStyle(document.querySelector("#page-view")!).backgroundColor,
    ]);
    expect(behind).toBe(around);

    await browser
      .action("pointer")
      .move({ x: 300, y: 300, origin: "viewport" })
      .move({ x: 340, y: 340, origin: "viewport" })
      .perform();
    await browser.waitUntil(async () => (await opacityOf("#ui-top")) === "1", {
      timeoutMsg: "the top area didn't come back",
    });

    await type(Key.Escape);
    await expect($("#ui-focus-mode")).toHaveAttribute("aria-pressed", "false");
  });
});

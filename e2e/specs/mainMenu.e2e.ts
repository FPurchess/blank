import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { $, browser, expect } from "@wdio/globals";

import { focusEditor, Key, pressMod, restartApp, type } from "../helpers.ts";

// The main menu behind the logo and Mod-K: its search runs a command, its
// rows switch the view and the theme, and Open recent lists the files

const search = () => $("#main-menu input");
const isOpen = () => $("#main-menu").isExisting();

describe("main menu", () => {
  let dir: string;
  let file: string;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-menu-"));
    file = path.join(dir, "recent notes.md");
    fs.writeFileSync(file, "# Recent notes\n\nSome text.\n");
    // opened from the command line, so it's a recent file
    await restartApp([file]);
  });

  after(() => fs.rmSync(dir, { recursive: true, force: true }));

  afterEach(async () => {
    while (await isOpen()) {
      await type(Key.Escape);
      await browser.pause(100);
    }
  });

  it("opens with Mod-K and runs what its search found", async () => {
    await focusEditor();
    const view = await $("#page-view").getAttribute("class");
    await pressMod("k");
    await expect(search()).toBeFocused();
    await type("pages");
    await expect($("#context-menu [role=option]")).toHaveAttribute(
      "data-id",
      "view.pages",
    );
    await type(Key.Enter);
    await expect($("#main-menu")).not.toExist();
    await expect($("#page-view")).not.toHaveAttribute("class", view!);
  });

  it("opens from the logo, and a swatch changes the theme", async () => {
    await $(".logo-button").click();
    await expect(search()).toBeFocused();
    await $('#context-menu [data-id="theme:dark"]').click();
    await expect($("body")).toHaveAttribute("data-theme", "dark");
    // it stays open to show the change
    await expect($("#main-menu")).toExist();
    await $('#context-menu [data-id="theme:light"]').click();
    await expect($("body")).toHaveAttribute("data-theme", "light");
  });

  it("lists the file opened from the command line under Open recent", async () => {
    await $(".logo-button").click();
    await $('#context-menu [data-id="file.recent"]').click();
    await expect($(".submenu")).toHaveText(
      expect.stringContaining("recent notes.md"),
    );
  });
});

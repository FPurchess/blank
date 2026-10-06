import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, expect } from "@wdio/globals";

import {
  clickInto,
  expectEditorText,
  Key,
  pressMod,
  pressShift,
  restartApp,
  type,
} from "../helpers.ts";

// Enter, Backspace and Tab in a list and in text, as they reach the file:
// Tab takes an item in, Enter on an empty one takes it out and ends the
// list, Backspace on an empty one deletes it, and Tab in text is a tab.

describe("lists and tabs", () => {
  let dir: string;
  let file: string;

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-lists-"));
    file = path.join(dir, "lists.md");
    fs.writeFileSync(file, "# Lists\n\nstart\n");
    // a file passed on the command line saves with Mod-s, without a dialog
    await restartApp([file]);
    await clickInto("#editor > p", -1);
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("takes items in and out with Tab and Shift-Tab", async () => {
    await type(Key.Enter);
    await type("- apples");
    await type(Key.Enter);
    await type(Key.Tab);
    await type("green");
    // out a level with Shift-Tab, then a new item, which Backspace deletes
    await type(Key.Enter);
    await pressShift(Key.Tab);
    await type("pears");
    await type(Key.Enter);
    await type(Key.Backspace);
    // out of the list
    await type(Key.Enter);
    await type(Key.Enter);
    await type("after");

    await expectEditorText("#editor > ul > li > ul > li", "green");
    await expectEditorText("#editor > ul > li", "pears", 1);
    await expectEditorText("#editor > p:last-child", "after");
  });

  it("puts a tab in text and keeps the focus in it", async () => {
    await type(Key.Home);
    await type(Key.Tab);

    await expectEditorText("#editor > p:last-child", /^\tafter$/);
    const inEditor = await browser.execute(
      () => document.activeElement?.closest("#editor") !== null,
    );
    expect(inEditor).toBe(true);
  });

  it("saves the list and the tab", async () => {
    await pressMod("s");

    // tight or loose, with blank lines between the items
    const expected =
      /[-*+] apples\n\n? {2}[-*+] green\n\n?[-*+] pears\n\n&#9;after\n?$/;
    await browser.waitUntil(
      () => expected.test(fs.readFileSync(file, "utf8")),
      {
        timeoutMsg: `the list wasn't saved: ${fs.readFileSync(file, "utf8")}`,
      },
    );
  });

  it("reads the tab back", async () => {
    await restartApp([file]);

    await expectEditorText("#editor > p:last-child", /^\tafter$/);
  });

  it("leaves nested lists with Enter twice", async () => {
    await clickInto("#editor > p", -1);
    await type(Key.Enter);
    await type("- a");
    await type(Key.Enter);
    await type(Key.Tab);
    await type("b");
    await type(Key.Enter);
    await type(Key.Tab);
    await type("c");
    await type(Key.Enter);
    await type(Key.Enter);
    await type("out");

    await expectEditorText("#editor > ul:last-of-type li li li", "c");
    await expectEditorText("#editor > p:last-child", "out");
  });
});

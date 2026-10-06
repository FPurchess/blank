import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, expect } from "@wdio/globals";

import {
  activeTab,
  answerUnsaved,
  clickTab,
  expectActiveTab,
  expectEditorText,
  focusEditor,
  Key,
  pressMod,
  restartApp,
  secondStart,
  tabLabels,
  type,
} from "../helpers.ts";

// the tabs: several documents open at once, kept across restarts, and the
// files a second start of Blank hands over
describe("tabs", () => {
  let dir: string;
  const file = (name: string, text: string) => {
    const at = path.join(dir, name);
    fs.writeFileSync(at, text);
    return at;
  };

  before(async () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-tabs-"));
    await restartApp([file("one.md", "# One\n"), file("two.md", "# Two\n")]);
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("opens the files Blank is started with as tabs", async () => {
    expect(await tabLabels()).toEqual(["Welcome", "one", "two"]);
    await expectActiveTab("two");
    await expectEditorText("#editor h1", "Two");
  });

  it("goes from tab to tab with Ctrl+Tab and Ctrl+Page Up", async () => {
    await focusEditor();
    await browser.keys([Key.Ctrl, Key.Tab]);
    await expectActiveTab("Welcome");

    await browser.keys([Key.Ctrl, Key.PageUp]);
    await expectActiveTab("two");
    await expectEditorText("#editor h1", "Two");
  });

  it("asks before it closes a tab with changes, and drops them on Don't save", async () => {
    await clickTab("one");
    await expectActiveTab("one");
    await focusEditor();
    await type(Key.End);
    await type(" edited");
    await expect(activeTab()).toHaveElementClass("unsaved");

    await pressMod("w");
    await answerUnsaved("Don't save");

    expect(await tabLabels()).toEqual(["Welcome", "two"]);
    expect(fs.readFileSync(path.join(dir, "one.md"), "utf8")).toBe("# One\n");
    // the text of the tab shown now has the focus, so typing goes on there
    await expect($("#editor")).toBeFocused();
  });

  it("reopens the tab closed last", async () => {
    await pressMod(Key.Shift, "t");

    await expectActiveTab("one");
    await expectEditorText("#editor h1", "One");
  });

  it("keeps every tab and what wasn't saved across a restart", async () => {
    await pressMod("n");
    await type("not saved yet");

    // which stores what is pending, as closing the window does
    await restartApp();

    expect(await tabLabels()).toEqual(["Welcome", "two", "one", "Untitled"]);
    await expectActiveTab("Untitled");
    // autocorrect starts the sentence with a capital
    await expectEditorText("#editor", "Not saved yet");
    await expect(activeTab()).toHaveElementClass("unsaved");
  });

  it("opens the files of a second start in the running Blank", async () => {
    const three = file("three.md", "# Three\n");

    expect(secondStart(["three.md"], dir)).toBe(0);

    await expectActiveTab("three", three);
    await expectEditorText("#editor h1", "Three");
  });

  it("only shows the tab of a file that is open already", async () => {
    const before = await tabLabels();

    expect(secondStart([path.join(dir, "one.md")])).toBe(0);

    await expectActiveTab("one");
    expect(await tabLabels()).toEqual(before);
  });
});

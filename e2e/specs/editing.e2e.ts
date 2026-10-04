import { $, expect } from "@wdio/globals";

import {
  expectEditorText,
  focusEditor,
  Key,
  pressMod,
  type,
} from "../helpers.ts";

describe("editing", () => {
  before(async () => {
    await focusEditor();
  });

  it("creates a new file", async () => {
    await pressMod("n");

    await expectEditorText("#editor", "");
    await expect($("#ui-title")).toHaveText("» Untitled");
    await expect($("#ui-stats")).toHaveText("0 words");
  });

  it("counts the words while typing", async () => {
    await type("Hello world");

    await expectEditorText("#editor p", "Hello world");
    await expect($("#ui-stats")).toHaveText("2 words");
  });

  it("autocompletes arrows", async () => {
    await type(" --> ");

    await expectEditorText("#editor p", "Hello world →");
  });

  it("autocompletes arrows in the middle of the text", async () => {
    await type(Key.Enter);
    await type("The end");
    for (let i = 0; i < 3; i++) await type(Key.ArrowLeft);
    await type("--> ");

    await expectEditorText("#editor p:last-child", "The → end");
    await type(Key.End);
  });

  it("autocompletes headings", async () => {
    await type(Key.Enter);
    await type("## Heading");

    await expectEditorText("#editor h2", "Heading");
  });

  it("undoes a block shortcut with a single undo", async () => {
    await type(Key.Enter);
    await type("- ");
    await expect($("#editor ul")).toExist();

    await pressMod("z");

    await expect($("#editor ul")).not.toExist();
    await expectEditorText("#editor p:last-child", "-");
    await expectEditorText("#editor h2", "Heading");
  });

  it("toggles bold via keyboard shortcut", async () => {
    await type(Key.Enter);
    await pressMod("b");
    await type("bold");

    await expectEditorText("#editor strong", "bold");
  });

  it("chooses the language via keyboard shortcut", async () => {
    await pressMod(Key.Alt, "l");
    await type("tr");
    await type(Key.Enter);

    await expect($("#ui-language")).toHaveText("TR*");
  });

  it("cycles through themes via keyboard shortcut", async () => {
    await expect($("body")).toHaveAttribute("data-theme", "light");

    await pressMod(Key.Alt, "t");

    await expect($("body")).toHaveAttribute("data-theme", "dark");
  });
});

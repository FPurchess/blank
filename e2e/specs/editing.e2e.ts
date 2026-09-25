import { $, expect } from "@wdio/globals";

import { focusEditor, Key, pressMod, type } from "../helpers.ts";

describe("editing", () => {
  before(async () => {
    await focusEditor();
  });

  it("creates a new file", async () => {
    await pressMod("n");

    await expect($(".ProseMirror")).toHaveText("");
    await expect($("#ui-top")).toHaveText("» Untitled");
    await expect($("#ui-stats")).toHaveText("0 words 0 chars");
  });

  it("counts words and chars while typing", async () => {
    await type("Hello world");

    await expect($(".ProseMirror p")).toHaveText("Hello world");
    await expect($("#ui-stats")).toHaveText("2 words 11 chars");
  });

  it("autocompletes arrows", async () => {
    await type(" --> ");

    await expect($(".ProseMirror p")).toHaveText("Hello world →");
  });

  it("autocompletes arrows in the middle of the text", async () => {
    await type(Key.Enter);
    await type("The end");
    for (let i = 0; i < 3; i++) await type(Key.ArrowLeft);
    await type("--> ");

    await expect($(".ProseMirror p:last-child")).toHaveText("The → end");
    await type(Key.End);
  });

  it("autocompletes headings", async () => {
    await type(Key.Enter);
    await type("## Heading");

    await expect($(".ProseMirror h2")).toHaveText("Heading");
  });

  it("toggles bold via keyboard shortcut", async () => {
    await type(Key.Enter);
    await pressMod("b");
    await type("bold");

    await expect($(".ProseMirror strong")).toHaveText("bold");
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

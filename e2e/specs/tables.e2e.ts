import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, $$, expect } from "@wdio/globals";

import { Key, pressMod, restartApp, type } from "../helpers.ts";

/**
 * waits until the file at `filePath` contains `text` and returns its content
 */
const waitForSaved = async (filePath: string, text: string) => {
  await browser.waitUntil(
    () => fs.readFileSync(filePath, "utf8").includes(text),
    {
      timeoutMsg: `${filePath} doesn't contain ${JSON.stringify(text)}: ${fs.readFileSync(filePath, "utf8")}`,
    },
  );
  return fs.readFileSync(filePath, "utf8");
};

describe("tables", () => {
  let dir: string;
  let file: string;

  const open = async (content: string) => {
    fs.writeFileSync(file, content);
    await restartApp([file]);
  };

  before(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "blank-e2e-tables-"));
    file = path.join(dir, "tables.md");
  });

  after(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("inserts a table with the picker and fills it with Tab", async () => {
    await open("# Stock\n\nwhat we have:\n");
    await $(".ProseMirror p").click();
    await type(Key.End);
    await type(Key.Enter);

    await pressMod("t");
    await expect($("#table-picker")).toBeDisplayed();
    await expect($("#table-picker .size")).toHaveText("3 × 3");
    await type(Key.ArrowLeft);
    await type(Key.ArrowUp);
    await type(Key.Enter);
    await expect($("#table-picker")).not.toBeExisting();

    // a 2 × 2 table: the header row and one row, then Tab adds another
    for (const text of ["fruit", "qty", "apples", "3", "pears", "12"]) {
      await type(text);
      await type(Key.Tab);
    }
    await expect($$(".ProseMirror tr")).toBeElementsArrayOfSize(4);

    await pressMod("s");
    const saved = await waitForSaved(file, "| pears");
    expect(saved).toContain(
      [
        "| fruit  | qty |",
        "| ------ | --- |",
        "| apples | 3   |",
        "| pears  | 12  |",
        "|        |     |",
      ].join("\n"),
    );
  });

  it("turns a typed header into a table", async () => {
    await open("start\n");
    await $(".ProseMirror p").click();
    await type(Key.End);
    await type(Key.Enter);
    await type("| name | qty |");
    await type(Key.Enter);

    await expect($$(".ProseMirror th")).toBeElementsArrayOfSize(2);
    await type("x");
    await expect($$(".ProseMirror td")[0]).toHaveText("x");
  });

  it("saves a line break in a cell as <br>", async () => {
    await open("| a |\n| - |\n| b |\n");
    await $(".ProseMirror td").click();
    await type(Key.End);
    await type(Key.Enter);
    await type("c");
    await pressMod("s");

    const saved = await waitForSaved(file, "<br>");
    expect(saved).toBe("| a      |\n| ------ |\n| b<br>c |");
  });

  it("keeps a table with merged cells as HTML", async () => {
    const html = [
      "<table>",
      "  <thead>",
      "    <tr>",
      '      <th scope="col" colspan="2">q1</th>',
      "    </tr>",
      "  </thead>",
      "  <tbody>",
      "    <tr>",
      "      <td>jan</td>",
      "      <td>feb</td>",
      "    </tr>",
      "  </tbody>",
      "</table>",
    ].join("\n");
    await open(`intro\n\n${html}\n`);
    await expect($(".ProseMirror th")).toHaveAttribute("colspan", "2");

    await $(".ProseMirror p").click();
    await type(Key.End);
    await type("!");
    await pressMod("s");
    const saved = await waitForSaved(file, "intro!");
    expect(saved).toBe(`intro!\n\n${html}`);
  });

  it("leaves a table at the end of the document with the arrow keys", async () => {
    await open("intro\n\n| a |\n| - |\n| b |\n");
    await $(".ProseMirror td").click();
    await type(Key.End);
    await type(Key.ArrowDown);
    await type("after");
    await pressMod("s");

    const saved = await waitForSaved(file, "after");
    expect(saved).toBe("intro\n\n| a   |\n| --- |\n| b   |\n\nafter");
  });
});

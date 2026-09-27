import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { browser, $, $$, expect } from "@wdio/globals";

import { clickInto, Key, pressMod, restartApp, type } from "../helpers.ts";

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
    await clickInto(".ProseMirror p");
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
    await clickInto(".ProseMirror p");
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
    await clickInto(".ProseMirror td");
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

    await clickInto(".ProseMirror p");
    await type(Key.End);
    await type("!");
    await pressMod("s");
    const saved = await waitForSaved(file, "intro!");
    expect(saved).toBe(`intro!\n\n${html}`);
  });

  it("leaves a table at the end of the document with the arrow keys", async () => {
    await open("intro\n\n| a |\n| - |\n| b |\n");
    await clickInto(".ProseMirror td");
    await type(Key.End);
    await type(Key.ArrowDown);
    await type("after");
    await pressMod("s");

    const saved = await waitForSaved(file, "after");
    expect(saved).toBe("intro\n\n| a   |\n| --- |\n| b   |\n\nafter");
  });

  it("changes a table in table mode", async () => {
    await open("| name | qty |\n| - | - |\n| pear | 12 |\n| kiwi | 3 |\n");
    await clickInto(".ProseMirror td", 1);

    await pressMod("t");
    await expect($("#table-toolbar")).toHaveElementClass("keys");
    await type(Key.ArrowDown);
    await type("s");
    await type("r");
    await expect($("#ui-announcement")).toHaveText("A column aligned right");
    await type(Key.Escape);
    await expect($("#table-toolbar")).not.toHaveElementClass("keys");

    await pressMod("s");
    const saved = await waitForSaved(file, "--:");
    expect(saved).toBe(
      [
        "| name | qty |",
        "| ---- | --: |",
        "| kiwi |   3 |",
        "| pear |  12 |",
        "|      |     |",
      ].join("\n"),
    );
  });

  it("writes a caption from table mode", async () => {
    await open("| a |\n| - |\n| b |\n");
    await clickInto(".ProseMirror td");
    await pressMod("t");
    await type("t");
    await expect($("#table-toolbar .caption input")).toBeFocused();
    await type("fruit");
    await type(Key.Enter);

    await pressMod("s");
    const saved = await waitForSaved(file, "caption");
    expect(saved).toContain("  <caption>fruit</caption>");
  });

  it("writes a caption from the toolbar", async () => {
    await open("| a |\n| - |\n| b |\n");
    await clickInto(".ProseMirror td");
    await $('#table-toolbar button[data-id="caption"]').click();
    await expect($("#table-toolbar .caption input")).toBeFocused();
    await type("stock");
    await type(Key.Enter);

    await pressMod("s");
    const saved = await waitForSaved(file, "caption");
    expect(saved).toContain("  <caption>stock</caption>");
  });

  it("switches a header column on from the toolbar", async () => {
    await open("| a | b |\n| - | - |\n| c | d |\n");
    await clickInto(".ProseMirror td");
    await $('#table-toolbar button[data-id="header-column"]').click();

    await pressMod("s");
    const saved = await waitForSaved(file, "<table>");
    expect(saved).toContain('      <th scope="row">c</th>');
  });

  describe("with the mouse", () => {
    /**
     * where the first table's rows and columns start, and where the last
     * one ends, in viewport px
     */
    const layout = () =>
      browser.execute(() => {
        const table = document.querySelector(".ProseMirror table")!;
        const box = table.getBoundingClientRect();
        const rows = [...table.querySelectorAll("tr")].map(
          (row) => row.getBoundingClientRect().top,
        );
        const columns = [...table.querySelectorAll("tr:first-child > *")].map(
          (cell) => cell.getBoundingClientRect().left,
        );
        return {
          rows: [...rows, box.bottom],
          columns: [...columns, box.right],
          box: {
            left: box.left,
            top: box.top,
            right: box.right,
            bottom: box.bottom,
          },
        };
      });
    const at = (x: number, y: number) => ({
      x: Math.round(x),
      y: Math.round(y),
    });
    // moves the mouse over the table first, which shows its handles
    const drag = async (
      from: { x: number; y: number },
      to: { x: number; y: number },
      hover: { x: number; y: number },
    ) => {
      await browser.action("pointer").move(hover).perform();
      await browser
        .action("pointer")
        .move(from)
        .down()
        .move(at((from.x + to.x) / 2, (from.y + to.y) / 2))
        .move(to)
        .up()
        .perform();
    };
    const save = async (text: string) => {
      await pressMod("s");
      return waitForSaved(file, text);
    };

    it("inserts a row with the + between two rows", async () => {
      await open("| a |\n| - |\n| b |\n| c |\n");
      const { box, rows } = await layout();
      await browser
        .action("pointer")
        .move(at(box.left + 40, rows[2] + 10))
        .perform();
      await browser
        .action("pointer")
        .move(at(box.left + 1, rows[2] + 1))
        .perform();
      await $("#table-handles .insert").click();

      const saved = await save("|     |");
      expect(saved).toBe("| a   |\n| --- |\n| b   |\n|     |\n| c   |");
    });

    it("moves a row by dragging its handle", async () => {
      await open("| a |\n| - |\n| b |\n| c |\n");
      const { box, rows } = await layout();
      const c = (rows[2] + rows[3]) / 2;
      await drag(
        at(box.left, c),
        at(box.left, rows[1] + 2),
        at(box.left + 40, c),
      );

      const saved = await save("| c   |\n| b");
      expect(saved).toBe("| a   |\n| --- |\n| c   |\n| b   |");
    });

    it("resizes columns, saved as an HTML table, and resets them", async () => {
      await open("| a | b |\n| - | - |\n| c | d |\n");
      const { box, columns } = await layout();
      const y = (box.top + box.bottom) / 2;
      const line = at(columns[1], y);
      await drag(line, at(box.left + (box.right - box.left) * 0.25, y), line);

      const saved = await save("<colgroup>");
      expect(saved).toContain('    <col style="width: 25');

      await browser
        .action("pointer")
        .move(at(box.left + 40, y))
        .perform();
      const moved = await layout();
      await browser.action("pointer").move(at(moved.columns[1], y)).perform();
      await $("#table-handles .resizer").doubleClick();
      const reset = await save("| a");
      expect(reset).toBe("| a   | b   |\n| --- | --- |\n| c   | d   |");
    });

    it("adds rows by dragging the bottom edge and drops empty columns", async () => {
      await open("| a | b |   |\n| - | - | - |\n| c | d |   |\n");
      const { box, rows, columns } = await layout();
      const height = rows[2] - rows[1];
      const x = (box.left + box.right) / 2;
      await drag(
        at(x, box.bottom + 1),
        at(x, box.bottom + height * 2),
        at(x, box.bottom - 10),
      );
      const y = (box.top + box.bottom) / 2;
      await drag(
        at(box.right, y),
        at((columns[1] + columns[2]) / 2 + 10, y),
        at(box.right - 20, y),
      );

      const saved = await save("|     |     |\n|     |     |");
      expect(saved).toBe(
        [
          "| a   | b   |",
          "| --- | --- |",
          "| c   | d   |",
          "|     |     |",
          "|     |     |",
        ].join("\n"),
      );
    });
  });

  it("deletes a row from the table menu", async () => {
    await open("| a |\n| - |\n| b |\n| c |\n");
    await $$(".ProseMirror td")[0].click({ button: "right" });
    await $('[data-id="table"]').click();
    await $('[data-id="table-row-delete"]').click();

    await pressMod("s");
    const saved = await waitForSaved(file, "| c");
    expect(saved).toBe("| a   |\n| --- |\n| c   |");
  });
});

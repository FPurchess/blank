// the pictures of docs/guide/tables.md (see shots.ts)
import { $, browser } from "@wdio/globals";

import { Key, paste, pressMod, pressShift, type } from "../helpers.ts";
import { TAB_ROW_HEIGHT } from "../../src/chrome.ts";
import { filmNew, finishShots, prepare, SHIFT, typeChar } from "./shots.ts";

describe("docs shots: tables", () => {
  before(() => prepare());
  after(() => finishShots());

  it("records making a table", async () => {
    const film = await filmNew();
    await film.type("# Fruit stock");
    await film.enter(0.5);
    await film.shortcut(["Mod", "T"], () => pressMod("t"), 1);
    await film.press("→", Key.ArrowRight, 0.6);
    await film.press("↓", Key.ArrowDown, 0.6);
    await film.press("Enter", Key.Enter, 0.8);
    const cells = ["Fruit", "Origin", "Qty", "Price"];
    const rows = [
      ["Apples", "Tyrol", "40", "1.20"],
      ["Pears", "Valais", "12", "0.80"],
      ["Kiwis", "Italy", "25", "0.45"],
    ];
    for (const [i, text] of [...cells, ...rows.flat()].entries()) {
      if (i > 0) await film.press("Tab", Key.Tab, 0.35);
      await film.type(text);
    }
    await film.pause(0.8);
    // out of the table and on with the text
    await film.press("↓", Key.ArrowDown, 0.8);
    await film.type("Prices are per piece.");
    await film.pause(2.5);
    film.save("table-insert.gif", 395 + SHIFT);
  });

  it("records typing a table header", async () => {
    const film = await filmNew();
    await film.type("| Name | Role |");
    await film.pause(0.6);
    await film.press("Enter", Key.Enter, 1);
    for (const [i, text] of ["Ada", "Engineer", "Grace", "Admiral"].entries()) {
      if (i > 0) await film.press("Tab", Key.Tab, 0.35);
      await film.type(text);
    }
    await film.pause(2.5);
    film.save("table-header.gif", 275 + SHIFT);
  });

  it("records writing in cells", async () => {
    const film = await filmNew();
    await film.type("| Task | Notes |");
    await film.enter(0.6);
    await film.type("Print");
    await film.press("Tab", Key.Tab, 0.35);
    await film.type("A4, both sides");
    // a second line in the same cell
    await film.press("Enter", Key.Enter, 0.6);
    await film.type("Staple it");
    await film.press("Tab", Key.Tab, 0.35);
    await film.type("Send");
    await film.press("Tab", Key.Tab, 0.35);
    await film.type("By Friday");
    await film.pause(1);
    // from the start of the cell, Shift+← selects both cells of the row
    await film.press("Home", Key.Home, 0.4);
    await film.shortcut(["Shift", "←"], () => pressShift(Key.ArrowLeft), 0.9);
    await film.press("Backspace", Key.Backspace, 1);
    await film.pause(2);
    film.save("table-cells.gif", 335 + SHIFT);
  });

  it("records table mode", async () => {
    const film = await filmNew();
    await film.type("| Fruit | Qty |");
    await film.enter(0.5);
    for (const [i, text] of [
      "Pears",
      "12",
      "Apples",
      "40",
      "Kiwis",
      "25",
    ].entries()) {
      if (i > 0) await film.press("Tab", Key.Tab, 0.3);
      await film.type(text);
    }
    await film.pause(0.8);
    // the toolbar shows its keys, which then change the table
    await film.shortcut(["Mod", "T"], () => pressMod("t"), 1.4);
    await film.press("↓", Key.ArrowDown, 1);
    await film.press("S", "s", 1.2);
    await film.press("R", "r", 1.2);
    await film.press("Esc", Key.Escape, 0.8);
    await film.pause(2);
    film.save("table-mode.gif", 335 + SHIFT);
  });

  it("records pasting cells from a spreadsheet", async () => {
    const film = await filmNew();
    await film.type("# Fruit stock");
    await film.enter(0.6);
    // cells copied in a spreadsheet: tab-separated text
    await film.shortcut(
      ["Mod", "V"],
      () =>
        paste({
          "text/plain": "Fruit\tQty\tPrice\nApples\t40\t1.20\nPears\t12\t0.80",
        }),
      1.6,
    );
    // Tab in the last cell adds a row, where two more rows get pasted
    const lastCell = await browser.execute(() => {
      const table = window.blankGeometry.tables()[0]!;
      const { rows, columns } = table.pieces[table.pieces.length - 1];
      return {
        x: Math.round(columns[columns.length - 2] + 30),
        y: Math.round((rows[rows.length - 2] + rows[rows.length - 1]) / 2),
      };
    });
    await browser.action("pointer").move(lastCell).down().up().perform();
    await film.pause(0.4);
    await film.press("Tab", Key.Tab, 0.6);
    await film.shortcut(
      ["Mod", "V"],
      () => paste({ "text/plain": "Kiwis\t25\t0.40\nPlums\t30\t0.25" }),
      1.6,
    );
    await film.pause(2);
    film.save("table-paste.gif", 335 + SHIFT);
  });

  it("records changing a table with the mouse", async () => {
    const film = await filmNew();
    // the table is there before the film starts
    for (const [i, line] of [
      "| Fruit | Qty | Note |",
      "Pears",
      "12",
      "ripe",
      "Apples",
      "40",
      "",
      "Kiwis",
      "25",
    ].entries()) {
      if (i > 1) await type(Key.Tab);
      for (const char of line) await typeChar(char);
      if (i === 0) await type(Key.Enter);
    }
    await film.pause(0.8);
    // the painted table, see src/engine/geometry.ts
    const layout = () =>
      browser.execute(() => {
        const table = window.blankGeometry.tables()[0]!;
        const { box, rows, columns } = table.pieces[0];
        return { rows, columns, left: box.left, bottom: box.bottom };
      });
    const middle = (lines: number[], i: number) =>
      Math.round((lines[i] + lines[i + 1]) / 2);

    // the handle of the Kiwis row moves it to the top
    let table = await layout();
    await film.moveTo({ x: table.left + 70, y: middle(table.rows, 3) }, 0.8);
    await film.moveTo({ x: table.left, y: middle(table.rows, 3) }, 0.4);
    await film.drag({ x: table.left, y: table.rows[1] + 4 }, 0.9);

    // the + between two rows inserts one, which gets filled: it shows
    // while the pointer is over the table, near the line
    table = await layout();
    await film.moveTo(
      { x: table.left + 40, y: Math.round(table.rows[3]) + 8 },
      0.5,
    );
    await film.moveTo(
      { x: table.left + 1, y: Math.round(table.rows[3]) + 1 },
      0.5,
    );
    await $("#table-handles .insert").waitForDisplayed();
    await film.clickOn($("#table-handles .insert"), 0.6);
    film.hidePointer();
    await film.type("Plums");
    await film.press("Tab", Key.Tab, 0.3);
    await film.type("7");
    await film.pause(0.6);

    // the line between two columns resizes them
    table = await layout();
    const y = middle(table.rows, 2);
    await film.moveTo({ x: Math.round(table.columns[1]), y }, 0.8);
    await film.drag({ x: Math.round(table.columns[1]) + 110, y }, 0.8);

    // the bottom edge adds rows
    table = await layout();
    const x = Math.round((table.columns[0] + table.columns[1]) / 2);
    await film.moveTo({ x, y: Math.round(table.bottom) + 1 }, 0.7);
    await film.drag({ x, y: Math.round(table.bottom) + 70 }, 0.9);
    // the empty half of the tab row
    await film.moveTo({ x: 500, y: TAB_ROW_HEIGHT / 2 }, 0.6);
    film.hidePointer();
    await film.pause(2);
    await browser.releaseActions();
    film.save("table-mouse.gif", 415 + SHIFT);
  });
});

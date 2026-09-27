import { describe, expect, it, vi } from "vitest";

import {
  createTestView,
  doc,
  p,
  table,
  td,
  th,
  tr,
} from "../../../test/editor";
import { cellTexts, cursorAt, selectCells } from "../../../test/tables";
import { iconNames } from "../../../icons";
import { matchesKey, tableActions } from "./actions";

const grid = () =>
  doc(
    table(
      tr(th("Name"), th("Qty")),
      tr(td("b"), td("10")),
      tr(td("a"), td("2")),
    ),
    p(),
  );

const editCaption = vi.fn();
const actions = tableActions(editCaption);
const action = (id: string) => actions.find((a) => a.id === id)!;

const key = (code: string, modifiers: Partial<KeyboardEvent> = {}) =>
  new KeyboardEvent("keydown", { code, ...modifiers });

describe("tableActions", () => {
  it("gives every action its own key and a known icon", () => {
    const keys = actions.map(({ key }) => `${key.code}${key.shift}${key.mod}`);

    expect(new Set(keys).size).toBe(actions.length);
    for (const { icon } of actions) expect(iconNames).toContain(icon);
  });

  it("labels every action and tells what it does", () => {
    const state = cursorAt(grid(), "10");
    const described = Object.fromEntries(
      actions.map((a) => [a.id, [a.label(state), a.done(state)]]),
    );

    expect(described).toEqual({
      "row-above": ["Insert row above", "A row added"],
      "row-below": ["Insert row below", "A row added"],
      "row-delete": ["Delete row", "A row deleted"],
      "column-left": ["Insert column left", "A column added"],
      "column-right": ["Insert column right", "A column added"],
      "column-delete": ["Delete column", "A column deleted"],
      "row-up": ["Move row up", "Moved up"],
      "row-down": ["Move row down", "Moved down"],
      "column-back": ["Move column left", "Moved left"],
      "column-forward": ["Move column right", "Moved right"],
      "align-left": ["Align left", "A column aligned left"],
      "align-center": ["Center", "A column centered"],
      "align-right": ["Align right", "A column aligned right"],
      sort: ["Sort by this column", "Sorted by Qty, ascending"],
      merge: ["Split cell", "Cell split"],
      "header-row": ["Header row", "Header row off"],
      "header-column": ["Header column", "Header column on"],
      caption: ["Caption…", ""],
      "table-delete": ["Delete table", "Table deleted"],
    });
  });

  it("tells when an alignment goes back to the default", () => {
    const view = createTestView(cursorAt(grid(), "10"));
    action("align-center").run(view);

    expect(action("align-center").checked!(view.state)).toBe(true);
    expect(action("align-center").done(view.state)).toBe("Alignment reset");
  });

  it("names the column by its number in a table without a header row", () => {
    const node = doc(table(tr(td("b")), tr(td("a"))), p());

    expect(action("sort").done(cursorAt(node, "b"))).toBe(
      "Sorted by column 1, ascending",
    );
  });

  it("runs an action and describes what it does", () => {
    const view = createTestView(cursorAt(grid(), "2"));
    const insert = action("row-below");

    expect(insert.enabled(view.state)).toBe(true);
    expect(insert.done(view.state)).toBe("A row added");
    insert.run(view);
    expect(cellTexts(view.state.doc)).toHaveLength(4);
  });

  it("counts the selected rows and columns", () => {
    const state = selectCells(cursorAt(grid(), "b"), "b", "2");

    expect(action("row-delete").label(state)).toBe("Delete rows");
    expect(action("row-delete").done(state)).toBe("2 rows deleted");
    expect(action("column-delete").label(state)).toBe("Delete columns");
    expect(action("align-left").done(state)).toBe("2 columns aligned left");
  });

  it("tells which way a sort goes and by which column", () => {
    const view = createTestView(cursorAt(grid(), "2"));
    const sort = action("sort");

    expect(sort.done(view.state)).toBe("Sorted by Qty, ascending");
    sort.run(view);
    expect(sort.done(view.state)).toBe("Sorted by Qty, descending");
  });

  it("shows whether header rows, header columns and alignments are on", () => {
    const state = cursorAt(grid(), "2");

    expect(action("header-row").checked!(state)).toBe(true);
    expect(action("header-column").checked!(state)).toBe(false);
    expect(action("align-right").checked!(state)).toBe(false);
    expect(action("header-row").done(state)).toBe("Header row off");
  });

  it("names merging or splitting by what the selection allows", () => {
    const single = cursorAt(grid(), "2");
    const several = selectCells(single, "b", "2");

    expect(action("merge").label(single)).toBe("Split cell");
    expect(action("merge").enabled(single)).toBe(false);
    expect(action("merge").label(several)).toBe("Merge cells");
    expect(action("merge").enabled(several)).toBe(true);
  });

  it("opens the caption field", () => {
    const view = createTestView(cursorAt(grid(), "2"));

    action("caption").run(view);
    expect(editCaption).toHaveBeenCalledWith(view);
  });

  it("applies to nothing outside tables", () => {
    const state = cursorAt(doc(p("text")), "text");

    for (const { enabled } of actions) expect(enabled(state)).toBe(false);
  });
});

describe("matchesKey", () => {
  it("matches letters by their position, so every keyboard layout works", () => {
    expect(matchesKey(action("sort"), key("KeyS"))).toBe(true);
    expect(matchesKey(action("sort"), key("KeyS", { shiftKey: true }))).toBe(
      false,
    );
    expect(
      matchesKey(action("header-column"), key("KeyH", { shiftKey: true })),
    ).toBe(true);
  });

  it("tells Backspace for rows, columns and the table apart", () => {
    const backspace = (modifiers = {}) =>
      actions
        .filter((a) => matchesKey(a, key("Backspace", modifiers)))
        .map((a) => a.id);

    expect(backspace()).toEqual(["row-delete"]);
    expect(backspace({ shiftKey: true })).toEqual(["column-delete"]);
    expect(backspace({ ctrlKey: true })).toEqual(["table-delete"]);
    expect(backspace({ altKey: true })).toEqual([]);
  });
});

import type { Node } from "prosemirror-model";
import {
  type Command,
  TextSelection,
  type EditorState,
} from "prosemirror-state";
import { CellSelection } from "prosemirror-tables";

import { isHeaderCell } from "../markdown";
import type { TableHandlesState } from "../state";
import { expect, vi } from "vitest";

import { createState, createTestView } from "./editor";

// Helpers for tests of tables, on top of the node builders in ./editor.ts.

/**
 * at returns the position of `needle` in the text of `node`, plus `offset`
 */
export const at = (node: Node, needle: string, offset = 0) => {
  let found = -1;
  node.descendants((child, pos) => {
    if (found >= 0) return false;
    const index = child.isText ? child.text!.indexOf(needle) : -1;
    if (index >= 0) found = pos + index;
    return true;
  });
  if (found < 0) throw new Error(`"${needle}" not found`);
  return found + offset;
};

/**
 * cursorAt returns a state of `node` with the cursor at the start of `text`
 */
export const cursorAt = (node: Node, text: string, offset = 0) =>
  createState(node, { cursor: at(node, text, offset) });

/**
 * selectCells returns `state` with the cells from the one holding `from` to
 * the one holding `to` selected
 */
export const selectCells = (state: EditorState, from: string, to: string) => {
  const { doc } = state;
  const cell = (text: string) => doc.resolve(at(doc, text)).before(-1);
  return state.apply(
    state.tr.setSelection(CellSelection.create(doc, cell(from), cell(to))),
  );
};

/**
 * tableOf returns the first table of `doc`
 */
const tableOf = (doc: Node) => {
  let table: Node | undefined;
  doc.descendants((node) => {
    if (node.type.name === "table") table ??= node;
    return !table;
  });
  if (!table) throw new Error("no table");
  return table;
};

/**
 * cellTexts returns the text of each cell of the first table of `doc`, row by
 * row
 */
export const cellTexts = (doc: Node) =>
  tableOf(doc).children.map((row) =>
    row.children.map((cell) => cell.textContent),
  );

/**
 * cellTypes returns "th" or "td" for each cell of the first table of `doc`
 */
export const cellTypes = (doc: Node) =>
  tableOf(doc).children.map((row) =>
    row.children.map((cell) => (isHeaderCell(cell) ? "th" : "td")),
  );

/**
 * selectedText returns the text of the cells the selection covers, or the
 * text of the cell the cursor is in
 */
export const selectedText = (state: EditorState) => {
  const { selection } = state;
  if (selection instanceof CellSelection) {
    const texts: string[] = [];
    selection.forEachCell((cell) => texts.push(cell.textContent));
    return texts;
  }
  const $head = (selection as TextSelection).$head;
  return [$head.node(-1).textContent];
};

/**
 * runCommand runs `command` on `state`, which must apply it, and returns the
 * state it leaves
 */
export const runCommand = (command: Command, state: EditorState) => {
  const view = createTestView(state);
  expect(command(view.state, view.dispatch)).toBe(true);
  return view.state;
};

/**
 * fakeTableHandles returns the handles state of a table of three rows (the
 * first a header row) and three columns, 300 px wide, at 100, 100, with
 * spies for its actions
 */
export const fakeTableHandles = (
  change: Partial<TableHandlesState> = {},
): TableHandlesState => ({
  box: { left: 100, top: 100, right: 400, bottom: 220 },
  visible: { left: 100, right: 400 },
  rows: [100, 140, 180, 220],
  firstRow: 0,
  rowCount: 3,
  columns: [100, 200, 300, 400],
  headerRows: 1,
  headerColumn: false,
  smallest: { cols: 2, rows: 2 },
  percents: [30, 30, 40],
  selected: null,
  insertRow: vi.fn(),
  insertColumn: vi.fn(),
  selectRows: vi.fn(),
  selectColumns: vi.fn(),
  moveRows: vi.fn(),
  moveColumns: vi.fn(),
  resize: vi.fn(),
  setWidths: vi.fn(),
  hold: vi.fn(),
  ...change,
});

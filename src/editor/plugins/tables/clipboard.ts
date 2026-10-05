import { Fragment, type Node, Slice } from "prosemirror-model";
import { Plugin, type EditorState, type Transaction } from "prosemirror-state";
// pastedCells is exported for tests only, but it's how prosemirror-tables
// reads the cells of a slice, and pasting and copying need the same reading
import {
  __pastedCells as pastedCells,
  CellSelection,
  handlePaste,
  isInTable,
  selectedRect,
  TableMap,
} from "prosemirror-tables";
import type { EditorView } from "prosemirror-view";

import { headerRowCount, schema, tokenizer } from "../../../markdown";
import { normalizeTableHtml } from "../../../markdown/html";
import {
  cellAt,
  mapTables,
  withColumnAlignment,
} from "../../../markdown/tables";
import {
  cellPos,
  hasHeaderColumn,
  refreshed,
  setCellType,
} from "../../commands/table/rect";
import { blocksMarkdown } from "../blockClipboard";

// Tables and the clipboard: tables pasted from spreadsheets and web pages,
// tab-separated text, which spreadsheets copy too, pasted as a table, cells
// pasted into a table, and cells copied as tab-separated text.

/**
 * readCell reads the cell of tab-separated values that starts at `from` in
 * `input`: quoted, where a doubled quote is a quote, if it starts with a
 * quote that a closing one ends at a tab, a line break or the end, and as
 * it is otherwise. Returns the cell's text and where it ends.
 */
const readCell = (input: string, from: number) => {
  if (input[from] === '"') {
    let text = "";
    let i = from + 1;
    while (i < input.length) {
      if (input[i] === '"' && input[i + 1] === '"') {
        text += '"';
        i += 2;
      } else if (input[i] === '"') {
        break;
      } else {
        text += input[i++];
      }
    }
    const end = i + 1;
    if (i < input.length && /^[\t\n]?$/.test(input[end] ?? "")) {
      return { text, end };
    }
  }
  let end = from;
  while (end < input.length && input[end] !== "\t" && input[end] !== "\n") {
    end++;
  }
  return { text: input.slice(from, end), end };
};

/**
 * parseTsv reads `text` as tab-separated values the way spreadsheets copy
 * them: a row per line, a cell per tab, and quotes around a cell that holds
 * a tab, a line break or a quote, which is doubled. Returns the rows if the
 * text is a table: at least two rows of the same two or more cells, and not
 * an empty first column, which would be text indented with tabs.
 */
export const parseTsv = (text: string): string[][] | null => {
  const input = text.replace(/\r\n?/g, "\n").replace(/\n$/, "");
  const rows: string[][] = [[]];
  let i = 0;
  while (i <= input.length) {
    const cell = readCell(input, i);
    rows[rows.length - 1].push(cell.text);
    if (input[cell.end] === "\n") rows.push([]);
    i = cell.end + 1;
  }
  const width = rows[0].length;
  const table =
    rows.length >= 2 &&
    width >= 2 &&
    rows.every((row) => row.length === width) &&
    rows.some((row) => row[0]);
  return table ? rows : null;
};

/**
 * tsvCell writes `text` as a cell of tab-separated values, quoted if it
 * holds a tab, a line break or a quote
 */
const tsvCell = (text: string) =>
  /[\t\n"]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;

/**
 * formatTsv writes `rows` as tab-separated values, see parseTsv
 */
export const formatTsv = (rows: string[][]) =>
  rows.map((row) => row.map(tsvCell).join("\t")).join("\n");

/**
 * tableOfRows returns a table of `rows` of text, with a line break for each
 * newline in a cell, and a header row if `header` is set
 */
export const tableOfRows = (rows: string[][], header: boolean): Node => {
  const { table, table_row, table_header, table_cell, paragraph, hard_break } =
    schema.nodes;
  const content = (text: string) =>
    text
      .split("\n")
      .flatMap((line, i) => [
        ...(i > 0 ? [hard_break.create()] : []),
        ...(line ? [schema.text(line)] : []),
      ]);
  return table.create(
    null,
    rows.map((row, r) =>
      table_row.create(
        null,
        row.map((text) =>
          (header && r === 0 ? table_header : table_cell).create(
            null,
            paragraph.create(null, content(text)),
          ),
        ),
      ),
    ),
  );
};

/**
 * cellText returns the text of `cell`, with a newline for each line break
 * and between blocks
 */
const cellText = (cell: Node) =>
  cell.textBetween(0, cell.content.size, "\n", (leaf) =>
    leaf.type === schema.nodes.hard_break ? "\n" : "",
  );

/**
 * tsvOf returns the cells `slice` holds as tab-separated values, with an
 * empty cell where a merged cell spans, or null if it holds no cells
 */
export const tsvOf = (slice: Slice): string | null => {
  const cells = pastedCells(slice);
  if (!cells) return null;
  const { table, table_row } = schema.nodes;
  const node = table.create(
    null,
    cells.rows.map((row) => table_row.create(null, row)),
  );
  const map = TableMap.get(node);
  const rows = Array.from({ length: map.height }, (_, r) =>
    Array.from({ length: map.width }, (_, c) => {
      const offset = cellAt(map, r, c);
      const { top, left } = map.findCell(offset);
      return top === r && left === c ? cellText(node.nodeAt(offset)!) : "";
    }),
  );
  return formatTsv(rows);
};

/**
 * retyping returns a dispatch that gives the cells a paste of `cells` into
 * the table of `state` lands on the type their place calls for, header
 * cells in the header rows and header column and plain cells elsewhere,
 * before passing the transaction on. The paste fills the selected cells, or
 * as many as it holds from the cell at the cursor.
 */
const retyping = (
  state: EditorState,
  cells: { width: number; height: number },
  dispatch: (tr: Transaction) => void,
): ((tr: Transaction) => void) => {
  const rect = selectedRect(state);
  const headerRows = headerRowCount(rect.table);
  const headerColumn = hasHeaderColumn(rect);
  // the selected cells, or the cell of the cursor
  const { top, left } = rect;
  const selected = state.selection instanceof CellSelection;
  const bottom = selected ? rect.bottom : top + cells.height;
  const right = selected ? rect.right : left + cells.width;
  return (tr) => {
    const table = refreshed(tr, rect);
    for (let row = top; row < bottom; row++) {
      for (let col = left; col < right; col++) {
        const header = row < headerRows || (headerColumn && col === 0);
        setCellType(
          tr,
          cellPos(table, row, col),
          header ? schema.nodes.table_header : schema.nodes.table_cell,
        );
      }
    }
    dispatch(tr);
  };
};

// what a clipboardTextParser returns to let ProseMirror parse the text
// itself; its type asks for a slice, but it checks for one
const PARSE_AS_TEXT = null as unknown as Slice;

// the views the menu pastes text into that the keyboard's paste would paste
// as is, rather than as plain text, see pasteText; only while it pastes,
// which is synchronous
const pastingAsTyped = new WeakSet<EditorView>();

/**
 * pasteText pastes `text` like the keyboard's paste does, where the webview
 * doesn't let the menu read the formatted clipboard: tab-separated text
 * becomes a table, unless `plain` asks for plain text
 */
export const pasteText = (view: EditorView, text: string, plain: boolean) => {
  if (!plain) pastingAsTyped.add(view);
  try {
    view.pasteText(text);
  } finally {
    pastingAsTyped.delete(view);
  }
};

/**
 * tableClipboard makes tables work with the clipboard: tables pasted from
 * other apps become tables Blank holds, with a header row outside a table;
 * tab-separated text becomes a table; cells pasted into a table take on the
 * type of the cells they land on; and copied cells are tab-separated text
 */
export const tableClipboard = () => {
  // set between the HTML of another app and the slice it becomes, which
  // ProseMirror reads in one go
  let fromElsewhere = false;
  return new Plugin({
    props: {
      transformPastedHTML: (html, view) => {
        // Blank's own copies (and other ProseMirror editors') are kept
        fromElsewhere = !/data-pm-slice/.test(html) && /<table/i.test(html);
        if (!fromElsewhere) return html;
        const dom = new DOMParser().parseFromString(html, "text/html");
        const promoteHeader = !isInTable(view.state);
        for (const table of dom.querySelectorAll("table")) {
          if (!table.parentElement?.closest("table")) {
            normalizeTableHtml(table, tokenizer, { promoteHeader });
          }
        }
        return dom.body.innerHTML;
      },
      transformPasted: (slice) => {
        if (!fromElsewhere) return slice;
        fromElsewhere = false;
        // spreadsheets align every cell by what it holds
        return new Slice(
          mapTables(slice.content, withColumnAlignment),
          slice.openStart,
          slice.openEnd,
        );
      },
      clipboardTextParser: (text, _$context, plain, view) => {
        if (plain && !pastingAsTyped.has(view)) return PARSE_AS_TEXT;
        const rows = parseTsv(text);
        if (!rows) return PARSE_AS_TEXT;
        const table = tableOfRows(rows, !isInTable(view.state));
        return new Slice(Fragment.from(table), 0, 0);
      },
      handlePaste: (view, event, slice) => {
        if (!isInTable(view.state)) return false;
        const cells = pastedCells(slice);
        // cells, or anything pasted into selected cells, which it fills
        const selected = view.state.selection instanceof CellSelection;
        if (!cells && !selected) return false;
        // prosemirror-tables' paste (as of 1.8.5) only uses the view's state
        // and dispatch
        const retyped = {
          state: view.state,
          dispatch: retyping(
            view.state,
            cells ?? { width: 1, height: 1 },
            view.dispatch,
          ),
        } as EditorView;
        return handlePaste(retyped, event, slice);
      },
      // cells as tab-separated values, content blocks as their markdown
      // (./blockClipboard.ts), anything else as ProseMirror copies it, for ""
      clipboardTextSerializer: (slice, view) =>
        tsvOf(slice) ?? blocksMarkdown(slice, view.state.doc) ?? "",
    },
  });
};

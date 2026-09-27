import type { Node } from "prosemirror-model";
import {
  TextSelection,
  type Command,
  type EditorState,
  type Transaction,
} from "prosemirror-state";
import { addRow, TableMap } from "prosemirror-tables";

import { schema } from "../../schema";
import { inCell, tableAround } from "../../plugins/tables/util";

/**
 * createTable returns an empty table of `cols` columns and `rows` rows, the
 * first of which is the header row
 */
export const createTable = (cols: number, rows: number): Node => {
  const { table, table_row, table_header, table_cell } = schema.nodes;
  const row = (type: typeof table_cell) =>
    table_row.create(
      null,
      Array.from({ length: cols }, () => type.createAndFill()!),
    );
  return table.create(null, [
    row(table_header),
    ...Array.from({ length: rows - 1 }, () => row(table_cell)),
  ]);
};

/**
 * insertTable inserts an empty table of `cols` × `rows` with a header row and
 * puts the cursor in its first cell. It replaces an empty paragraph and goes
 * after the block at the cursor otherwise. Tables can't go into cells.
 */
export const insertTable =
  (cols: number, rows: number): Command =>
  (state, dispatch) => {
    const { $from } = state.selection;
    if (inCell($from) || !$from.parent.isTextblock) return false;

    const node = createTable(cols, rows);
    const empty =
      $from.parent.type === schema.nodes.paragraph &&
      $from.parent.content.size === 0;
    const container = $from.node(-1);
    const index = $from.index(-1);
    const fits = empty
      ? container.canReplaceWith(index, index + 1, node.type)
      : container.canReplaceWith(index + 1, index + 1, node.type);
    if (!fits) return false;

    if (dispatch) {
      const tr = state.tr;
      const pos = empty ? $from.before() : $from.after();
      if (empty) tr.replaceWith(pos, $from.after(), node);
      else tr.insert(pos, node);
      // table, row, cell and paragraph open before the first cell's text
      tr.setSelection(TextSelection.create(tr.doc, pos + 4));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

/**
 * appendRow adds a row to the end of the table around the selection, with the
 * cell types and alignment of the last row, and puts the cursor in its first
 * cell
 */
export const appendRow = (state: EditorState): Transaction | undefined => {
  const table = tableAround(state.selection.$head);
  if (!table) return;
  const { map, start, node } = table;
  const tr = addRow(
    state.tr,
    {
      map,
      tableStart: start,
      table: node,
      left: 0,
      top: 0,
      right: 0,
      bottom: 0,
    },
    map.height,
  );

  // new cells take the alignment of the cell above them
  const added = tr.doc.nodeAt(table.pos)!;
  const addedMap = TableMap.get(added);
  const last = addedMap.height - 1;
  const fresh: number[] = [];
  for (let col = 0; col < addedMap.width; col++) {
    const offset = addedMap.map[last * addedMap.width + col];
    const above = addedMap.map[(last - 1) * addedMap.width + col];
    // cells merged across rows grow instead of getting a new cell
    if (offset === above || fresh.includes(offset)) continue;
    fresh.push(offset);
    const align = added.nodeAt(above)?.attrs.align ?? null;
    if (align) tr.setNodeAttribute(start + offset, "align", align);
  }

  const first = fresh[0] ?? addedMap.map[last * addedMap.width];
  tr.setSelection(TextSelection.near(tr.doc.resolve(start + first + 1)));
  return tr.scrollIntoView();
};

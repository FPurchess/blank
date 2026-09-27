import { Fragment, type Node } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { schema } from "../../../schema";
import { dispatchCorrection } from "../history";
import { inCell } from "../../tables/util";
import type { BlockTransformer } from "../types";

// the offsets of the text of each cell in the line, pipes left out
type Props = { from: number; to: number }[];

const reDelimiterCell = /^\s*:?-+:?\s*$/;

/**
 * cellsOf splits a line like "| Name | Qty |" at its unescaped pipes and
 * returns the offsets of each cell's text, trimmed
 */
const cellsOf = (line: string): Props | undefined => {
  if (!line.startsWith("|")) return undefined;
  const pipes: number[] = [];
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") i++;
    else if (line[i] === "|") pipes.push(i);
  }
  if (pipes.length < 2 || pipes[pipes.length - 1] !== line.length - 1) {
    return undefined;
  }
  const cells = pipes.slice(1).map((end, i) => {
    let from = pipes[i] + 1;
    let to = end;
    while (from < to && /\s/.test(line[from])) from++;
    while (to > from && /\s/.test(line[to - 1])) to--;
    return { from, to };
  });
  const texts = cells.map(({ from, to }) => line.slice(from, to));
  if (!texts.some((text) => text.length > 0)) return undefined;
  // a delimiter row like "|---|---|" isn't a header
  if (texts.every((text) => reDelimiterCell.test(text))) return undefined;
  return cells;
};

/**
 * unescapePipes turns the escaped pipes "\|" of a header cell into pipes
 */
const unescapePipes = (content: Fragment): Fragment => {
  const nodes: Node[] = [];
  content.forEach((node) => {
    const text = node.isText ? node.text!.replace(/\\\|/g, "|") : "";
    nodes.push(node.isText && text ? schema.text(text, node.marks) : node);
  });
  return Fragment.from(nodes.filter((node) => !node.isText || node.text));
};

/**
 * table turns a line like "| Name | Qty |" into a table with that header row
 * and an empty row to type in, keeping the header's formatting
 */
const _transformer: BlockTransformer<Props> = {
  trigger: "enter",
  activate: cellsOf,
  transform: (view: EditorView, _line, cells: Props): boolean => {
    const { $cursor } = view.state.selection as TextSelection;
    if (!$cursor || $cursor.parent.type !== schema.nodes.paragraph) {
      return false;
    }
    if (inCell($cursor)) return false;
    const { table, table_row, table_header, table_cell, paragraph } =
      schema.nodes;
    const index = $cursor.index(-1);
    if (!$cursor.node(-1).canReplaceWith(index, index + 1, table)) {
      return false;
    }

    const line = $cursor.parent.content;
    const header = cells.map(({ from, to }) =>
      table_header.create(
        null,
        paragraph.create(null, unescapePipes(line.cut(from, to))),
      ),
    );
    const body = cells.map(() => table_cell.createAndFill()!);
    const node = table.create(null, [
      table_row.create(null, header),
      table_row.create(null, body),
    ]);

    const pos = $cursor.before();
    const tr = view.state.tr.replaceWith(pos, $cursor.after(), node);
    // the cursor goes into the first cell of the new row
    const bodyStart = pos + 1 + node.firstChild!.nodeSize;
    tr.setSelection(TextSelection.create(tr.doc, bodyStart + 3));
    // a single undo restores the line as typed
    dispatchCorrection(view, tr);
    return true;
  },
};

export default _transformer;

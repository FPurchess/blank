import { closeHistory } from "prosemirror-history";
import {
  type Command,
  type EditorState,
  TextSelection,
} from "prosemirror-state";

import { config } from "../../config";

// Indenting and outdenting the lines of a code block with Tab and Shift-Tab,
// as VS Code does (its shiftCommand.ts): one step for every line the
// selection touches, to the next or the previous tab stop, measured in
// visible columns, where a tab reaches the next tab stop. A line keeps its
// own kind of indentation, tabs or spaces; a line without one takes the
// block's. With only a cursor, Tab inserts one step at it.

/**
 * columnOf returns the visible column after `text`, the start of a line:
 * a tab reaches the next tab stop
 */
export const columnOf = (text: string, size: number) => {
  let column = 0;
  for (const char of text)
    column =
      char === "\t" ? (Math.floor(column / size) + 1) * size : column + 1;
  return column;
};

// the indentation that reaches `column`, in tabs or in spaces
const indentation = (column: number, tabs: boolean, size: number) =>
  tabs
    ? "\t".repeat(Math.floor(column / size)) + " ".repeat(column % size)
    : " ".repeat(column);

const leading = (line: string) => /^[\t ]*/.exec(line)![0];

// the code block a text selection is in, from and to, or null
const codeBlockOf = (state: EditorState) => {
  const { selection } = state;
  if (!(selection instanceof TextSelection)) return null;
  const { $from, $to } = selection;
  if ($from.parent.type.name !== "code_block" || !$from.sameParent($to))
    return null;
  return $from;
};

// the index of the line at `offset`, by the offsets where lines start
const lineAt = (starts: number[], offset: number) => {
  let index = 0;
  while (index + 1 < starts.length && starts[index + 1] <= offset) index++;
  return index;
};

/**
 * shiftCode indents (1) or outdents (-1) the lines of the code block the
 * selection is in, or inserts a step at a cursor with Tab
 */
const shiftCode =
  (direction: 1 | -1): Command =>
  (state, dispatch) => {
    const $from = codeBlockOf(state);
    if (!$from) return false;
    const size = config.value.editor.indentSize;
    const block = $from.parent;
    const start = $from.start();
    const lines = block.textContent.split("\n");
    const starts: number[] = [];
    let at = 0;
    for (const line of lines) {
      starts.push(at);
      at += line.length + 1;
    }
    // the block's kind of indentation, from its first indented line
    const firstIndented = lines.map(leading).find((ws) => ws.length > 0);
    const blockTabs = firstIndented?.startsWith("\t") ?? false;
    const tabsFor = (ws: string) => (ws ? ws.startsWith("\t") : blockTabs);

    const { selection } = state;
    const tr = state.tr;
    const fromOffset = $from.parentOffset;
    const toOffset = selection.$to.parentOffset;

    if (selection.empty && direction === 1) {
      // one step at the cursor: spaces to the next tab stop, or a tab
      const line = lineAt(starts, fromOffset);
      const before = lines[line].slice(0, fromOffset - starts[line]);
      const column = columnOf(before, size);
      const step = tabsFor(leading(lines[line]))
        ? "\t"
        : " ".repeat((Math.floor(column / size) + 1) * size - column);
      tr.insertText(step, selection.from);
    } else {
      const first = lineAt(starts, fromOffset);
      let last = lineAt(starts, toOffset);
      // a selection that ends at the start of a line leaves that line alone
      if (last > first && toOffset === starts[last]) last--;
      // from the last line up, so the earlier positions stay as they are
      for (let index = last; index >= first; index--) {
        const line = lines[index];
        const ws = leading(line);
        const column = columnOf(ws, size);
        let target: number;
        if (direction === 1) {
          if (line.length === 0) continue;
          target = (Math.floor(column / size) + 1) * size;
        } else {
          if (column === 0) continue;
          target =
            column % size === 0
              ? column - size
              : Math.floor(column / size) * size;
        }
        const from = start + starts[index];
        tr.insertText(
          indentation(target, tabsFor(ws), size),
          from,
          from + ws.length,
        );
      }
      if (tr.docChanged) {
        // on the same lines, so pressing again goes on
        const { anchor, head } = selection;
        const forward = anchor <= head;
        const map = (pos: number, side: -1 | 1) => tr.mapping.map(pos, side);
        tr.setSelection(
          TextSelection.create(
            tr.doc,
            map(anchor, forward ? -1 : 1),
            map(head, forward ? 1 : -1),
          ),
        );
      }
    }
    // a step of its own in the history, however quickly the keys come
    if (tr.docChanged) dispatch?.(closeHistory(tr).scrollIntoView());
    // inside a code block, Tab never leaves it, even with nothing to do
    return true;
  };

// Tab in a code block
export const indentCode: Command = shiftCode(1);
// Shift-Tab in a code block
export const outdentCode: Command = shiftCode(-1);

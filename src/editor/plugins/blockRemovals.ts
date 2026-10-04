import type { Node } from "prosemirror-model";
import { Plugin, PluginKey, type Transaction } from "prosemirror-state";

import { blockName, isContentBlock } from "../../markdown/blocks/names";
import { announce } from "../../state";

// Says when content blocks are removed, however that happened: Delete or
// Backspace on a selected one, cutting it, the context menu, the toolbar,
// or typing over a selection that held one. A block that moved, by
// dragging, undo and redo, and the repairs plugins append, say nothing.

const key = new PluginKey<readonly string[]>("blockRemovals");

/**
 * says returns whether Blank says what `tr` removed: not for a move, undo
 * and redo, or a repair
 */
const says = (tr: Transaction) =>
  tr.docChanged &&
  tr.getMeta("uiEvent") !== "drop" &&
  !tr.getMeta("history$") &&
  tr.getMeta("addToHistory") !== false;

/**
 * removedBlocks returns the names of the content blocks of `doc` that `tr`
 * removed: those whose range it deleted, without a block of the same kind
 * in its place (as when a table of contents' settings change it)
 */
export const removedBlocks = (doc: Node, tr: Transaction): string[] => {
  const names: string[] = [];
  doc.forEach((node, pos) => {
    if (!isContentBlock(node)) return;
    const from = tr.mapping.mapResult(pos, 1);
    const to = tr.mapping.mapResult(pos + node.nodeSize, -1);
    if (to.pos > from.pos) return;
    const start = tr.mapping.map(pos, -1);
    if (tr.doc.nodeAt(start)?.type === node.type) return;
    names.push(blockName(doc, node));
  });
  return names;
};

/**
 * removedMessage returns what Blank says about removed blocks
 */
export const removedMessage = (names: readonly string[]) =>
  names.length === 1 ? `${names[0]} removed` : `${names.length} blocks removed`;

/**
 * blockRemovals says which content blocks a change removed
 */
export const blockRemovals = () =>
  new Plugin<readonly string[]>({
    key,
    state: {
      init: () => [],
      // a change Blank says nothing about keeps the value, so the repairs
      // appended to a removal don't drop what it removed
      apply: (tr, value, old) =>
        says(tr) ? removedBlocks(old.doc, tr) : value,
    },
    view: () => ({
      update: (view, prev) => {
        const names = key.getState(view.state)!;
        if (names.length > 0 && names !== key.getState(prev)) {
          announce(removedMessage(names));
        }
      },
    }),
  });

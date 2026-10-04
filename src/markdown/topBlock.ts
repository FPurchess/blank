import type { Node } from "prosemirror-model";

// The blocks at the top of a document: where content blocks stand, and
// between which they are inserted and dropped.

/**
 * topBlockAt returns the block at the top of `doc` that holds `pos`, or the
 * last one past the end, with its index and where it starts and ends; null
 * in a document without blocks
 */
export const topBlockAt = (doc: Node, pos: number) => {
  if (doc.childCount === 0) return null;
  const index = Math.min(
    doc.resolve(Math.max(0, Math.min(pos, doc.content.size))).index(0),
    doc.childCount - 1,
  );
  const node = doc.child(index);
  const from = doc.resolve(0).posAtIndex(index, 0);
  return { node, index, from, to: from + node.nodeSize };
};

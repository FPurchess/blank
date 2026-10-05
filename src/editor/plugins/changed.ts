import type { Node } from "prosemirror-model";

// what a visit is called with: the node, its position and its parent
type Visit = (node: Node, pos: number, parent: Node | null) => boolean | void;

/**
 * changedDescendants calls `f` for the descendants of `cur` that aren't in
 * `old`, descending into a node when `f` doesn't return false, so a plugin
 * that repairs the document looks only at what a transaction changed
 * @param offset the position `cur`'s content starts at
 */
export const changedDescendants = (
  old: Node,
  cur: Node,
  offset: number,
  f: Visit,
) => {
  const oldSize = old.childCount;
  let j = 0;
  outer: for (let i = 0; i < cur.childCount; i++) {
    const child = cur.child(i);
    for (let scan = j, end = Math.min(oldSize, i + 3); scan < end; scan++) {
      if (old.child(scan) === child) {
        j = scan + 1;
        offset += child.nodeSize;
        continue outer;
      }
    }
    if (f(child, offset, cur) !== false) {
      if (j < oldSize && old.child(j).sameMarkup(child)) {
        changedDescendants(old.child(j), child, offset + 1, f);
      } else {
        child.nodesBetween(0, child.content.size, f, offset + 1);
      }
    }
    offset += child.nodeSize;
  }
};

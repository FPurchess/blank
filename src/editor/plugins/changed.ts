import type { Node } from "prosemirror-model";
import type { Transaction } from "prosemirror-state";

// a range of a document, from its start to its end
export type Range = [from: number, to: number];

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

/**
 * textblocks calls `fn` for every textblock overlapping `ranges`, once, e.g.
 * those a transaction changed, which the spell check and find look at again
 */
export const textblocks = (
  doc: Node,
  ranges: Range[] | "all",
  fn: (block: Node, pos: number) => void,
) => {
  // the ranges overlap, e.g. for every typed char in a word
  const seen = new Set<number>();
  const visit = (from: number, to: number) =>
    doc.nodesBetween(from, to, (node, pos) => {
      if (!node.isTextblock) return true;
      if (!seen.has(pos)) fn(node, pos);
      seen.add(pos);
      return false;
    });
  if (ranges === "all") visit(0, doc.content.size);
  else
    ranges.forEach(([from, to]) => visit(from, Math.min(to, doc.content.size)));
};

// how many steps a transaction may have before it counts as changing all
// of the document: mapping each step's range through the rest takes as
// long as the steps squared, e.g. for a Replace all of thousands
const MANY_STEPS = 100;

/**
 * changesAll tells whether `tr` counts as changing all of the document, as
 * one of many steps does
 */
export const changesAll = (tr: Transaction) =>
  tr.mapping.maps.length > MANY_STEPS;

/**
 * changedRanges returns the ranges `tr` changed, in positions of its doc;
 * the whole document for a transaction of many steps
 */
export const changedRanges = (tr: Transaction): Range[] => {
  if (changesAll(tr)) return [[0, tr.doc.content.size]];
  const ranges: Range[] = [];
  tr.mapping.maps.forEach((map, index) => {
    const rest = tr.mapping.slice(index + 1);
    map.forEach((_oldStart, _oldEnd, newStart, newEnd) => {
      ranges.push([rest.map(newStart, -1), rest.map(newEnd, 1)]);
    });
  });
  return ranges;
};

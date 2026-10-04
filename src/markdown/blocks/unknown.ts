import type { Node } from "prosemirror-model";

import { parseMarker } from "./args";

/**
 * unknownName returns the name of the content block `raw` was read from, as
 * its marker gives it (`toc@3`), or null if its first line isn't a marker
 * Blank can read
 */
const unknownName = (raw: string): string | null => {
  const marker = parseMarker(raw.split("\n", 1)[0]);
  if (!marker) return null;
  return marker.format === null
    ? marker.name
    : `${marker.name}@${marker.format}`;
};

/**
 * unknownLabel is what stands for a content block Blank can't show, on the
 * pages and in the PDF
 */
export const unknownLabel = (raw: string): string => {
  const name = unknownName(raw);
  return name
    ? `Blank can't show this block (${name}) and keeps it as it is`
    : "Blank can't show this block and keeps it as it is";
};

/**
 * countUnknown counts the content blocks Blank can't show in `doc`
 */
const countUnknown = (doc: Node): number => {
  let count = 0;
  doc.forEach((node) => {
    if (node.type.name === "unknown_block") count++;
  });
  return count;
};

/**
 * unknownWarning tells how many content blocks Blank can't show an export of
 * `doc` has, and what became of them, e.g. "was left out" for one and "were
 * left out" for more; nothing for none
 */
export const unknownWarning = (
  doc: Node,
  became: { one: string; more: string },
): string[] => {
  const count = countUnknown(doc);
  if (count === 0) return [];
  return [
    count === 1
      ? `1 block Blank can't show ${became.one}`
      : `${count} blocks Blank can't show ${became.more}`,
  ];
};

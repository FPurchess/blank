import type { Node } from "prosemirror-model";

import { oneOf } from "../alignment";
import { closeMarker, fenceFor, formatMarker } from "./args";
import { extraArgs } from "./atoms";
import { parseWidth } from "./caps";
import { sourceOf } from "./sourceBlock";

// Diagrams: a Mermaid diagram from its source, as GitHub, GitLab, Obsidian
// and Typora keep it, a plain fence:
//
//   ```mermaid
//   flowchart LR
//     Idea --> Draft --> Done
//   ```
//
// With settings, a marker goes around the fence, which other apps don't
// show, so they still draw it:
//
//   <!-- blank:diagram@1 width="50%" caption="The plan" alt="…" -->
//
//   ```mermaid
//   …
//   ```
//
//   <!-- /blank:diagram -->
//
// Its alignment is that of the blocks around it, a <div align> (see
// ../alignment.ts), as for paragraphs.

// the language of its fence
export const DIAGRAM_LANG = "mermaid";

// the arguments its marker knows, in the order they're written
export const DIAGRAM_ARGS = ["width", "caption", "alt"] as const;

// the alignments a block can have: left (null), center or right
export const blockAlignment = oneOf(["center", "right"] as const);

export interface DiagramAttrs {
  // a share of the text's width, e.g. "50%" (see ./caps.ts); null for its
  // own size, at most the text's width
  width: string | null;
  caption: string;
  // what it shows, for screen readers and the PDF; its type ("Flowchart")
  // where it's empty
  alt: string;
  align: "center" | "right" | null;
  // the fence it was read with, e.g. "~~~" or "````", written again
  // while it still holds the source
  fence: string;
  extra: Record<string, string>;
}

/**
 * checkDiagram returns a diagram's attributes from its marker's arguments
 * (or a pasted figure's), or null if they can't be one: a width it can't
 * read
 */
export const checkDiagram = (
  args: Record<string, unknown>,
): DiagramAttrs | null => {
  const text = (key: string) =>
    typeof args[key] === "string" ? (args[key] as string) : "";
  const width = text("width") || null;
  if (width !== null && !parseWidth(width)) return null;
  return {
    width,
    caption: text("caption"),
    alt: text("alt"),
    align: blockAlignment(args.align),
    fence: text("fence"),
    extra: extraArgs(args.extra ?? args, [...DIAGRAM_ARGS, "align", "fence"]),
  };
};

// a fence of backticks or tildes, three or more
const FENCE = /^(`{3,}|~{3,})$/;

/**
 * fenceOf returns the fence a diagram is written with: the one it was read
 * with, while the source can't close it, or else the shortest of backticks
 */
const fenceOf = (source: string, read: string) => {
  if (FENCE.test(read)) {
    const mark = read[0];
    const longest = Math.max(
      0,
      ...Array.from(
        source.matchAll(mark === "`" ? /`+/g : /~+/g),
        (match) => match[0].length,
      ),
    );
    if (longest < read.length) return read;
  }
  return fenceFor(source, 3);
};

/**
 * writeDiagram writes a diagram as the file holds it, see the comment on
 * top; its <div align> is the serializer's
 */
export const writeDiagram = (node: Node) => {
  const attrs = node.attrs as DiagramAttrs;
  const source = sourceOf(node);
  const marks = fenceOf(source, attrs.fence);
  const fence = `${marks}${DIAGRAM_LANG}\n${source ? `${source}\n` : ""}${marks}`;
  const args: Record<string, string> = {
    ...attrs.extra,
    ...(attrs.width ? { width: attrs.width } : {}),
    ...(attrs.caption ? { caption: attrs.caption } : {}),
    ...(attrs.alt ? { alt: attrs.alt } : {}),
  };
  if (!Object.keys(args).length) return fence;
  return [
    formatMarker({ name: "diagram", format: 1, args }, DIAGRAM_ARGS),
    fence,
    closeMarker("diagram"),
  ].join("\n\n");
};

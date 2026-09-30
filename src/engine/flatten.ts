import type { Mark, Node } from "prosemirror-model";

import { tableGrid } from "../exporters/table";
import type { Content, EngineItem, EngineSpan, EngineText } from "./types";

// Flattens a ProseMirror document into the items the layout engine lays out
// one after the other: every textblock, rule, page break, image and table,
// with where it stands (indent, list marker, quote bars) and the space
// around it: margins that add up instead of collapsing, as the PDF had them
// since pdfmake wrote it.

// space below a paragraph, above and below a heading
const BLOCK_AFTER = 8;
const HEADING_BEFORE = 16;
const HEADING_AFTER = 5;
const HEADING_AFTER_HEADING = 4;
// list items, and the blocks after the first in an item
const ITEM_SPACE = 2;
// a horizontal rule has 2em around it
const RULE_BEFORE = 14;
const RULE_AFTER = 22;
// the indent of a list level, and of a quote: its bar and the space after it
export const LIST_INDENT = 18;
export const QUOTE_INDENT = 2.25 + 11;

const BULLETS = ["•", "◦", "▪"];

// an image's size before the engine fits it into the room it has, in points
export type ImageSizes = (
  src: string,
) => { width: number; height: number } | undefined;

// the column widths of the table the cursor is in, kept while it's there so
// the columns don't move while typing (see frozenWidths)
export interface FrozenWidths {
  // where the table is
  pos: number;
  widths: number[];
}

// where a block stands, which the item gets
interface Context {
  indent: number;
  bars: number[];
  // the positions of the quotes it is in, so the bars reach down to the next
  // item in the same quotes
  quotes: number[];
  depth: number;
  top: boolean;
}

/**
 * A flattened item before it is built: the node and what makes it look
 * the way it does. Two records with the same node and key give the same
 * item, apart from its position.
 */
export interface FlatRecord {
  node: Node;
  // the position of the node, or of the first child in a split paragraph
  pos: number;
  // what else the item depends on, see recordKey
  key: string;
  build: () => EngineItem;
}

/**
 * spansOf returns the text of a textblock (hard breaks as "\n") and its
 * marked runs, counted in ProseMirror positions from its start
 */
export const spansOf = (
  children: readonly Node[],
): { text: string; spans: EngineSpan[] } => {
  let text = "";
  const spans: EngineSpan[] = [];
  for (const child of children) {
    const from = text.length;
    if (child.isText) text += child.text ?? "";
    else if (child.type.name === "hard_break") text += "\n";
    // any other inline leaf takes its one position
    else text += "￼";
    const to = text.length;
    const span = spanOf(child.marks, from, to);
    if (span) {
      const last = spans[spans.length - 1];
      if (last && last.to === from && sameMarks(last, span)) last.to = to;
      else spans.push(span);
    }
  }
  return { text, spans };
};

const spanOf = (
  marks: readonly Mark[],
  from: number,
  to: number,
): EngineSpan | null => {
  const span: EngineSpan = { from, to };
  for (const mark of marks) {
    if (mark.type.name === "strong") span.bold = true;
    else if (mark.type.name === "em") span.italic = true;
    else if (mark.type.name === "code") span.code = true;
    else if (mark.type.name === "link") span.link = mark.attrs.href as string;
  }
  return span.bold || span.italic || span.code || span.link ? span : null;
};

const sameMarks = (a: EngineSpan, b: EngineSpan) =>
  !!a.bold === !!b.bold &&
  !!a.italic === !!b.italic &&
  !!a.code === !!b.code &&
  a.link === b.link;

const styleOf = (node: Node) => {
  if (node.type.name === "heading") return `h${node.attrs.level as number}`;
  if (node.type.name === "code_block") return "code";
  return "p";
};

/**
 * textOf builds the text of a textblock's children, which start at `pos`
 */
const textOf = (
  node: Node,
  children: readonly Node[],
  pos: number,
  top: boolean,
): EngineText => {
  const { text, spans } = spansOf(children);
  const level = node.type.name === "heading" ? (node.attrs.level as number) : 0;
  return { kind: "text", pos, text, spans, style: styleOf(node), level, top };
};

/**
 * tableOf builds a table: its rows, header rows, cells and column widths
 * @param pos the position of the table
 */
const tableOf = (
  node: Node,
  pos: number,
  widths: number[] | undefined,
): Content => {
  const grid = tableGrid(node);
  const caption = node.attrs.caption as string | null;
  const rows = grid.rows.map((row, index) => ({
    header: index < grid.headerRows,
    cells: row.flatMap((cell) => {
      if (!cell || cell.row !== index) return [];
      const paragraphs: EngineText[] = [];
      // the cell's position: the table's content, then its rows and cells
      const cellPos = pos + 1 + cell.offset;
      cell.node.descendants((child, offset) => {
        if (!child.isTextblock) return true;
        paragraphs.push(
          textOf(child, child.children, cellPos + 1 + offset + 1, false),
        );
        return false;
      });
      return [
        {
          paragraphs,
          header: cell.header,
          align: (cell.node.attrs.align as string | null) ?? undefined,
          col: cell.col,
          colspan: cell.colspan,
          rowspan: cell.rowspan,
        },
      ];
    }),
  }));
  return {
    kind: "table",
    pos,
    end: pos + node.nodeSize,
    rows,
    widths: widths?.length === grid.widths.length ? widths : grid.widths,
    ...(caption ? { caption } : {}),
  };
};

interface Space {
  before: number;
  after: number;
}

/**
 * flatten returns the records of a document's items in order
 * @param sizes the sizes of the images that are loaded
 */
export const flatten = (
  doc: Node,
  sizes: ImageSizes,
  frozen: FrozenWidths | null = null,
): FlatRecord[] => flattenBlocks(doc, 0, doc.childCount, sizes, frozen).flat();

/**
 * flattenBlocks returns the records of the document's top-level blocks from
 * `from` to before `to`, one list for each. A block's records depend only on
 * it and on the type of the block before it (the space above a heading), so
 * the blocks a change left alone keep theirs.
 */
export const flattenBlocks = (
  doc: Node,
  from: number,
  to: number,
  sizes: ImageSizes,
  frozen: FrozenWidths | null = null,
): FlatRecord[][] => {
  const records: FlatRecord[] = [];
  const quoteOf: number[][] = [];

  const push = (
    node: Node,
    pos: number,
    context: Context,
    space: Space,
    content: () => Content,
    extra: { marker?: string; key?: string } = {},
  ) => {
    const index = records.length;
    quoteOf.push(context.quotes);
    const item = (): EngineItem => ({
      ...content(),
      indent: context.indent,
      before: space.before,
      after: space.after,
      bars: context.bars,
      barsContinue: barsContinue(index),
      ...(extra.marker ? { marker: extra.marker } : {}),
    });
    records.push({
      node,
      pos,
      key: "",
      build: item,
    });
    const record = records[index];
    record.key = [
      context.indent,
      space.before,
      space.after,
      context.bars.join(" "),
      extra.marker ?? "",
      context.top ? 1 : 0,
      extra.key ?? "",
    ].join("|");
  };

  const barsContinue = (index: number) => {
    const quotes = quoteOf[index];
    const next = quoteOf[index + 1];
    return (
      quotes.length > 0 &&
      next !== undefined &&
      quotes.every((quote, depth) => next[depth] === quote)
    );
  };

  const block = (
    node: Node,
    pos: number,
    context: Context,
    space: Space,
    marker?: string,
  ) => {
    const name = node.type.name;
    if (name === "page_break") {
      push(node, pos, context, space, () => ({ kind: "break", pos }));
      return;
    }
    if (name === "horizontal_rule") {
      push(
        node,
        pos,
        context,
        { before: space.before + RULE_BEFORE, after: space.after + RULE_AFTER },
        () => ({ kind: "rule", pos }),
      );
      return;
    }
    if (name === "table") {
      const widths = frozen?.pos === pos ? frozen.widths : undefined;
      push(node, pos, context, space, () => tableOf(node, pos, widths), {
        key: widths ? widths.join(" ") : "",
      });
      return;
    }
    if (node.isTextblock) {
      textblock(node, pos, context, space, marker);
      return;
    }
    if (name === "blockquote") {
      const inner: Context = {
        ...context,
        indent: context.indent + QUOTE_INDENT,
        bars: [...context.bars, context.indent],
        quotes: [...context.quotes, pos],
        top: false,
      };
      children(
        node,
        pos,
        inner,
        space,
        () => ({ before: 0, after: 0 }),
        marker,
      );
      return;
    }
    if (name === "bullet_list" || name === "ordered_list") {
      const inner: Context = {
        ...context,
        indent: context.indent + LIST_INDENT,
        depth: context.depth + 1,
        top: false,
      };
      const start = (node.attrs.order as number | undefined) ?? 1;
      node.forEach((item, offset, index) => {
        const first = index === 0;
        const last = index === node.childCount - 1;
        const itemSpace = {
          before: ITEM_SPACE + (first ? space.before : 0),
          after: ITEM_SPACE + (last ? space.after : 0),
        };
        const bullet =
          name === "ordered_list"
            ? `${start + index}.`
            : BULLETS[context.depth % BULLETS.length];
        children(
          item,
          pos + 1 + offset,
          inner,
          itemSpace,
          (childIndex) => ({
            before: childIndex > 0 ? ITEM_SPACE : 0,
            after: 0,
          }),
          bullet,
        );
      });
      return;
    }
    // anything else holding blocks
    children(
      node,
      pos,
      context,
      space,
      () => ({ before: 0, after: 0 }),
      marker,
    );
  };

  // the blocks of a container: the first gets the space above it, the last
  // the space below; `own` is what each child has of its own
  const children = (
    node: Node,
    pos: number,
    context: Context,
    space: Space,
    own: (index: number) => Space,
    marker?: string,
  ) => {
    node.forEach((child, offset, index) => {
      const mine = own(index);
      block(
        child,
        pos + 1 + offset,
        context,
        {
          before: mine.before + (index === 0 ? space.before : 0),
          after: mine.after + (index === node.childCount - 1 ? space.after : 0),
        },
        index === 0 ? marker : undefined,
      );
    });
  };

  // a textblock, split around its images, which stand on lines of their own
  const textblock = (
    node: Node,
    pos: number,
    context: Context,
    space: Space,
    marker?: string,
  ) => {
    const runs: { children: Node[]; pos: number; image?: Node }[] = [];
    let run: Node[] = [];
    let runPos = pos + 1;
    node.forEach((child, offset) => {
      if (child.type.name === "image") {
        if (run.length) runs.push({ children: run, pos: runPos });
        runs.push({ children: [], pos: pos + 1 + offset, image: child });
        run = [];
        runPos = pos + 1 + offset + 1;
        return;
      }
      run.push(child);
    });
    if (run.length || runs.length === 0)
      runs.push({ children: run, pos: runPos });
    runs.forEach((piece, index) => {
      const pieceSpace = {
        before: index === 0 ? space.before : 0,
        after: index === runs.length - 1 ? space.after : 0,
      };
      const pieceMarker = index === 0 ? marker : undefined;
      if (piece.image) {
        const image = piece.image;
        const src = image.attrs.src as string;
        const size = sizes(src);
        push(
          image,
          piece.pos,
          context,
          pieceSpace,
          () => ({
            kind: "image",
            pos: piece.pos,
            src,
            width: size?.width ?? 0,
            height: size?.height ?? 0,
            alt: (image.attrs.alt as string | null) ?? "",
          }),
          {
            marker: pieceMarker,
            key: size ? `${size.width}x${size.height}` : "?",
          },
        );
        return;
      }
      // a paragraph split around images is keyed by its piece, so the
      // record's node stays the paragraph and the key tells the pieces apart
      push(
        node,
        piece.pos,
        context,
        pieceSpace,
        () => textOf(node, piece.children, piece.pos, context.top),
        { marker: pieceMarker, key: runs.length > 1 ? `piece${index}` : "" },
      );
    });
  };

  const top: Context = { indent: 0, bars: [], quotes: [], depth: 0, top: true };
  const blocks: FlatRecord[][] = [];
  let previous: Node | null = from > 0 ? doc.child(from - 1) : null;
  let offset = 0;
  for (let index = 0; index < from; index++)
    offset += doc.child(index).nodeSize;
  for (let index = from; index < to; index++) {
    const node = doc.child(index);
    const heading = node.type.name === "heading";
    const before =
      index === 0
        ? 0
        : heading
          ? previous?.type.name === "heading"
            ? HEADING_AFTER_HEADING
            : HEADING_BEFORE
          : 0;
    const after = heading
      ? HEADING_AFTER
      : node.type.name === "page_break"
        ? 0
        : BLOCK_AFTER;
    const first = records.length;
    block(node, offset, top, { before, after });
    blocks.push(records.slice(first));
    previous = node;
    offset += node.nodeSize;
  }
  return blocks;
};

/**
 * Change is what an update of the engine replaces: `delete` items from
 * `start` by `items`, moving the items after them by `shift` positions.
 */
export interface Change {
  start: number;
  delete: number;
  records: FlatRecord[];
  shift: number;
}

const same = (a: FlatRecord, b: FlatRecord) =>
  a.node === b.node && a.key === b.key;

/**
 * diff returns what changed between the records of two documents: the
 * unchanged records at the start and the end are kept. ProseMirror keeps the
 * nodes that didn't change, so comparing them is enough.
 * @param shift how many positions the document grew by
 */
export const diff = (
  before: FlatRecord[],
  after: FlatRecord[],
  shift: number,
): Change => {
  let start = 0;
  const shortest = Math.min(before.length, after.length);
  while (
    start < shortest &&
    same(before[start], after[start]) &&
    before[start].pos === after[start].pos
  ) {
    start++;
  }
  let end = 0;
  while (
    end < shortest - start &&
    same(before[before.length - 1 - end], after[after.length - 1 - end]) &&
    before[before.length - 1 - end].pos + shift ===
      after[after.length - 1 - end].pos
  ) {
    end++;
  }
  return {
    start,
    delete: before.length - start - end,
    records: after.slice(start, after.length - end),
    shift,
  };
};

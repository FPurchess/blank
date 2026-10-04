// The items the layout engine takes, see src-tauri/layout/src/model.rs.

// the styles the engine sets text in (TextKind in model.rs): a paragraph,
// a heading, or code
export type TextStyle =
  | "p"
  | "h1"
  | "h2"
  | "h3"
  | "h4"
  | "h5"
  | "h6"
  | "code"
  // small print, a form's text field may be in
  | "small";

export interface EngineSpan {
  from: number;
  to: number;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  underline?: boolean;
  link?: string;
}

// how a paragraph or heading at the top of the document is aligned; left
// isn't sent (see src/markdown/alignment.ts)
export type EngineAlign = "center" | "right" | "justify";

export interface EngineText {
  kind: "text";
  pos: number;
  text: string;
  spans: EngineSpan[];
  style: TextStyle;
  level: number;
  top: boolean;
  // one of the document's headings, in the PDF's bookmarks and in tables of
  // contents, see isListed in src/markdown/headings.ts
  listed?: boolean;
  // what it says while it's empty, e.g. a field's placeholder, on the
  // screen only
  hint?: string;
  // the hint stands for a picture to come: drawn in a box of a picture's size
  picture?: boolean;
  align?: EngineAlign;
}

// an entry of a table of contents: a heading's level and text
export interface TocEntry {
  level: number;
  text: string;
}

// a block in a table cell, where it stands in the cell's text
export type EngineCellBlock =
  | (EngineText & {
      // points from the left of the cell's text
      indent: number;
      // a list item's marker, on its first paragraph
      marker?: string;
      // quote bars, by their distance from the left of the cell's text
      bars: number[];
    })
  | {
      kind: "image";
      pos: number;
      src: string;
      // at its own size, which the engine fits to the cell; 0 × 0 while it
      // isn't loaded
      width: number;
      height: number;
      alt: string;
      // where it stands in lists and quotes, as a text block does; the
      // marker sits at its top
      indent?: number;
      marker?: string;
      bars?: number[];
    };

export interface EngineCell {
  // the cell's paragraphs, when it holds nothing else
  paragraphs: EngineText[];
  // what it holds otherwise: lists, quotes and images, see .claude/rules/layout-engine.md
  blocks?: EngineCellBlock[];
  header: boolean;
  align?: string;
  // the first column it covers, and how many columns and rows
  col: number;
  colspan: number;
  rowspan: number;
}

export type Content =
  | EngineText
  | { kind: "break"; pos: number }
  | { kind: "rule"; pos: number }
  // a block shown as a box with a label, e.g. a content block Blank can't
  // show
  | { kind: "boxed"; pos: number; label: string }
  // the listed headings up to `depth`, whose pages the engine sets in
  | {
      kind: "toc";
      pos: number;
      title: string;
      depth: number;
      entries: TocEntry[];
    }
  | {
      kind: "image";
      pos: number;
      src: string;
      width: number;
      height: number;
      alt: string;
      // the alignment of the paragraph it stands in
      align?: EngineAlign;
    }
  | {
      kind: "table";
      pos: number;
      end: number;
      rows: { header: boolean; cells: EngineCell[] }[];
      widths: number[];
      caption?: string;
    };

// The keys are written as they are here, in camelCase, and model.rs reads
// them by these names; src/engine/contract.test.ts and model.rs's
// reads_every_key_the_webview_sends check both sides.
export type EngineItem = Content & {
  indent: number;
  before: number;
  after: number;
  marker?: string;
  bars: number[];
  barsContinue: boolean;
  // starts a new page, e.g. a form whose definition says so
  pageStart?: boolean;
  // the column of a grid it stands in; its indent and bars count from the
  // column's left
  column?: EngineColumn;
  // the frame it stands in, outside the flow; its indent and bars count
  // from the frame's left
  frame?: EngineFrame;
  // where it starts at the highest, from the page's top edge
  flowTop?: number;
};

// a frame on the page (see the engine's `Frame`), in points from the page's
// top left edge
export interface EngineFrame {
  // the first item of its frame, which the engine counts the frames by
  start?: boolean;
  x: number;
  y: number;
  width: number;
}

// a column of a band of a grid, the columns of one of its rows, which stand
// side by side (see the engine's `Column`)
export interface EngineColumn {
  // the first item of its band, which the engine counts the bands by
  start?: boolean;
  index: number;
  // the widths of the band's columns: points, or shares of what is left
  tracks: { pt: number; fr: number }[];
  // the room between two columns, in points
  gap: number;
}

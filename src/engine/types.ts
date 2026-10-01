// The items the layout engine takes, see src-tauri/layout/src/model.rs.

export interface EngineSpan {
  from: number;
  to: number;
  bold?: boolean;
  italic?: boolean;
  code?: boolean;
  link?: string;
}

export interface EngineText {
  kind: "text";
  pos: number;
  text: string;
  spans: EngineSpan[];
  style: string;
  level: number;
  top: boolean;
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
  // what it holds otherwise: lists, quotes and images, see SEAM.md S2
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
  | {
      kind: "image";
      pos: number;
      src: string;
      width: number;
      height: number;
      alt: string;
    }
  | {
      kind: "table";
      pos: number;
      end: number;
      rows: { header: boolean; cells: EngineCell[] }[];
      widths: number[];
      caption?: string;
    };

export type EngineItem = Content & {
  indent: number;
  before: number;
  after: number;
  marker?: string;
  bars: number[];
  barsContinue: boolean;
};

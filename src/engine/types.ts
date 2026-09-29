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

export interface EngineCell {
  paragraphs: EngineText[];
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

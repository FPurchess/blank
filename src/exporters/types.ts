import { EditorState } from "prosemirror-state";

import type { Layout } from "../layout/resolve";

export interface ExportContext {
  // path of the document, to resolve relative images; null if unsaved
  docPath: string | null;
  // the page to lay the document out on
  layout: Layout;
  // the pages to export, by their index, if not all (a PDF of the pages
  // chosen to print)
  pages?: number[];
}

export interface ExportResult {
  contents: Uint8Array;
  // what the export had to leave out, shown with the success notification
  warnings: string[];
  // the number of pages written, if the format has a fixed one
  pages?: number;
}

export type exporterFunc = (
  state: EditorState,
  context: ExportContext,
) => Promise<ExportResult>;

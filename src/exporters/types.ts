import { EditorState } from "prosemirror-state";

import type { Layout } from "../layout/resolve";
import type { Signing } from "../markdown/blocks/signature";

export interface ExportContext {
  // path of the document, to resolve relative images; null if unsaved
  docPath: string | null;
  // the page to lay the document out on
  layout: Layout;
  // the pages to export, by their index, if not all (a PDF of the pages
  // chosen to print)
  pages?: number[];
  // for a signed PDF: the signature block to fill in, at `pos`, with the
  // picture of the signature (a data: URL) and who signs where and when
  signed?: { pos: number; src: string; signing: Signing };
}

export interface ExportResult {
  contents: Uint8Array;
  // what the export had to leave out, shown with the success notification
  warnings: string[];
  // the number of pages written, if the format has a fixed one
  pages?: number;
  // for a signed PDF: where the filled in signature block is, in points
  // from the top left of its page (counted from 0)
  signatureBox?: {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

export type exporterFunc = (
  state: EditorState,
  context: ExportContext,
) => Promise<ExportResult>;

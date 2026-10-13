import { EditorState } from "prosemirror-state";

import type { Layout } from "../layout/resolve";
import type { PageBox } from "../engine/boxes";
import type { SignedBlock } from "../engine/flatten";

export interface ExportContext {
  // path of the document, to resolve relative images; null if unsaved
  docPath: string | null;
  // the page to lay the document out on
  layout: Layout;
  // the pages to export, by their index, if not all (a PDF of the pages
  // chosen to print)
  pages?: number[];
  // for a signed PDF: the signature block to fill in
  signed?: SignedBlock;
  // for a signed PDF: the positions of the other signature blocks, whose
  // boxes the result gives
  others?: number[];
}

export interface ExportResult {
  contents: Uint8Array;
  // what the export had to leave out, shown with the success notification
  warnings: string[];
  // the number of pages written, if the format has a fixed one
  pages?: number;
  // for a signed PDF: where the filled in signature block is, in points
  // from the top left of its page (counted from 0)
  signatureBox?: PageBox;
  // where the blocks of `others` are, in their order, the same way; null
  // for one the PDF doesn't show
  otherBoxes?: (PageBox | null)[];
}

export type exporterFunc = (
  state: EditorState,
  context: ExportContext,
) => Promise<ExportResult>;

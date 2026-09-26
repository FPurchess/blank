import { EditorState } from "prosemirror-state";

export interface ExportContext {
  // path of the document, to resolve relative images; null if unsaved
  docPath: string | null;
}

export interface ExportResult {
  contents: Uint8Array;
  // what the export had to leave out, shown with the success notification
  warnings: string[];
}

export type exporterFunc = (
  state: EditorState,
  context: ExportContext,
) => Promise<ExportResult>;

import type { Command, EditorState } from "prosemirror-state";

import { type DialogFilter, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { config } from "../../config";
import {
  type ExportContext,
  type ExportResult,
  type exporterFunc,
} from "../../exporters";
import { describePaper, layoutWarnings } from "../../layout/describe";
import { resolveLayout } from "../../layout/resolve";
import { localeUnit } from "../../layout/paper";
import { frontmatterOf } from "../../markdown";
import { extname } from "../../paths";
import { engineStatus } from "../../engine/engine";
import { announce, path } from "../../state";
import suggestPath from "./suggestPath";
import { errorMessage } from "../../errors";
import { logError } from "../../log";

// the title of the PDF export's notifications
export const PDF_EXPORT = "PDF-Export";

// what the PDF export says while the layout engine couldn't start, e.g.
// where the webview can't run it, or when the user switched it off
export const PDF_UNAVAILABLE =
  "The PDF export needs the page layout, which couldn't start.";

/**
 * isEmpty checks whether the document has neither text nor images
 */
export const isEmpty = (state: EditorState) => {
  let empty = state.doc.textContent.trim().length === 0;
  state.doc.descendants((node) => {
    if (node.type.name === "image") empty = false;
    return empty;
  });
  return empty;
};

export interface ExportRequest {
  // the notifications' title, e.g. "PDF-Export"
  title: string;
  exporter: exporterFunc;
  filters?: DialogFilter[];
  // what the suggested file name gets before its extension, e.g. " signed"
  suffix?: string;
  // more of the context: the pages chosen to print, or the signature block
  // a signed PDF fills in
  context?: Pick<ExportContext, "pages" | "signed">;
  // told the file it wrote, e.g. to remember where the user signed
  written?: (dest: string) => void;
  // what is written instead of the export's contents, e.g. the PDF signed
  finish?: (result: ExportResult) => Promise<Uint8Array>;
}

/**
 * canExport tells whether the document can be exported, and says why not:
 * an empty document, or a PDF without the page layout
 */
export const canExport = (state: EditorState, request: ExportRequest) => {
  const { title, filters } = request;
  if (isEmpty(state)) {
    sendNotification({
      title,
      body: "Your document is empty. There is nothing to export.",
    });
    return false;
  }
  // the PDF is written from the engine's layout. After the engine failed
  // while Blank ran, the export still works with one of its own (see
  // src/engine/pdf.ts).
  const status = engineStatus();
  if (
    filters?.[0]?.extensions[0] === "pdf" &&
    (status === "off" || status === "unavailable")
  ) {
    sendNotification({ title, body: PDF_UNAVAILABLE });
    announce(PDF_UNAVAILABLE);
    return false;
  }
  return true;
};

/**
 * runExport asks where to write the file, then exports the document there
 * and says how it went. The save dialog comes first, so cancelling it costs
 * nothing.
 * @param docPath the document's file, read before anything awaits, since
 *   another tab may show by then
 */
export const runExport = async (
  state: EditorState,
  docPath: string | null,
  { title, exporter, filters, suffix, context, written, finish }: ExportRequest,
) => {
  const extension = filters?.[0]?.extensions[0];
  try {
    const dest = await save({
      filters,
      defaultPath: extension
        ? suggestPath(extension, undefined, suffix)
        : undefined,
    });
    if (dest === null) return;

    // the export writes one format, so a name with another extension (e.g.
    // an existing .md) is a mistake. Linux dialogs don't add the extension,
    // so a name without one is written as typed.
    const destExtension = extname(dest);
    if (extension && destExtension && destExtension !== extension) {
      throw new Error(`choose a .${extension} file name`);
    }

    const { layout, problems } = resolveLayout(
      frontmatterOf(state.doc),
      config.value.layout.page,
    );
    const result = await exporter(state, { docPath, layout, ...context });
    const { warnings, pages } = result;
    await writeFile(dest, finish ? await finish(result) : result.contents);
    written?.(dest);

    // e.g. "Exported 3 A4 pages", or for Word, which lays out the pages
    // itself, "Exported on A4 pages"
    const paper = describePaper(layout, localeUnit());
    const exported =
      pages === undefined
        ? `Exported on ${paper} pages`
        : `Exported ${pages} ${paper} ${pages === 1 ? "page" : "pages"}`;
    const messages = [exported, ...layoutWarnings(problems), ...warnings];
    sendNotification({ title, body: messages.join(". ") });
  } catch (err: unknown) {
    logError(`failed to export as ${extension ?? "a file"}`, err);
    sendNotification({
      title,
      body: `Failed to export file: ${errorMessage(err)}`,
    });
  }
};

export default (
    title: string,
    exporter: exporterFunc,
    filters?: DialogFilter[],
  ): Command =>
  (state, dispatch) => {
    // asked whether it can run, e.g. by the main menu: only with something
    // to export, and nothing done
    if (!dispatch) return !isEmpty(state);
    const request = { title, exporter, filters };
    if (!canExport(state, request)) return isEmpty(state) ? false : true;
    // the document's file now, before another tab may show
    void runExport(state, path.value, request);
    return true;
  };

import type { Command, EditorState } from "prosemirror-state";

import { type DialogFilter, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { config } from "../../config";
import { type exporterFunc } from "../../exporters";
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
  // the notification's title
  title: string;
  exporter: exporterFunc;
  filters?: DialogFilter[];
  state: EditorState;
  // the document's file, to resolve relative images; null if unsaved
  docPath: string | null;
  // the pages to export, by their index, if not all
  pages?: number[];
}

/**
 * exportFile asks where to save the export, writes it, and tells how it
 * went in a notification
 */
export const exportFile = ({
  title,
  exporter,
  filters,
  state,
  docPath,
  pages,
}: ExportRequest) => {
  const extension = filters?.[0]?.extensions[0];
  (async () => {
    const dest = await save({
      filters,
      defaultPath: extension ? suggestPath(extension) : undefined,
    });

    if (dest === null) {
      return null;
    }

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
    const exported = await exporter(state, {
      docPath,
      layout,
      ...(pages && { pages }),
    });
    await writeFile(dest, exported.contents);

    // e.g. "Exported 3 A4 pages", or for Word, which lays out the pages
    // itself, "Exported on A4 pages"
    const paper = describePaper(layout, localeUnit());
    const count = exported.pages;
    const done =
      count === undefined
        ? `Exported on ${paper} pages`
        : `Exported ${count} ${paper} ${count === 1 ? "page" : "pages"}`;
    return [done, ...layoutWarnings(problems), ...exported.warnings];
  })()
    .then((messages: string[] | null) => {
      if (messages) sendNotification({ title, body: messages.join(". ") });
    })
    .catch((err: unknown) => {
      logError(`failed to export as ${extension ?? "a file"}`, err);
      sendNotification({
        title,
        body: `Failed to export file: ${errorMessage(err)}`,
      });
    });
};

export default (
    title: string,
    exporter: exporterFunc,
    filters?: DialogFilter[],
  ): Command =>
  (state) => {
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
      return true;
    }

    // the document's file now, before another tab may show
    exportFile({ title, exporter, filters, state, docPath: path.value });
    return true;
  };

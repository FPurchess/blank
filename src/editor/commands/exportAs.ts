import type { Command, EditorState } from "prosemirror-state";

import { type DialogFilter, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { config } from "../../config";
import { type exporterFunc } from "../../exporters";
import { describePaper, layoutWarnings } from "../../layout/describe";
import { resolveLayout } from "../../layout/resolve";
import { localeUnit } from "../../layout/paper";
import { extname } from "../../paths";
import { engineStatus } from "../../engine/engine";
import { announce, path } from "../../state";
import suggestPath from "./suggestPath";
import { errorMessage } from "../../errors";

// what the PDF export says while the layout engine couldn't start, e.g.
// where the webview can't run it, or when the user switched it off
export const PDF_UNAVAILABLE =
  "The PDF export needs the page layout, which couldn't start.";

/**
 * isEmpty checks whether the document has neither text nor images
 */
const isEmpty = (state: EditorState) => {
  let empty = state.doc.textContent.trim().length === 0;
  state.doc.descendants((node) => {
    if (node.type.name === "image") empty = false;
    return empty;
  });
  return empty;
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

    const extension = filters?.[0]?.extensions[0];

    // the PDF is written from the engine's layout. After the engine failed
    // while Blank ran, the export still works with one of its own (see
    // src/engine/pdf.ts).
    const status = engineStatus();
    if (extension === "pdf" && (status === "off" || status === "unavailable")) {
      sendNotification({ title, body: PDF_UNAVAILABLE });
      announce(PDF_UNAVAILABLE);
      return true;
    }

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
        state.doc.attrs.frontmatter as string | null,
        config.value.layout.page,
      );
      const { contents, warnings, pages } = await exporter(state, {
        docPath: path.value,
        layout,
      });
      await writeFile(dest, contents);

      // e.g. "Exported 3 A4 pages", or for Word, which lays out the pages
      // itself, "Exported on A4 pages"
      const paper = describePaper(layout, localeUnit());
      const exported =
        pages === undefined
          ? `Exported on ${paper} pages`
          : `Exported ${pages} ${paper} ${pages === 1 ? "page" : "pages"}`;
      return [exported, ...layoutWarnings(problems), ...warnings];
    })()
      .then((messages: string[] | null) => {
        if (messages) sendNotification({ title, body: messages.join(". ") });
      })
      .catch((err: unknown) => {
        sendNotification({
          title,
          body: `Failed to export file: ${errorMessage(err)}`,
        });
      });

    return true;
  };

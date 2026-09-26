import type { Command, EditorState } from "prosemirror-state";

import { type DialogFilter, save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { type exporterFunc } from "../../exporters";
import { extname } from "../../paths";
import { path } from "../../state";
import suggestPath from "./suggestPath";
import { errorMessage } from "../../errors";

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

      const { contents, warnings } = await exporter(state, {
        docPath: path.value,
      });
      await writeFile(dest, contents);

      return warnings;
    })()
      .then((warnings: string[] | null) => {
        if (warnings) {
          sendNotification({
            title,
            body: ["Your file has been exported", ...warnings].join(". "),
          });
        }
      })
      .catch((err: unknown) => {
        sendNotification({
          title,
          body: `Failed to export file: ${errorMessage(err)}`,
        });
      });

    return true;
  };

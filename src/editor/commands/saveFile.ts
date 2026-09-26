import type { Command, EditorState } from "prosemirror-state";
import { defaultMarkdownSerializer } from "prosemirror-markdown";

import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { importedFrom, path } from "../../state";
import { extname } from "../../paths";
import suggestPath from "./suggestPath";

// files that saving markdown into would destroy, e.g. the Word document a
// document was imported from
const NOT_MARKDOWN = [
  "docx",
  "docm",
  "dotx",
  "dotm",
  "doc",
  "odt",
  "rtf",
  "pages",
  "pdf",
];

const isMarkdownTarget = (target: string) =>
  !NOT_MARKDOWN.includes(extname(target));

export interface Options {
  force?: boolean;
}

export const _saveFile = async (state: EditorState, options: Options) => {
  try {
    let target = path.value;
    // a path to another format is left over from before Word documents were
    // imported, and must not be overwritten
    if (
      options.force === true ||
      target === null ||
      !isMarkdownTarget(target)
    ) {
      target = await save({
        filters: [{ name: "Markdown", extensions: ["md"] }],
        defaultPath: suggestPath("md"),
      });
      if (target === null) {
        return;
      }
      if (!isMarkdownTarget(target)) {
        sendNotification(
          `Saving writes markdown, which would destroy the .${extname(target)} file. Choose a .md file name, or export with Mod+Alt+W for Word.`,
        );
        return;
      }
    }

    const content = defaultMarkdownSerializer.serialize(state.doc) ?? "";
    await writeTextFile(target, content);
    // only a successful write moves the document to the new file
    path.value = target;
    importedFrom.value = null;

    sendNotification("Your file has been saved");
  } catch (err) {
    if (err instanceof Error) {
      sendNotification(`Failed to save file: ${err.message}`);
    } else if (typeof err === "string") {
      sendNotification(`Failed to save file: ${err}`);
    } else {
      sendNotification(`Failed to save file: ${JSON.stringify(err)}`);
    }
  }
};

export default (options: Options = { force: false }): Command =>
  (state) => {
    _saveFile(state, Object.freeze(options));
    return true;
  };

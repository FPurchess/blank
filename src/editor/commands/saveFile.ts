import type { EditorState } from "prosemirror-state";
import { serializeMarkdown } from "../../markdown";

import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { extname } from "../../paths";
import type { DocumentFile } from "../document";
import suggestPath from "./suggestPath";
import { errorMessage } from "../../errors";
import { MARKDOWN_FILTER, NOT_MARKDOWN } from "../../formats";
import { logError } from "../../log";
import { CommandIdentifier } from "../../config";
import { commandShortcut } from "../keyBindings";

const isMarkdownTarget = (target: string) =>
  !NOT_MARKDOWN.includes(extname(target));

/**
 * exportKey names the key of the Word export, e.g. " with Ctrl+Alt+W", or
 * nothing when it has none
 */
const exportKey = () => {
  const key = commandShortcut(CommandIdentifier.EXPORT_DOCX);
  return key ? ` with ${key}` : "";
};

export interface Options {
  force?: boolean;
}

/**
 * _saveFile writes the document of `state`, which comes from `file`, as
 * markdown: to its file, or where the user chooses
 * @returns the file it was written to, or null if it wasn't
 */
export const _saveFile = async (
  state: EditorState,
  file: DocumentFile,
  options: Options,
): Promise<string | null> => {
  try {
    let target = file.path;
    // a path to another format is left over from before Word documents were
    // imported, and must not be overwritten
    if (
      options.force === true ||
      target === null ||
      !isMarkdownTarget(target)
    ) {
      target = await save({
        filters: [MARKDOWN_FILTER],
        defaultPath: suggestPath("md", file),
      });
      if (target === null) {
        return null;
      }
      if (!isMarkdownTarget(target)) {
        sendNotification(
          `Saving writes markdown, which would destroy the .${extname(target)} file. Choose a .md file name, or export it for Word${exportKey()}.`,
        );
        return null;
      }
    }

    const content = serializeMarkdown(state.doc);
    await writeTextFile(target, content);
    sendNotification("Your file has been saved");
    return target;
  } catch (err) {
    logError("failed to save the file", err);
    sendNotification(`Failed to save file: ${errorMessage(err)}`);
    return null;
  }
};

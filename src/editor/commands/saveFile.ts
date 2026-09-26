import type { Command, EditorState } from "prosemirror-state";
import { defaultMarkdownSerializer } from "prosemirror-markdown";

import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { path } from "../../state";

export interface Options {
  force?: boolean;
}

export const _saveFile = async (state: EditorState, options: Options) => {
  try {
    let target = path.value;
    if (options.force === true || target === null) {
      target = await save({
        filters: [{ name: "Markdown", extensions: ["md"] }],
      });
      if (target === null) {
        return;
      }
    }

    const content = defaultMarkdownSerializer.serialize(state.doc) ?? "";
    await writeTextFile(target, content);
    // only a successful write moves the document to the new file
    path.value = target;

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

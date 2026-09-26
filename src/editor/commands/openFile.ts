import type { Command } from "prosemirror-state";

import { open } from "@tauri-apps/plugin-dialog";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { readDocumentFromFile } from "../document";
import { errorMessage } from "../../errors";

const defaultOpenDialogOptions = {
  // the first filter is the one Linux dialogs start with
  filters: [
    { name: "Documents", extensions: ["md", "docx"] },
    { name: "Markdown", extensions: ["md"] },
    { name: "Word Document", extensions: ["docx"] },
  ],
};

export default (): Command => (_state, _dispatch, view) => {
  if (!view) return false;

  (async () => {
    let newPath: string | null;
    try {
      newPath = await open(defaultOpenDialogOptions);
    } catch (err) {
      console.error(`Failed to open file: ${errorMessage(err)}`);
      sendNotification(`Failed to open file: ${errorMessage(err)}`);
      return;
    }
    if (!newPath) return;

    // the view may have changed while the dialog was open
    const next = await readDocumentFromFile(view.state, newPath);
    if (next) view.updateState(next);
  })();

  return true;
};

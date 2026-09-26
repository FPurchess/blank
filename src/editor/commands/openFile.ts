import type { Command } from "prosemirror-state";

import { open } from "@tauri-apps/plugin-dialog";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { readDocumentFromFile } from "../document";

const defaultOpenDialogOptions = {
  filters: [{ name: "Markdown", extensions: ["md"] }],
};

export default (): Command => (state) => {
  (async () => {
    let newPath: string | null;
    try {
      newPath = await open(defaultOpenDialogOptions);
    } catch (err) {
      console.error(`Failed to open file: ${JSON.stringify(err)}`);
      sendNotification(`Failed to open file: ${JSON.stringify(err)}`);
      return;
    }
    if (newPath) await readDocumentFromFile(state, newPath);
  })();

  return true;
};

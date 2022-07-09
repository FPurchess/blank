import { Command } from "prosemirror-state";

import { invoke } from "@tauri-apps/api";
import { message, save } from "@tauri-apps/api/dialog";

import { htmlSerializer } from "../serializers";

import css from "../scss/main.scss";

export default (): Command => (state) => {
  const html = htmlSerializer(state.doc).trim();
  const isEmpty = html.replaceAll(/<[^>]*>/g, "").length === 0;

  if (isEmpty) {
    message("Your document is empty. There is nothing to export.", {
      title: "PDF Export",
      type: "error",
    });
    return false;
  }

  (async () => {
    const pdfPath = await save({
      filters: [
        {
          name: "PDF-File",
          extensions: ["pdf"],
        },
      ],
    });

    const content = `<!DOCTYPE html><html><head><style>${css}</style></head><body data-theme="light">${html}</body></html>`;
    await invoke("export_as_pdf", { path: pdfPath, content });
  })();

  return true;
};

import { Command } from "prosemirror-state";

import { invoke } from "@tauri-apps/api";
import { message, open, save } from "@tauri-apps/api/dialog";

import {
  htmlSerializer,
  markdownParser,
  markdownSerializer,
} from "./serializers";
import { updateUIHeader } from "./ui";
import css from "./main.scss";

let path: string | null = null;

export const newFile = (): Command => (state, dispatch) => {
  if (dispatch) {
    dispatch(state.tr.delete(0, state.doc.content.size));
    path = null;
    updateUIHeader(path);
    return true;
  }

  return false;
};

export const saveFile =
  (force = false): Command =>
  (state) => {
    (async () => {
      if (force || path === null) {
        const newPath = await save({
          filters: [{ name: "Markdown", extensions: ["md"] }],
        });
        if (typeof newPath === "string") {
          path = newPath;
          updateUIHeader(path);
        } else {
          return;
        }
      }
      const content = markdownSerializer.serialize(state.doc);

      await invoke("save_file", { path, content });
    })();

    return true;
  };

export const openFile = (): Command => (state, dispatch) => {
  (async () => {
    const newPath = await open({
      filters: [{ name: "Markdown", extensions: ["md"] }],
    });
    if (typeof newPath === "string") {
      path = newPath;
      updateUIHeader(path);

      const content = await invoke<string>("open_file", { path });

      const doc = markdownParser.parse(content);
      if (dispatch && doc !== null) {
        dispatch(state.tr.replaceWith(0, state.doc.content.size, doc));
      }
    }
  })();

  return true;
};

export const exportAsPDF = (): Command => (state) => {
  const html = htmlSerializer(state.doc).trim();
  const isEmpty = html.replaceAll(/<[^>]*>/, "").length === 0;

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

export const toggleTheme = (): Command => () => {
  const body = document.querySelector("body");
  if (body) {
    const theme = body.dataset.theme;
    body.dataset.theme = theme === "dark" ? "light" : "dark";
  }
  return true;
};

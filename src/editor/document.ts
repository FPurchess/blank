import { path as tauriPath } from "@tauri-apps/api";
import { getMatches } from "@tauri-apps/plugin-cli";
import { readTextFile, exists } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { EditorState } from "prosemirror-state";
import { defaultMarkdownParser } from "prosemirror-markdown";
import { Node } from "prosemirror-model";

import { path as _path, transaction } from "../state";
import { getDocumentFromStorage, getPathfromStorage } from "../storage";

import welcomeMessage from "./welcome.md?raw";

/**
 * Applies a new document to the editor state. It builds a fresh state with the
 * same plugins, so the undo history starts empty and undo can't revert the
 * loaded document.
 * @param state The current EditorState
 * @param doc The new document to set
 * @param path path to the document (optional)
 * @returns the new EditorState
 */
export function applyDocument(
  state: EditorState,
  doc: Node,
  path?: string | null,
): EditorState {
  const next = EditorState.create({
    schema: state.schema,
    doc,
    plugins: state.plugins,
  });
  if (path) _path.value = path;
  // storage persists the transaction's doc and the UI renders it
  transaction.value = next.tr;
  return next;
}

/**
 * sets the welcome document to the editor state
 * @param state The EditorState to mutate
 * @returns the new EditorState
 */
export const setDefaultDocument = (state: EditorState): EditorState => {
  const doc = defaultMarkdownParser.parse(welcomeMessage);
  return applyDocument(state, doc);
};

/**
 * restores the document from storage if it exists
 * @param state The EditorState to mutate
 * @returns the new EditorState
 */
export const restoreDocument = async (
  state: EditorState,
): Promise<EditorState | undefined> => {
  const doc = await getDocumentFromStorage();
  if (doc) return applyDocument(state, doc, await getPathfromStorage());
};

/**
 * reads a document from a given file path
 * @param state The EditorState to mutate
 * @param path file path to load the document from
 * @returns the new EditorState
 */
export const readDocumentFromFile = async (
  state: EditorState,
  path: string,
  silent = false,
): Promise<EditorState | undefined> => {
  if (!path) return;
  const resolvedPath = await tauriPath.resolve(path);
  if (!(await exists(resolvedPath))) {
    console.error(`File does not exist: ${resolvedPath}`);
    if (!silent) sendNotification(`File not found: ${resolvedPath}`);
    return;
  }

  let doc: Node | undefined;
  try {
    const content = await readTextFile(resolvedPath);
    doc = defaultMarkdownParser.parse(content);
  } catch (err) {
    console.error(`Failed to read file: ${JSON.stringify(err)}`);
    if (!silent)
      sendNotification(`Failed to read file: ${JSON.stringify(err)}`);
    return;
  }
  // the resolved path keeps working when Blank is started from another directory
  if (doc) return applyDocument(state, doc, resolvedPath);
};

/**
 * reads a document from the CLI arguments
 * @param state EditorState to mutate
 * @returns the new EditorState
 */
export const readDocumentFromCliArgs = async (
  state: EditorState,
): Promise<EditorState | undefined> => {
  const matches = await getMatches();
  const filePath = matches.args?.path?.value as string | undefined;
  if (filePath) return readDocumentFromFile(state, filePath);
};

/**
 * apply initial documents by either opening the file passed via command-line argument,
 * restoring it from storage or setting the default document
 * @param state EditorState to mutate
 * @returns the new EditorState
 */
export const applyInitialDocument = async (
  state: EditorState,
): Promise<EditorState> => {
  return (
    (await readDocumentFromCliArgs(state)) ??
    (await restoreDocument(state)) ??
    setDefaultDocument(state)
  );
};

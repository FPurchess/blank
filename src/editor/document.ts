import { path as tauriPath } from "@tauri-apps/api";
import { getMatches } from "@tauri-apps/plugin-cli";
import { readTextFile, exists } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import localforage from "localforage";
import { EditorState } from "prosemirror-state";
import { defaultMarkdownParser } from "prosemirror-markdown";
import { Node } from "prosemirror-model";

import { path as _path, transaction } from "../state";
import { getDocumentFromStorage, getPathfromStorage } from "../storage";

import welcomeMessage from "./welcome.md?raw";

/**
 * describeError turns anything thrown (Tauri rejects with plain strings) into
 * readable text
 */
const describeError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
};

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
  let matches: Awaited<ReturnType<typeof getMatches>>;
  try {
    matches = await getMatches();
  } catch (error) {
    // e.g. more than one file or an unknown flag was passed
    console.error("failed to read the command-line arguments", error);
    sendNotification(
      `Blank opens one file at a time, so the command-line arguments were ignored: ${describeError(error)}`,
    );
    return;
  }
  const filePath = matches.args?.path?.value as string | undefined;
  if (filePath) return readDocumentFromFile(state, filePath);
};

/**
 * backupStoredDocument copies the raw stored document to `doc-backup`, so
 * autosave can't overwrite the only copy of a document that can't be restored
 */
const backupStoredDocument = async (): Promise<boolean> => {
  try {
    const raw = await localforage.getItem("doc");
    if (raw === null) return false;
    await localforage.setItem("doc-backup", raw);
    return true;
  } catch (error) {
    console.error("failed to back up the stored document", error);
    return false;
  }
};

/**
 * apply initial documents by either opening the file passed via command-line argument,
 * restoring it from storage or setting the default document. A source that
 * fails is skipped, so the editor always gets a document.
 * @param state EditorState to mutate
 * @returns the new EditorState
 */
export const applyInitialDocument = async (
  state: EditorState,
): Promise<EditorState> => {
  try {
    const fromCli = await readDocumentFromCliArgs(state);
    if (fromCli) return fromCli;
  } catch (error) {
    console.error("failed to open the file from the command line", error);
    sendNotification(`Failed to open file: ${describeError(error)}`);
  }

  try {
    const restored = await restoreDocument(state);
    if (restored) return restored;
  } catch (error) {
    console.error("failed to restore the stored document", error);
    const backedUp = await backupStoredDocument();
    const kept = backedUp ? ' A copy was kept as "doc-backup".' : "";
    sendNotification(
      `Your last document couldn't be restored, so Blank starts with the welcome document.${kept} ${describeError(error)}`,
    );
  }

  return setDefaultDocument(state);
};

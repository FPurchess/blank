import { path as tauriPath } from "@tauri-apps/api";
import { exists, readFile, readTextFile, stat } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { EditorState } from "prosemirror-state";
import { parseMarkdown, schema } from "../markdown";
import { Node } from "prosemirror-model";

import { path as _path, importedFrom, transaction } from "../state";
import { basename, extname } from "../paths";
import { errorMessage } from "../errors";
import { UNREADABLE_EXTENSIONS, WORD_EXTENSIONS } from "../formats";

import welcomeMessage from "./welcome.md?raw";

// Where a document comes from: its markdown file (`path`), or the Word
// document an untitled document was imported from (`importedFrom`)
export interface DocumentFile {
  path: string | null;
  importedFrom: string | null;
}

// A document as read from a file, before it is shown
export interface LoadedDocument extends DocumentFile {
  doc: Node;
}

/**
 * documentState builds the editor state of `doc`, with the plugins of `base`.
 * The undo history starts empty, so undo can't revert the loaded document.
 */
export const documentState = (base: EditorState, doc: Node): EditorState => {
  const created = EditorState.create({
    schema: base.schema,
    doc,
    plugins: base.plugins,
  });
  // plugins that keep the document in shape, like the paragraphs the table
  // guard keeps next to tables, do it right away, not with the first click,
  // which would then land where the content has moved to
  return created.apply(created.tr);
};

/**
 * showDocument publishes `state` and where it comes from as the document,
 * before the view gets it: storage persists the transaction's doc, and the
 * page view lays the document out with the path of its images (see pageSync)
 */
export const showDocument = (state: EditorState, file: DocumentFile) => {
  transaction.value = state.tr;
  _path.value = file.path;
  importedFrom.value = file.importedFrom;
};

/**
 * emptyDocument returns a document with one empty paragraph
 */
export const emptyDocument = (): Node => schema.topNodeType.createAndFill()!;

/**
 * welcomeDocument returns the document Blank starts with the first time
 */
export const welcomeDocument = (): Node => parseMarkdown(welcomeMessage);

// Word documents larger than this are refused
const MAX_WORD_BYTES = 50 * 1024 * 1024;

/**
 * importWordDocument imports the Word document at `path` into an untitled
 * document. The Word document itself is never written to.
 */
const importWordDocument = async (
  path: string,
  silent: boolean,
): Promise<LoadedDocument | undefined> => {
  const name = basename(path);
  const fail = (reason: string) => {
    console.error(`Failed to import ${path}: ${reason}`);
    if (!silent) sendNotification(`Failed to import ${name}: ${reason}`);
  };

  let result;
  try {
    if ((await stat(path)).size > MAX_WORD_BYTES) {
      fail("the file is larger than 50 MB");
      return;
    }
    const { importDocx } = await import("../importers/docx");
    result = await importDocx(await readFile(path));
  } catch (err) {
    fail(errorMessage(err));
    return;
  }

  if (!silent) {
    sendNotification(
      [
        `Imported ${name}. Save it with Mod+S as a markdown file`,
        ...(result.page ? [`Its ${result.page} pages came along`] : []),
        ...result.warnings,
      ].join(". "),
    );
  }
  // untitled, so saving can't overwrite the Word document
  return { doc: result.doc, path: null, importedFrom: path };
};

/**
 * readDocument reads the document at `path`: a markdown file, or a Word
 * document that is imported into an untitled one. It never throws: what
 * goes wrong is logged, and told unless `silent`.
 * @returns the document, or undefined when it can't be read
 */
export const readDocument = async (
  path: string,
  silent = false,
): Promise<LoadedDocument | undefined> => {
  if (!path) return;
  // logs why a file can't be opened, and tells the user unless `silent`
  const report = (log: string, message: string) => {
    console.error(log);
    if (!silent) sendNotification(message);
  };
  // the resolved path keeps working when Blank is started from another directory
  let resolvedPath: string;
  let found: boolean;
  try {
    resolvedPath = await tauriPath.resolve(path);
    found = await exists(resolvedPath);
  } catch (err) {
    // e.g. a file it isn't allowed to look at
    const message = `Failed to open file: ${errorMessage(err)}`;
    report(`${message} (${path})`, message);
    return;
  }
  if (!found) {
    report(
      `File does not exist: ${resolvedPath}`,
      `File not found: ${resolvedPath}`,
    );
    return;
  }

  const extension = extname(resolvedPath);
  if (WORD_EXTENSIONS.includes(extension)) {
    return importWordDocument(resolvedPath, silent);
  }
  if (UNREADABLE_EXTENSIONS.includes(extension)) {
    report(
      `Can't read .${extension} files: ${resolvedPath}`,
      `Blank can't read .${extension} files. Save it as .docx and open that.`,
    );
    return;
  }

  try {
    const doc = parseMarkdown(await readTextFile(resolvedPath));
    return { doc, path: resolvedPath, importedFrom: null };
  } catch (err) {
    const message = `Failed to read file: ${errorMessage(err)}`;
    report(message, message);
  }
};

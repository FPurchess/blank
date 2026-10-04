import { importedFrom, path } from "../../state";
import { replaceExtension } from "../../paths";
import type { DocumentFile } from "../document";

/**
 * suggestPath suggests the file name for a save dialog: the document's own
 * name with `extension`, e.g. "/docs/report.pdf" for "/docs/report.md", or
 * the name of the Word document it was imported from
 * @param extension file extension without the dot
 * @param file where the document comes from, the shown one's by default
 * @returns the path, or undefined for an untitled document
 */
export default (
  extension: string,
  file: DocumentFile = { path: path.value, importedFrom: importedFrom.value },
) => {
  const base = file.path ?? file.importedFrom;
  return base === null ? undefined : replaceExtension(base, extension);
};

import { importedFrom, path } from "../../state";
import { replaceExtension } from "../../paths";

/**
 * suggestPath suggests the file name for a save dialog: the document's own
 * name with `extension`, e.g. "/docs/report.pdf" for "/docs/report.md", or
 * the name of the Word document it was imported from
 * @param extension file extension without the dot
 * @returns the path, or undefined for an untitled document
 */
export default (extension: string) => {
  const base = path.value ?? importedFrom.value;
  return base === null ? undefined : replaceExtension(base, extension);
};

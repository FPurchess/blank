import { path } from "../../state";
import { replaceExtension } from "../../paths";

/**
 * suggestPath suggests the file name for a save dialog: the document's own
 * name with `extension`, e.g. "/docs/report.pdf" for "/docs/report.md"
 * @param extension file extension without the dot
 * @returns the path, or undefined for an untitled document
 */
export default (extension: string) =>
  path.value === null ? undefined : replaceExtension(path.value, extension);

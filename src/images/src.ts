import { dirname } from "../paths";

export type SrcKind = "data" | "remote" | "absolute" | "relative";

/**
 * classifySrc tells where the image `src` of a document points to
 */
export const classifySrc = (src: string): SrcKind => {
  if (/^data:/i.test(src)) return "data";
  if (/^https?:/i.test(src)) return "remote";
  // /home/…, C:\…, C:/… and \\server\…
  if (/^(\/|[a-z]:[\\/]|\\\\)/i.test(src)) return "absolute";
  return "relative";
};

const decode = (src: string) => {
  try {
    return decodeURIComponent(src);
  } catch {
    // a lone "%" that isn't an escape
    return src;
  }
};

/**
 * resolveLocalPath turns the `src` of a local image into a file path. The
 * markdown parser percent-encodes `src`, so it is decoded, and a relative
 * `src` is relative to the document's folder.
 * @param src src of a local (absolute or relative) image
 * @param docPath path of the document, null if it hasn't been saved yet
 * @returns the file path, or null if a relative src has no document to resolve against
 */
export const resolveLocalPath = (src: string, docPath: string | null) => {
  const path = decode(src);
  if (classifySrc(src) === "absolute") return path;
  if (docPath === null) return null;
  const folder = dirname(docPath);
  const relative = path.replace(/^\.[\\/]/, "");
  if (folder === "") return relative;
  // join Windows paths with their own separator
  const separator = folder.includes("\\") && !folder.includes("/") ? "\\" : "/";
  return folder.endsWith(separator)
    ? folder + relative
    : folder + separator + relative;
};

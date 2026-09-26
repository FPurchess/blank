// Synchronous path helpers for both / and \ separators. The `path` API of
// @tauri-apps/api is async IPC, which renderers such as node views can't wait for.

const lastSeparator = (path: string) =>
  Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));

/**
 * dirname returns the directory of `path` without a trailing separator,
 * e.g. "/home/u" for "/home/u/notes.md", or "" if `path` has no directory
 */
export const dirname = (path: string) => {
  const index = lastSeparator(path);
  if (index < 0) return "";
  // keep the root of "/notes.md"
  return index === 0 ? path.slice(0, 1) : path.slice(0, index);
};

/**
 * basename returns the last segment of `path`, e.g. "notes.md"
 */
export const basename = (path: string) => path.slice(lastSeparator(path) + 1);

/**
 * extname returns the lower-cased extension of `path` without the dot,
 * e.g. "md" for "Notes.MD", or "" if it has none
 */
export const extname = (path: string) => {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  // a leading dot starts a hidden file's name, not an extension
  return index > 0 ? name.slice(index + 1).toLowerCase() : "";
};

/**
 * replaceExtension returns `path` with its extension replaced by (or, if it
 * has none, extended with) `extension`, e.g. "/a/report.md" for
 * ("/a/report.docx", "md")
 */
export const replaceExtension = (path: string, extension: string) => {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  const stem = index > 0 ? name.slice(0, index) : name;
  return path.slice(0, path.length - name.length) + `${stem}.${extension}`;
};

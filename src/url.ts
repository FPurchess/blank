import { defaultMarkdownParser } from "prosemirror-markdown";

/**
 * normalizeUrl trims the url and percent-encodes whitespace, `<` and `>`,
 * which would otherwise break the markdown link when the file is reopened
 * @param url url to normalize
 * @returns normalized url
 */
export const normalizeUrl = (url: string) =>
  url.trim().replace(/[\s<>]/g, encodeURIComponent);

/**
 * isSavableUrl checks whether a link to url survives saving and reopening the
 * markdown file. The parser drops e.g. javascript: and file: links.
 * @param url url to check
 * @returns boolean
 */
export const isSavableUrl = (url: string) =>
  defaultMarkdownParser.tokenizer.validateLink(url);

/**
 * isAbsoluteUrl checks whether url is a complete url with a scheme,
 * such as https://example.com or mailto:someone@example.com
 * @param url url to check
 * @returns boolean
 */
export const isAbsoluteUrl = (url: string) => {
  if (/\s/.test(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
};

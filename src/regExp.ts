/**
 * escapeRegExp returns `text` as a regular expression that matches it as it
 * is
 */
export const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

import { type Check, checkAddress } from "./fieldCheck";

const MESSAGES = {
  empty: "Choose a file, or enter a path or web address",
  unsavable: "javascript:, vbscript: and file: addresses can't be saved",
  embedded: "Embedded in the document",
  choosing: "Choosing a file…",
};

/**
 * checkSource checks the source of an image: `embedded` is the data: URL of an
 * image embedded in the document, which the field shows by name, or null for
 * a path or web address typed into it
 */
const checkSource = (
  source: string,
  embedded: string | null,
  submitting: boolean,
): Check => {
  if (embedded) return { hint: MESSAGES.embedded, valid: true, blocked: false };
  const checked = checkAddress(source, submitting, MESSAGES);
  return "value" in checked
    ? { hint: "", valid: true, blocked: false }
    : checked;
};

/**
 * checkImage checks the image dialog's source (see checkSource). `submitting`
 * asks for the hint of an empty field too, and while `choosing` a file in the
 * native dialog the hint says so.
 */
export const checkImage = (
  source: string,
  embedded: string | null,
  submitting = false,
  choosing = false,
): Check => {
  const check = checkSource(source, embedded, submitting);
  return choosing ? { ...check, hint: MESSAGES.choosing } : check;
};

/**
 * sourcePlaceholder returns what the empty source field shows: that the image
 * is embedded, or an example of a path
 */
export const sourcePlaceholder = (embedded: string | null) =>
  embedded ? "Embedded image" : "images/chart.png";

/**
 * describeFile suggests a description for an image from its file name, e.g.
 * "chart" for "chart.png"
 */
export const describeFile = (name: string) => name.replace(/\.[^.]+$/, "");

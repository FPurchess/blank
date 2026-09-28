import { isAbsoluteUrl } from "../url";
import { type Check, checkAddress } from "./fieldCheck";

const MESSAGES = {
  empty: "Enter a URL",
  unsavable: "javascript:, vbscript:, file: and data: links can't be saved",
  notAbsolute: "This doesn't look like a full URL, e.g. https://example.com",
};

/**
 * checkLink checks the URL of a link. `submitting` asks for the hint of an
 * empty field too.
 */
export const checkLink = (url: string, submitting = false): Check => {
  const checked = checkAddress(url, submitting, MESSAGES);
  if (!("value" in checked)) return checked;
  return {
    hint: isAbsoluteUrl(checked.value) ? "" : MESSAGES.notAbsolute,
    valid: true,
    blocked: false,
  };
};

import { isSavableUrl, normalizeUrl } from "../url";

// What a dialog's check says about the address in one of its fields
export interface Check {
  // what the hint under the field says, or "" for nothing
  hint: string;
  // whether the dialog can be submitted with it
  valid: boolean;
  // whether its button is shown disabled: not for an empty field, which only
  // says why once the user tries to submit it
  blocked: boolean;
}

/**
 * checkAddress checks the parts every address field shares: an empty field,
 * which asks for one only while `submitting`, and an address that can't be
 * saved. It returns undefined for an address the dialog checks further, with
 * its normalized value.
 */
export const checkAddress = (
  address: string,
  submitting: boolean,
  messages: { empty: string; unsavable: string },
): Check | { value: string } => {
  const value = normalizeUrl(address);
  if (value === "") {
    return {
      hint: submitting ? messages.empty : "",
      valid: false,
      blocked: false,
    };
  }
  if (!isSavableUrl(value)) {
    return { hint: messages.unsavable, valid: false, blocked: true };
  }
  return { value };
};

import type { Option } from "../layout/choices";
import type { SignatureSettings } from "../state";

// The settings of a signature block (SignaturePopover.vue).

// when its date is filled in: when it is signed, never (a line to write it
// by hand), or a date of its own
export type DateChoice = "signing" | "none" | "fixed";

export const DATE_OPTIONS: Option<DateChoice>[] = [
  { value: "signing", label: "When signed" },
  { value: "none", label: "Leave blank" },
  { value: "fixed", label: "Fixed…" },
];

// how wide it is: as wide as it starts, or a share of the text's width
export const WIDTH_OPTIONS: Option<string>[] = [
  { value: "", label: "Fit" },
  { value: "50%", label: "50%" },
  { value: "75%", label: "75%" },
  { value: "100%", label: "100%" },
];

/**
 * dateChoiceOf returns the choice a block's date is
 */
export const dateChoiceOf = (date: string): DateChoice =>
  date === "signing" || date === "none" ? date : "fixed";

/**
 * today returns today's date as a block writes it, YYYY-MM-DD
 */
export const today = (now = new Date()) =>
  [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");

/**
 * settingsOf returns what the fields give a block: trimmed texts, the date
 * chosen (a fixed one that is empty or not a date is today), its width
 */
export const settingsOf = (fields: {
  role: string;
  name: string;
  place: string;
  date: DateChoice;
  fixed: string;
  width: string;
}): SignatureSettings => ({
  role: fields.role.trim(),
  name: fields.name.trim(),
  place: fields.place.trim(),
  date:
    fields.date === "fixed"
      ? /^\d{4}-\d{2}-\d{2}$/.test(fields.fixed) &&
        !Number.isNaN(Date.parse(fields.fixed))
        ? fields.fixed
        : today()
      : fields.date,
  width: fields.width || null,
});

import type { Option } from "../layout/choices";
import type { SignatureSettings } from "../state";
import { calendarDate, type SignatureDate } from "../markdown/blocks/atoms";

// The settings of a signature block (SignaturePopover.vue).

// when its date is filled in: when it is signed, never (a line to write it
// by hand), or a date of its own
export type DateChoice = "signing" | "none" | "fixed";

export const DATE_OPTIONS: Option<DateChoice>[] = [
  { value: "signing", label: "When signed" },
  { value: "none", label: "Leave blank" },
  { value: "fixed", label: "Fixed date" },
];

// how wide it is, a share of the text's width: half by default, which the
// file leaves out ("")
export const WIDTH_OPTIONS: Option<string>[] = [
  { value: "", label: "50%" },
  { value: "75%", label: "75%" },
  { value: "100%", label: "100%" },
];

/**
 * widthChoiceOf returns the choice a block's width is: 50% is the default
 */
export const widthChoiceOf = (width: string | null) =>
  !width || width === "50%" ? "" : width;

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
      ? calendarDate(fields.fixed)
        ? (fields.fixed as SignatureDate)
        : (today() as SignatureDate)
      : fields.date,
  width: fields.width || null,
});

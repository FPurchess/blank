// How the date next to a signature is written, in the document's language:
// the long form ("8 October 2026" in British English, "October 8, 2026" in
// American), the short form ("08.10.2026", "10/08/2026"), or "2026-10-08".
// One place for every signature, stamp and preview, so they never disagree.

export const DATE_FORMATS = ["long", "short", "iso"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

/**
 * isDateFormat tells whether `value` is a date format of the settings
 */
export const isDateFormat = (value: unknown): value is DateFormat =>
  (DATE_FORMATS as readonly unknown[]).includes(value);

const pad = (number: number) => String(number).padStart(2, "0");

/**
 * formatSigningDate writes `date` in `format`, in `language` (a tag such as
 * "de" or "en-US"); a tag the webview doesn't know is written as English
 */
export const formatSigningDate = (
  date: Date,
  language: string,
  format: DateFormat,
) => {
  if (format === "iso") {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }
  const options: Intl.DateTimeFormatOptions =
    format === "long"
      ? { day: "numeric", month: "long", year: "numeric" }
      : { day: "2-digit", month: "2-digit", year: "numeric" };
  try {
    return new Intl.DateTimeFormat(language || "en", options).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", options).format(date);
  }
};

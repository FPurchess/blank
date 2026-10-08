import type { Option } from "../../layout/choices";
import {
  DATE_FORMATS,
  type DateFormat,
  formatSigningDate,
} from "../../signing/date";
import type { Mark } from "../../signing/profile";

// Settings ▸ Signing (SigningSection.vue).

export const MARK_ROWS: { mark: Mark; label: string; empty: string }[] = [
  {
    mark: "signature",
    label: "Signature",
    empty: "Draw it, type it, or take a picture of it on paper",
  },
  {
    mark: "initials",
    label: "Initials",
    empty: "For the pages of what you sign",
  },
];

// the day the choices show, so they compare: 8 October 2026
const EXAMPLE = new Date(2026, 9, 8);

/**
 * dateFormatOptions returns the date formats as they write a date in
 * `language`, e.g. "8 October 2026", "08.10.2026", "2026-10-08"
 */
export const dateFormatOptions = (language: string): Option<DateFormat>[] =>
  DATE_FORMATS.map((format) => ({
    value: format,
    label: formatSigningDate(EXAMPLE, language, format),
  }));

// a timestamp server Adobe trusts, free to use, which the settings offer
export const TIMESTAMP_PRESET = "http://timestamp.digicert.com";

/**
 * parseTimestampServer reads the timestamp server as typed: an http or
 * https address, or nothing for the computer's clock
 */
export const parseTimestampServer = (
  typed: string,
): { url: string } | { error: string } => {
  const text = typed.trim();
  if (!text) return { url: "" };
  try {
    const url = new URL(text);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return { url: text };
    }
  } catch {
    // not an address
  }
  return { error: "Enter a web address, such as " + TIMESTAMP_PRESET + "." };
};

/**
 * groupFingerprint writes a fingerprint in groups of four, to read it out
 */
export const groupFingerprint = (fingerprint: string) =>
  fingerprint.match(/.{1,4}/g)?.join(" ") ?? fingerprint;

/**
 * certificateSummary says who made a certificate and until when it's valid
 */
export const certificateSummary = (info: {
  selfSigned: boolean;
  issuer: string;
  notAfter: string;
}) => {
  const until = info.notAfter.slice(0, 10);
  return info.selfSigned
    ? `Made by Blank, valid until ${until}`
    : `Issued by ${info.issuer}, valid until ${until}`;
};

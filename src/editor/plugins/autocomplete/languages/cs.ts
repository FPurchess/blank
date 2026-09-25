// Quotes: Unicode CLDR delimiters (https://github.com/unicode-org/cldr/blob/main/common/main/cs.xml).
// LibreOffice ships no autocorrect exception lists for this language, so only
// common unit symbols are listed as two-capitals exceptions.
import type { LanguageRules } from "./types";

const rules: LanguageRules = {
  quotes: {
    double: ["„", "“"],
    single: ["‚", "‘"],
  },
  abbreviations: [],
  twoCapitalsExceptions: ["MHz", "GHz", "THz"],
  spacedDash: "–",
  wordDash: "—",
};
export default rules;

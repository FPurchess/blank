// Quotes: Unicode CLDR delimiters (https://github.com/unicode-org/cldr/blob/main/common/main/fi.xml).
// Abbreviations and two-capitals exceptions adapted from LibreOffice's autocorrect
// lists (MPL-2.0):
// https://github.com/LibreOffice/core/blob/master/extras/source/autocorr/lang/fi/SentenceExceptList.xml
// https://github.com/LibreOffice/core/blob/master/extras/source/autocorr/lang/fi/WordExceptList.xml
import type { LanguageRules } from "./types";

const rules: LanguageRules = {
  quotes: {
    double: ["”", "”"],
    single: ["’", "’"],
  },
  abbreviations: [
    "alk.",
    "ao.",
    "dem.",
    "ed.",
    "eKr.",
    "em.",
    "ent.",
    "esim.",
    "huom.",
    "ilm.",
    "jKr.",
    "jne.",
    "kok.",
    "ks.",
    "lis.",
    "lkm.",
    "lut.",
    "maist.",
    "milj.",
    "mm.",
    "mrd.",
    "nimim.",
    "nk.",
    "ns.",
    "o.s.",
    "os.",
    "pj.",
    "prof.",
    "puh.",
    "puh.joht.",
    "sd.",
    "so.",
    "sos.",
    "sos.dem.",
    "suom.",
    "tms.",
    "toim.",
    "ts.",
    "vrt.",
    "vt.",
    "yht.",
    "ym.",
    "yms.",
  ],
  twoCapitalsExceptions: ["OOo", "MHz", "GHz", "THz"],
  spacedDash: "–",
  wordDash: "–",
};
export default rules;

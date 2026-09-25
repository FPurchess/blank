import cs from "./cs";
import da from "./da";
import de from "./de";
import en from "./en";
import es from "./es";
import fi from "./fi";
import fr from "./fr";
import it from "./it";
import nl from "./nl";
import no from "./no";
import pl from "./pl";
import pt from "./pt";
import ru from "./ru";
import sv from "./sv";
import type { LanguageRules } from "./types";

export const languageRules: Record<string, LanguageRules> = {
  cs,
  da,
  de,
  en,
  es,
  fi,
  fr,
  it,
  nl,
  no,
  pl,
  pt,
  ru,
  sv,
};

export const supportedLanguages = Object.keys(languageRules).sort();

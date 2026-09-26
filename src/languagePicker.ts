import { language, languagePicker } from "./state";
import { isoCodes } from "./editor/plugins/autocomplete/languages/iso639-1";
import { supportedLanguages } from "./editor/plugins/autocomplete/languages";
import { dictionaryTags, hasDictionary } from "./spellcheck/catalog";

// the regional variants the picker steps through, all others are chosen by
// typing their tag
const variants = ["de-AT", "de-CH", "en-AU", "en-CA", "en-GB", "pt-PT"];

/**
 * pickerLanguages returns the languages the picker steps through: all
 * languages with rules of their own, common regional variants, and the
 * current and the selected one
 */
export const pickerLanguages = (): string[] =>
  [
    ...new Set([
      ...supportedLanguages,
      ...variants.filter(hasDictionary),
      language.value,
      languagePicker.value.selected,
    ]),
  ].sort();

// a tag without its hyphens and in lowercase, as it is typed: "dech"
const typed = (tag: string) => tag.toLowerCase().replaceAll("-", "");

/**
 * openPicker opens the language picker on the current language
 */
export const openPicker = () => {
  languagePicker.value = {
    open: true,
    selected: language.value,
    buffer: "",
    invalid: false,
  };
};

/**
 * closePicker closes the language picker without choosing a language
 */
export const closePicker = () => {
  languagePicker.value = {
    ...languagePicker.value,
    open: false,
    buffer: "",
    invalid: false,
  };
};

/**
 * move selects the language `offset` steps away, wrapping around
 */
export const move = (offset: number) => {
  const languages = pickerLanguages();
  const index = languages.indexOf(languagePicker.value.selected);
  const next = (index + offset + languages.length) % languages.length;
  languagePicker.value = {
    ...languagePicker.value,
    selected: languages[next],
    buffer: "",
    invalid: false,
  };
};

/**
 * select selects `code`, e.g. when it was clicked
 */
export const select = (code: string) => {
  languagePicker.value = {
    ...languagePicker.value,
    selected: code,
    buffer: "",
    invalid: false,
  };
};

/**
 * typeChar adds a letter or "-" to the typed language tag. Two letters that
 * make a valid ISO 639-1 code select it, and typing on selects a regional
 * variant, e.g. "dech" or "de-ch" selects "de-CH". Letters that match no
 * language are rejected.
 */
export const typeChar = (char: string) => {
  const buffer = languagePicker.value.buffer + char.toLowerCase();
  const letters = typed(buffer);
  const reject = () => {
    languagePicker.value = {
      ...languagePicker.value,
      buffer: "",
      invalid: true,
    };
  };

  if (letters.length < 2) {
    languagePicker.value = { ...languagePicker.value, buffer, invalid: false };
    return;
  }
  if (!isoCodes.has(letters.slice(0, 2))) return reject();

  const exact =
    letters.length === 2
      ? letters
      : dictionaryTags.find((tag) => typed(tag) === letters);
  // keep the typed letters while a longer tag can still be typed
  const longer = dictionaryTags.some(
    (tag) =>
      typed(tag).length > letters.length && typed(tag).startsWith(letters),
  );
  if (!exact && !longer) return reject();

  languagePicker.value = {
    ...languagePicker.value,
    selected: exact ?? languagePicker.value.selected,
    buffer: longer ? buffer : "",
    invalid: false,
  };
};

/**
 * backspace removes the last typed letter
 */
export const backspace = () => {
  languagePicker.value = {
    ...languagePicker.value,
    buffer: languagePicker.value.buffer.slice(0, -1),
    invalid: false,
  };
};

/**
 * confirm chooses the selected language and closes the picker
 */
export const confirm = () => {
  language.value = languagePicker.value.selected;
  closePicker();
};

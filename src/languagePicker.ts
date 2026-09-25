import { language, languagePicker } from "./state";
import { isoCodes } from "./editor/plugins/autocomplete/languages/iso639-1";
import { supportedLanguages } from "./editor/plugins/autocomplete/languages";

/**
 * pickerLanguages returns the languages the picker steps through: all
 * languages with rules of their own plus the current one
 */
export const pickerLanguages = (): string[] => {
  const current = languagePicker.value.selected;
  return supportedLanguages.includes(current)
    ? supportedLanguages
    : [...supportedLanguages, current].sort();
};

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
  languagePicker.value = { ...languagePicker.value, open: false, buffer: "" };
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
 * typeChar adds a letter to the typed language code. Two letters that make a
 * valid ISO 639-1 code select it, any other two letters are rejected.
 */
export const typeChar = (char: string) => {
  const buffer = languagePicker.value.buffer + char.toLowerCase();
  if (buffer.length < 2) {
    languagePicker.value = { ...languagePicker.value, buffer, invalid: false };
  } else if (isoCodes.has(buffer)) {
    select(buffer);
  } else {
    languagePicker.value = {
      ...languagePicker.value,
      buffer: "",
      invalid: true,
    };
  }
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

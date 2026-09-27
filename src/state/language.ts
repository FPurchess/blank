import { shallowRef } from "vue";

// language is the language tag autocorrect and spell check follow: an ISO
// 639-1 code like "de", or a regional tag like "de-CH"
export const language = shallowRef<string>("en");

export interface LanguagePickerState {
  open: boolean;
  // the language code that Enter would choose
  selected: string;
  // the letters typed so far to choose a language by its code
  buffer: string;
  // whether the last typed code was invalid
  invalid: boolean;
}

export const languagePicker = shallowRef<LanguagePickerState>({
  open: false,
  selected: "en",
  buffer: "",
  invalid: false,
});

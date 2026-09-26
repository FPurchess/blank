import { Transaction } from "prosemirror-state";

import { debounce, Observable } from "observable.ts";

export const path = new Observable<string | null>(null);

export const transaction = new Observable<Transaction | null>(null);

export const textContent = new Observable("");
transaction.subscribe(
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  debounce((transaction: Transaction) => {
    if (transaction !== null) {
      const { doc } = transaction;
      // separate blocks and inline leaves like hard breaks and images by a space
      const content = doc
        .textBetween(0, doc.content.size, " ", " ")
        .replace(/\s+/g, " ")
        .trim();
      textContent.value = content;
    }
  }, 50),
);

export const themes: string[] = [
  "light",
  "dark",
  "black",
  "red",
  "green",
  "blue",
];

export type themeType = (typeof themes)[number];
export const theme = new Observable<themeType>("light");
theme.subscribe((value: themeType) => {
  document.body.dataset.theme = value;
});

export interface LinkDialogRequest {
  url: string;
  text: string;
  // the cursor or selection is in an existing link, which can be removed
  isEdit: boolean;
  submit(url: string, text: string): void;
  convertToText(): void;
  cancel(): void;
}

// linkDialog holds the request of the open link dialog, or null while it is closed
export const linkDialog = new Observable<LinkDialogRequest | null>(null);

// language is the ISO 639-1 code of the language autocorrect follows
export const language = new Observable<string>("en");

export interface LanguagePickerState {
  open: boolean;
  // the language code that Enter would choose
  selected: string;
  // the letters typed so far to choose a language by its code
  buffer: string;
  // whether the last typed code was invalid
  invalid: boolean;
}

export const languagePicker = new Observable<LanguagePickerState>({
  open: false,
  selected: "en",
  buffer: "",
  invalid: false,
});

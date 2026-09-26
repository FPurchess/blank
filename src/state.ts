import { Transaction } from "prosemirror-state";

import { debounce, Observable } from "observable.ts";

import type { Spellchecker, SpellcheckStatus } from "./spellcheck/types";

export const path = new Observable<string | null>(null);

// the Word document the untitled document was imported from, which suggests
// where to save it; null otherwise
export const importedFrom = new Observable<string | null>(null);

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

export interface ChosenImage {
  // the image as data: URL, to embed it in the document
  src: string;
  // the file's name, e.g. "chart.png"
  name: string;
}

export interface ImageDialogRequest {
  src: string;
  alt: string;
  // the cursor is at an existing image, which can be removed
  isEdit: boolean;
  // lets the user pick an image file, null if cancelled or unreadable
  chooseFile(): Promise<ChosenImage | null>;
  submit(src: string, alt: string): void;
  remove(): void;
  cancel(): void;
}

// imageDialog holds the request of the open image dialog, or null while it is closed
export const imageDialog = new Observable<ImageDialogRequest | null>(null);

// language is the language tag autocorrect and spell check follow: an ISO
// 639-1 code like "de", or a regional tag like "de-CH"
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

// spellcheck is whether spelling is checked, which the user turns on and off
export const spellcheck = new Observable<boolean>(false);

// spellcheckStatus is what the spell checker is doing
export const spellcheckStatus = new Observable<SpellcheckStatus>({
  state: "off",
  tag: "en",
});

// spellchecker checks the spelling while spellcheckStatus is "ready"
export const spellchecker = new Observable<Spellchecker | null>(null);

// spellcheckMessage is a short message shown next to the spell check status,
// e.g. "No spelling errors", or null
export const spellcheckMessage = new Observable<string | null>(null);

export type MenuItem =
  | {
      id: string;
      label: string;
      // the key binding, e.g. "Mod-z"
      shortcut?: string;
      disabled?: boolean;
      // the items of a submenu
      children?: MenuItem[];
      run?: () => void;
      // turns the item into a text field, submitted with Enter
      edit?: { value: string; submit(value: string): void };
    }
  | "separator";

export interface ContextMenuRequest {
  items: MenuItem[];
  // where to show the menu, in viewport coordinates
  anchor: { left: number; top: number; bottom: number };
  // opened with the keyboard, which focuses the first item
  keyboard: boolean;
  // returns the focus to the editor
  close(): void;
}

// contextMenu holds the open context menu, or null while it is closed. A new
// request with the same `close` updates the open menu, e.g. once the
// suggestions are known.
export const contextMenu = new Observable<ContextMenuRequest | null>(null);

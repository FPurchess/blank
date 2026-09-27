import { shallowRef } from "vue";

import type { PageSettings } from "../layout/settings";
import type { Unit } from "../layout/units";

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
export const linkDialog = shallowRef<LinkDialogRequest | null>(null);

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
export const imageDialog = shallowRef<ImageDialogRequest | null>(null);

export interface PageSetupRequest {
  // the page setup of the document, over the user's defaults
  settings: PageSettings;
  // the locale whose paper "auto" is, and the unit to show lengths in
  locale: string;
  unit: Unit;
  // the document's frontmatter, for editing it as text
  frontmatter: string | null;
  // what of the document's page setup can't be used
  warnings: string[];
  apply(settings: PageSettings): void;
  // returns what is wrong with the frontmatter, or null once it is applied
  applyText(frontmatter: string): string | null;
  // makes the settings the user's default for documents without their own
  makeDefault(settings: PageSettings): void;
  cancel(): void;
}

// pageSetup holds the request of the open page setup dialog, or null while
// it is closed
export const pageSetup = shallowRef<PageSetupRequest | null>(null);

// pageSetupRequests counts the requests to open the page setup from outside
// the editor, e.g. the button in the bottom bar. The editor opens it for its
// document on each one.
export const pageSetupRequests = shallowRef<number>(0);

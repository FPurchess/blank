import { type ShallowRef, shallowRef } from "vue";

import type { Band, DocumentFields } from "../layout/bands";
import type { BandSettings, PageSettings } from "../layout/settings";
import type { Unit } from "../layout/units";
import type { BoxAnchor } from "./popups";

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

export interface BandEditorRequest {
  band: Band;
  // the headers, footers and page numbers as they are
  bands: BandSettings;
  // what the placeholders show
  fields: DocumentFields;
  // text with placeholders to put into the center once the strip opens,
  // e.g. "{page}" for "# Page numbers"
  insert?: string;
  // keeps what was edited, as one undo step
  apply(bands: BandSettings): void;
}

// bandEditor holds the request of the open header or footer strip, or null
// while none is open
export const bandEditor = shallowRef<BandEditorRequest | null>(null);

// bandEditorDone closes the open header or footer strip and keeps what was
// typed, as a click outside it does, e.g. before another tab shows; set by
// the strip while it is open
export const bandEditorDone = shallowRef<(() => void) | null>(null);

export interface TocPopoverRequest {
  // the button or block it opens below, at its right end
  anchor: BoxAnchor;
  // the headings it lists, 1 to 6 levels deep
  depth: number;
  title: string;
  // changes the table of contents at once, as one undo step
  apply(depth: number, title: string): void;
  // gives the editor the focus back, on the table of contents
  close(): void;
}

// tocPopover holds the request of the open settings of a table of contents,
// or null while they are closed
export const tocPopover = shallowRef<TocPopoverRequest | null>(null);

export interface UnsavedDialogRequest {
  // the tab's name, e.g. "notes"
  label: string;
  save(): void;
  discard(): void;
  cancel(): void;
}

// unsavedDialog holds the request of the open question whether to save a
// tab's changes before it closes, or null while none is asked
export const unsavedDialog = shallowRef<UnsavedDialogRequest | null>(null);

// the settings open on the section shown last (settingsSection)
export type SettingsRequest = Record<string, never>;

// settingsDialog holds the request of the open settings dialog, or null while
// it is closed. It isn't about a document, so closing a tab leaves it open.
export const settingsDialog = shallowRef<SettingsRequest | null>(null);

// the requests of everything here that takes the focus while it is open, so
// the editor leaves it the focus (see uiTakesFocus in focus.ts): a new
// dialog goes here too
export const focusTakingDialogs = [
  linkDialog,
  imageDialog,
  pageSetup,
  bandEditor,
  tocPopover,
  unsavedDialog,
  settingsDialog,
] as const;

/**
 * closeDialog closes the dialog of `requests`, then runs `callback`, which
 * does what the user chose and gives the editor the focus back. In this
 * order, uiTakesFocus is already false when the editor takes the focus, and a
 * callback that opens a new request isn't closed right after. Vue removes the
 * dialog's DOM on the next tick.
 */
export const closeDialog = (
  requests: ShallowRef<unknown>,
  callback: () => void,
) => {
  requests.value = null;
  callback();
};

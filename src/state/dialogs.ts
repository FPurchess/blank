import { type ShallowRef, shallowRef } from "vue";

import type { Band } from "../layout/bands";
import type { BandSettings, PageSettings } from "../layout/settings";
import type { Unit } from "../layout/units";
import type { Destination, PrintPlan } from "../print/printModel";
import type { Size } from "../print/sheets";
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
  // its width, e.g. "50%" (see src/markdown/blocks/caps.ts), null for Fit
  width: string | null;
  // the cursor is at an existing image, which can be removed
  isEdit: boolean;
  // lets the user pick an image file, null if cancelled or unreadable
  chooseFile(): Promise<ChosenImage | null>;
  submit(src: string, alt: string, width: string | null): void;
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
  // whether the document's frontmatter can be read, and so written into
  readable: boolean;
  // what of the document's page setup can't be used
  warnings: string[];
  // writes the settings into the document as one undo step
  apply(settings: PageSettings): void;
  // makes the settings the user's default for documents without their own
  makeDefault(settings: PageSettings): void;
  cancel(): void;
}

// pageSetup holds the request of the open page setup dialog, or null while
// it is closed
export const pageSetup = shallowRef<PageSetupRequest | null>(null);

export interface BandEditorRequest {
  band: Band;
  // the page whose band it edits, counted from 1; null without pages, e.g.
  // without the layout engine
  page: number | null;
  // whether to bring the band into view, as the keys open the page in view,
  // while a click opens it where it is
  center: boolean;
  // the headers, footers and page numbers as they are
  bands: BandSettings;
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

// the settings of a block, below the block toolbar's settings button (see
// src/editor/commands/blockSettings.ts and src/ui/components/BlockPopover.vue)
export interface BlockSettingsRequest<T> {
  // the button or block it opens below, at its right end
  anchor: BoxAnchor;
  // what the block has now
  values: T;
  // changes the block at once, as one undo step
  apply(values: T): void;
  // gives the editor the focus back, on the block
  close(): void;
}

// a table of contents: the headings it lists, 1 to 6 levels deep, and its
// title
export type TocPopoverRequest = BlockSettingsRequest<{
  depth: number;
  title: string;
}>;

// tocPopover holds the request of the open settings of a table of contents,
// or null while they are closed
export const tocPopover = shallowRef<TocPopoverRequest | null>(null);

// a diagram: its width (null for Fit, see src/markdown/blocks/caps.ts), its
// caption and its description
export interface DiagramPopoverRequest extends BlockSettingsRequest<{
  width: string | null;
  caption: string;
  alt: string;
}> {
  // what it is called where its description is empty, e.g. "Flowchart"
  label: string;
}

// diagramPopover holds the request of the open settings of a diagram, or
// null while they are closed
export const diagramPopover = shallowRef<DiagramPopoverRequest | null>(null);

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

export interface PrintRequest {
  // the document's pages, all laid out
  pages: number;
  // the page the cursor is on, by its index
  current: number;
  // the size of the pages, in points
  page: Size;
  // the paper the document prints on, in words (printPaper)
  paper: string;
  // why printing didn't work the last time, when the dialog opens again
  note?: string;
  // the destination to start with instead of the remembered one, after
  // printing didn't work
  destination?: Destination;
  print(plan: PrintPlan): void;
  // saves the pages, by their index, as a PDF
  savePdf(pages: number[]): void;
  // opens the page setup instead
  pageSetup(): void;
  cancel(): void;
}

// printDialog holds the request of the open print dialog, or null while it
// is closed
export const printDialog = shallowRef<PrintRequest | null>(null);

// the requests of everything here that takes the focus while it is open, so
// the editor leaves it the focus (see uiTakesFocus in focus.ts): a new
// dialog goes here too
export const focusTakingDialogs = [
  linkDialog,
  imageDialog,
  pageSetup,
  bandEditor,
  tocPopover,
  diagramPopover,
  unsavedDialog,
  settingsDialog,
  printDialog,
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

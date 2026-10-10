import { type ShallowRef, shallowRef } from "vue";

import type { Band } from "../layout/bands";
import type { BandSettings, PageSettings } from "../layout/settings";
import type { Unit } from "../layout/units";
import type { Destination, PrintPlan } from "../print/printModel";
import type { Size } from "../print/sheets";
import type { BoxAnchor } from "./popups";
import type { Mark, MarkSource, SavedMark } from "../signing/profile";
import type { SignatureDate } from "../markdown/blocks/atoms";
import type { CheckedSignature } from "../signing/ipc";

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

// what a signature block's settings change (ATOMS.signature)
export interface SignatureSettings {
  role: string;
  name: string;
  place: string;
  date: SignatureDate;
  // a share of the text's width, "50%", or null for the default
  width: string | null;
}

export interface SignaturePopoverRequest {
  // the button or block it opens below, at its right end
  anchor: BoxAnchor;
  settings: SignatureSettings;
  // changes the signature block at once, as one undo step
  apply(settings: SignatureSettings): void;
  // gives the editor the focus back, on the signature block
  close(): void;
}

// signaturePopover holds the request of the open settings of a signature
// block, or null while they are closed
export const signaturePopover = shallowRef<SignaturePopoverRequest | null>(
  null,
);

export interface SignatureDialogRequest {
  // the signature or the initials
  mark: Mark;
  // what is saved now, which the dialog opens as it was made
  saved: SavedMark | null;
  // the name a typed signature starts with
  name: string;
  // lets the user pick a picture of their signature, as a data: URL
  chooseFile(): Promise<{ src: string; name: string } | null>;
  // makes and saves the picture of what was drawn, typed or chosen; false
  // when there's nothing to save (an empty pad)
  submit(source: MarkSource, image?: ChosenMarkImage): Promise<boolean>;
  // once it's saved and the dialog closed: gives the focus back to where
  // the dialog was opened from, and goes on, e.g. to signing
  done(): void;
  // gives the focus back
  cancel(): void;
}

// a picture chosen for a signature, and whether its background goes
export interface ChosenMarkImage {
  src: string;
  clean: boolean;
}

// signatureDialog holds the request of the open dialog of the user's
// signature or initials, or null while it's closed
export const signatureDialog = shallowRef<SignatureDialogRequest | null>(null);

export interface CertificateDialogRequest {
  // make a new certificate, or import a key file the user has
  mode: "create" | "import";
  // the name a new certificate starts with
  name: string;
  // the key file to import, as the dialog names it
  file: string;
  // makes or imports it: what went wrong in words, or null once done
  submit(fields: {
    name: string;
    email: string;
    passphrase: string;
  }): Promise<string | null>;
  // once it's there and the dialog closed: gives the focus back to where
  // the dialog was opened from
  done(): void;
  // gives the focus back
  cancel(): void;
}

// certificateDialog holds the request of the open dialog that makes or
// imports the user's certificate, or null
export const certificateDialog = shallowRef<CertificateDialogRequest | null>(
  null,
);

// a signature block a signed export can fill in
export interface SignTarget {
  pos: number;
  // who it names, "" for whoever signs
  name: string;
  // where it says it's signed, "" for where the signer says
  place: string;
  // e.g. "Ada Lovelace · Tenant", or "Signature 2" for one that names none
  label: string;
}

export interface SignDialogRequest {
  // what is signed, e.g. the document's name
  title: string;
  // the signature blocks the document has, the one to fill in chosen
  targets: SignTarget[];
  chosen: number;
  // where the user signed last
  place: string;
  // the name the user signs as, "" when Blank doesn't know it
  signer: string;
  // the notes the dialog shows, e.g. that an imported Word document's
  // layout can differ from Word's
  warnings: string[];
  // whether `passphrase` opens the user's key: what's wrong, or null
  check(passphrase: string): Promise<string | null>;
  // opens the dialog that makes the user a certificate, which gives the
  // focus back to `opener`
  createCertificate(opener: EventTarget | null): void;
  // fills in the block at `pos` (signed in `place` when it says none),
  // asks where to save the signed PDF and, with
  // the key's passphrase, signs it digitally too
  submit(pos: number, place: string, passphrase: string | null): void;
  cancel(): void;
}

// signDialog holds the request of the open dialog that signs, or null
export const signDialog = shallowRef<SignDialogRequest | null>(null);

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

export interface ConfirmDialogRequest {
  // e.g. "Remove your certificate?"
  title: string;
  // what it means, e.g. that it can't be undone
  text: string;
  // the button that does it, e.g. "Remove"
  action: string;
  // what else the dialog offers on its left, which leaves it open, e.g.
  // backing up what is to be removed
  secondary?: { label: string; run(): void };
  confirm(): void;
  cancel(): void;
}

// confirmDialog holds the request of the open question whether to do
// something that can't be undone, or null
export const confirmDialog = shallowRef<ConfirmDialogRequest | null>(null);

// The popover of a PDF's signatures above the status bar's item
// (SignaturesPopover.vue), which lists those of the PDF shown; `refocus`
// gives the focus back once it closes
export interface SignaturesPopoverRequest {
  refocus(): void;
}

export const signaturesPopover = shallowRef<SignaturesPopoverRequest | null>(
  null,
);

// The details of one of a PDF's signatures (SignatureDetailsDialog.vue)
export interface SignatureDetailsRequest {
  signature: CheckedSignature;
  refocus(): void;
}

export const signatureDetails = shallowRef<SignatureDetailsRequest | null>(
  null,
);

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
  signaturePopover,
  signatureDialog,
  signDialog,
  certificateDialog,
  confirmDialog,
  signaturesPopover,
  signatureDetails,
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

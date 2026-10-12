import type { Command } from "prosemirror-state";

import { commandLabel } from "../commandList";
import { CommandIdentifier } from "../config";
import {
  activeTab,
  activeTabId,
  announce,
  isPdfTab,
  shownPdf,
  signaturesPopover,
} from "../state";
import { signShownPdf } from "./sign";
import {
  canRedoStamps,
  canUndoStamps,
  redoStamps,
  undoStamps,
} from "./stampBooks";

// What the commands do in a PDF tab, whose editor holds no text (see
// placeholder.ts): those of the window, the tabs and the app run as
// anywhere; the others are off, so the toolbar shows them disabled
// (`editor.can`), and their keys say why instead.

// the commands that run in a PDF tab
const RUN_IN_PDF = new Set<CommandIdentifier>([
  CommandIdentifier.FILE_NEW,
  CommandIdentifier.FILE_OPEN,
  CommandIdentifier.FILE_CLEAR_RECENT,
  // the PDF file itself, as it is (printPdfFile in src/print/job.ts)
  CommandIdentifier.FILE_PRINT,
  CommandIdentifier.TAB_CLOSE,
  CommandIdentifier.TAB_NEXT,
  CommandIdentifier.TAB_PREVIOUS,
  CommandIdentifier.TAB_REOPEN,
  CommandIdentifier.TAB_MOVE_LEFT,
  CommandIdentifier.TAB_MOVE_RIGHT,
  CommandIdentifier.THEME_CYCLE,
  CommandIdentifier.VIEW_FOCUS_NEXT,
  CommandIdentifier.VIEW_FOCUS_PREVIOUS,
  CommandIdentifier.VIEW_TOOLBAR_FOCUS,
  CommandIdentifier.VIEW_FOCUS_MODE,
  CommandIdentifier.VIEW_SIGNATURES,
  CommandIdentifier.VIEW_ZOOM_IN,
  CommandIdentifier.VIEW_ZOOM_OUT,
  CommandIdentifier.VIEW_ZOOM_FIT,
  CommandIdentifier.MENU_MAIN,
  CommandIdentifier.APP_SETTINGS,
  CommandIdentifier.APP_SHORTCUTS,
  CommandIdentifier.APP_GUIDE,
  CommandIdentifier.APP_ABOUT,
  CommandIdentifier.PDF_SIGN,
  CommandIdentifier.PDF_NEXT,
]);

// what Save says in a PDF tab, whose key signs it
export const SIGN_TO_KEEP = "Sign the PDF to keep what you placed on it";

// what signing your own documents says in a PDF tab, which is signed with
// its signing toolbar
export const SIGN_RECEIVED_REFUSAL =
  "In a PDF, place your signature from the signing toolbar, then choose Sign on it. Export signed PDF signs your own documents.";

/**
 * pdfRefusal returns what the command `id` says in a PDF tab instead of
 * running, or null for one that runs there: what its key announces, and the
 * tooltip of its disabled item in the main menu (mainMenuModel.ts). The one
 * table of these reasons.
 */
export const pdfRefusal = (id: CommandIdentifier): string | null => {
  if (RUN_IN_PDF.has(id)) return null;
  switch (id) {
    // Save's key signs it, which keeps what was placed on it (forPdf)
    case CommandIdentifier.FILE_SAVE:
    case CommandIdentifier.FILE_SAVE_AS:
      return SIGN_TO_KEEP;
    // the stamps' history (forPdf)
    case CommandIdentifier.UNDO:
      return canUndoStamps(activeTabId.value)
        ? null
        : "There's nothing to undo in this PDF";
    case CommandIdentifier.REDO:
      return canRedoStamps(activeTabId.value)
        ? null
        : "There's nothing to redo in this PDF";
    case CommandIdentifier.INSERT_BLOCK:
    case CommandIdentifier.VIEW_BLOCKS:
      return "Blocks go into your own documents";
    case CommandIdentifier.EXPORT_SIGNED_PDF:
    case CommandIdentifier.INSERT_SIGNATURE:
    case CommandIdentifier.SIGNING_SIGNATURE:
    case CommandIdentifier.SIGNING_INITIALS:
      return SIGN_RECEIVED_REFUSAL;
    case CommandIdentifier.EXPORT_PDF:
    case CommandIdentifier.EXPORT_DOCX:
      return "Blank exports your own documents, not PDFs";
    case CommandIdentifier.EDIT_FIND:
      return "Blank can't search PDFs yet";
    case CommandIdentifier.LANGUAGE_CHOOSE:
    case CommandIdentifier.SPELLCHECK_TOGGLE:
    case CommandIdentifier.SPELLCHECK_NEXT:
    case CommandIdentifier.SPELLCHECK_PREVIOUS:
      return "Blank checks the spelling of your own documents, not of PDFs";
    case CommandIdentifier.CONTEXT_MENU:
      return "PDFs have no context menu in Blank yet";
    case CommandIdentifier.PAGE_SETUP:
      return "A PDF's pages are set already";
    case CommandIdentifier.EDIT_HEADER:
    case CommandIdentifier.EDIT_FOOTER:
      return "Headers and footers are for your own documents";
    case CommandIdentifier.VIEW_PAGES:
      return "PDFs always show as pages";
    case CommandIdentifier.VIEW_OUTLINE:
      return "Blank shows no outline for PDFs yet";
    case CommandIdentifier.TOOLS_STATS:
      return "Blank doesn't count the words of PDFs";
    default:
      // what changes the text: the block types, formatting, inserting
      if (/^(blocktype|format|insert)\./.test(id))
        return "Blank can't change the text of a PDF";
      // "Page setup…" without its dots
      return `${commandLabel(id).replace(/…$/, "")} is for your own documents`;
  }
};

// what Save, Undo and Redo do in a PDF tab: sign it, and step through the
// history of its stamps
const stampHistory =
  (step: (tab: string) => boolean): Command =>
  (_state, dispatch) => {
    if (dispatch && activeTabId.value) step(activeTabId.value);
    return true;
  };
const IN_PDF: Partial<Record<CommandIdentifier, Command>> = {
  [CommandIdentifier.UNDO]: stampHistory(undoStamps),
  [CommandIdentifier.REDO]: stampHistory(redoStamps),
};

const sign = signShownPdf();

/**
 * forPdf returns `command` as the command `id` runs: in a PDF tab, one that
 * doesn't run there can't (`can` is false), and its key says why; Undo and
 * Redo go through its stamps' history, and Save's key signs it (the menu
 * offers Sign… for that)
 */
export const forPdf =
  (id: CommandIdentifier, command: Command): Command =>
  (state, dispatch, view) => {
    const inPdf = isPdfTab(activeTab.value);
    if (inPdf && dispatch && id === CommandIdentifier.FILE_SAVE)
      return sign(state, dispatch, view);
    const refusal = inPdf ? pdfRefusal(id) : null;
    if (refusal === null)
      return ((inPdf && IN_PDF[id]) || command)(state, dispatch, view);
    if (!dispatch) return false;
    announce(refusal);
    return true;
  };

/**
 * showSignatures lists the signatures of the PDF shown above the status
 * bar (SignaturesPopover.vue); a markdown tab has none
 */
export const showSignatures = (): Command => (_state, dispatch, view) => {
  if (!dispatch) return shownPdf.value !== null;
  if (!shownPdf.value) {
    announce("Signatures are checked in PDF tabs");
    return true;
  }
  if (shownPdf.value.signatures === null) {
    announce("The signatures are still being checked");
    return true;
  }
  signaturesPopover.value = { refocus: () => view?.focus() };
  return true;
};

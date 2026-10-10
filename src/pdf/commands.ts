import type { Command } from "prosemirror-state";

import { commandLabel } from "../commandList";
import { CommandIdentifier } from "../config";
import {
  activeTab,
  announce,
  isPdfTab,
  shownPdf,
  signaturesPopover,
} from "../state";

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
]);

// what signing says in a PDF tab: received PDFs are signed with PR 3b
export const SIGN_RECEIVED_REFUSAL =
  "Blank can't sign PDFs you received yet. Sign your own documents with Export signed PDF.";

/**
 * pdfRefusal returns what the command `id` says in a PDF tab instead of
 * running, or null for one that runs there: what its key announces, and the
 * tooltip of its disabled item in the main menu (mainMenuModel.ts). The one
 * table of these reasons.
 */
export const pdfRefusal = (id: CommandIdentifier): string | null => {
  if (RUN_IN_PDF.has(id)) return null;
  switch (id) {
    case CommandIdentifier.FILE_SAVE:
    case CommandIdentifier.FILE_SAVE_AS:
      return "Blank doesn't change PDFs, so there's nothing to save";
    case CommandIdentifier.UNDO:
    case CommandIdentifier.REDO:
      return "There's nothing to undo in a PDF";
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

/**
 * forPdf returns `command` as the command `id` runs: in a PDF tab, one that
 * doesn't run there can't (`can` is false), and its key says why
 */
export const forPdf =
  (id: CommandIdentifier, command: Command): Command =>
  (state, dispatch, view) => {
    const refusal = isPdfTab(activeTab.value) ? pdfRefusal(id) : null;
    if (refusal === null) return command(state, dispatch, view);
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

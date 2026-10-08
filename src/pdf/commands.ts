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
  CommandIdentifier.TAB_CLOSE,
  CommandIdentifier.TAB_NEXT,
  CommandIdentifier.TAB_PREVIOUS,
  CommandIdentifier.TAB_REOPEN,
  CommandIdentifier.TAB_MOVE_LEFT,
  CommandIdentifier.TAB_MOVE_RIGHT,
  CommandIdentifier.SIGNING_SIGNATURE,
  CommandIdentifier.SIGNING_INITIALS,
  CommandIdentifier.THEME_CYCLE,
  CommandIdentifier.VIEW_FOCUS_NEXT,
  CommandIdentifier.VIEW_FOCUS_PREVIOUS,
  CommandIdentifier.VIEW_TOOLBAR_FOCUS,
  CommandIdentifier.VIEW_FOCUS_MODE,
  CommandIdentifier.VIEW_SIGNATURES,
  CommandIdentifier.APP_SETTINGS,
]);

/**
 * pdfRefusal returns what the command `id` says in a PDF tab instead of
 * running, or null for one that runs there
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
    default:
      return `${commandLabel(id)} isn't for PDFs`;
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

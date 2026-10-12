import type { Command } from "prosemirror-state";

import { engineless } from "../engine/engine";
import { logWarning } from "../log";
import { pdfRules, signingKind } from "../signing/ipc";
import {
  activeTab,
  announce,
  isPdfTab,
  shownPdf,
  shownPdfRules,
  signingPlace,
} from "../state";
import { signRefusal, type ToolContext } from "./toolRules";

// Signing a PDF the user received, `pdf.sign` (Sign… on the signing
// toolbar, and Save's key in a PDF tab): for now it says that this comes
// next; the Sign dialog's stream wires it. What the PDF allows is read once
// it shows (`readShownRules`).

// what a PDF allows when it can't be read
const OPEN_RULES = {
  signed: false,
  docmdp: null,
  encrypted: false,
  damaged: false,
  locked: [],
};

export const SIGNING_NEXT = "Signing PDFs you received comes next";
export const SIGN_IN_PDF =
  "Sign… signs PDFs you received. Open one to sign it.";

/**
 * shownContext returns what the signing tools of the PDF shown may do
 */
export const shownContext = (): ToolContext => {
  const opened = shownPdf.value?.opened ?? null;
  const read = shownPdfRules.value;
  return {
    opened,
    rules: opened && read?.sha256 === opened.sha256 ? read.rules : null,
    engine: !engineless(),
    place: signingPlace.value,
  };
};

/**
 * signReceived starts signing the PDF shown, with what was placed on it
 */
export const signReceived = () => {
  const refusal = signRefusal(shownContext());
  announce(refusal ?? SIGNING_NEXT);
};

/**
 * signShownPdf is `pdf.sign`: it signs the PDF shown; asked whether it can,
 * it can in a PDF tab whose PDF allows it
 */
export const signShownPdf = (): Command => (_state, dispatch) => {
  const inPdf = isPdfTab(activeTab.value);
  if (!dispatch) return inPdf && signRefusal(shownContext()) === null;
  if (!inPdf) announce(SIGN_IN_PDF);
  else signReceived();
  return true;
};

/**
 * readShownRules reads what the PDF shown allows, once per file it opened;
 * one that can't be read leaves the tools waiting, which it logs by kind
 */
export const readShownRules = async () => {
  const doc = shownPdf.value;
  const sha256 = doc?.opened?.sha256;
  if (!doc || !sha256 || shownPdfRules.value?.sha256 === sha256) return;
  try {
    const rules = await pdfRules(doc.path);
    // still the PDF shown
    if (shownPdf.value?.opened?.sha256 === sha256)
      shownPdfRules.value = { sha256, rules };
  } catch (error) {
    // the tools don't wait for ever: the native side refuses what the PDF
    // doesn't allow when it signs
    logWarning("can't read what a PDF allows", signingKind(error));
    if (shownPdf.value?.opened?.sha256 === sha256)
      shownPdfRules.value = { sha256, rules: OPEN_RULES };
  }
};

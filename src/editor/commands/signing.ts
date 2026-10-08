import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { config } from "../../config";
import { focusBack } from "../../dom";
import { errorMessage } from "../../errors";
import { logError, logWarning } from "../../log";
import { fromDataUrl } from "../../images/dataUrl";
import {
  announce,
  importedFrom,
  language,
  path,
  savedMarks,
  signatureDialog,
  signDialog,
  signingPlace,
} from "../../state";
import { basename } from "../../paths";
import { PDF_FILTER } from "../../formats";
import { toPDF } from "../../exporters";
import {
  exportProblem,
  type ExportRequest,
  isEmpty,
  runExport,
} from "./exportAs";
import type { ExportResult } from "../../exporters";
import {
  checkPassphrase,
  signingKind,
  signingMessage,
  signPdf,
} from "../../signing/ipc";
import {
  loadCertificate,
  openCertificateDialog,
  reportSigningFailure,
} from "../../signing/certificate";
import { loadMarks, saveMark } from "../../signing/marks";
import type { Mark } from "../../signing/profile";
import { renderMark } from "../../signing/render";
import { chosenOf, targetsOf } from "../../signing/targets";
import { chooseImageFile } from "./editImage";

// The user's signature and initials: the dialog that makes them, which
// Settings ▸ Signing, the commands and a signed export open.

/**
 * openSignatureDialog opens the dialog of the user's signature or initials,
 * as saved. Once it closes, `refocus` gives the focus back to where it was
 * opened from; once it's saved, `then` goes on, e.g. to signing.
 */
export const openSignatureDialog = async (
  mark: Mark,
  refocus: () => void,
  then: () => void = () => undefined,
) => {
  try {
    await loadMarks();
  } catch (error) {
    logError(`failed to read the ${mark}`, error);
    sendNotification(`Failed to read your ${mark}: ${errorMessage(error)}`);
    return refocus();
  }
  signatureDialog.value = {
    mark,
    saved: savedMarks.value?.[mark] ?? null,
    name: config.value.signing.name,
    chooseFile: chooseImageFile,
    submit: async (source, image) => {
      const file = image ? fromDataUrl(image.src) : null;
      try {
        const made = await renderMark(
          source,
          file ? { ...file, clean: image!.clean } : undefined,
        );
        if (!made) return false;
        await saveMark(mark, made);
      } catch (error) {
        logError(`failed to save the ${mark}`, error);
        sendNotification(`Failed to save your ${mark}: ${errorMessage(error)}`);
        return false;
      }
      announce(mark === "signature" ? "Signature saved" : "Initials saved");
      return true;
    },
    done: () => {
      refocus();
      then();
    },
    cancel: refocus,
  };
};

/**
 * editMark opens the dialog of the user's signature or initials
 */
export const editMark =
  (mark: Mark): Command =>
  (_state, dispatch, view) => {
    if (dispatch) {
      void openSignatureDialog(mark, () => view?.focus());
    }
    return true;
  };

// what the notifications of a signed export are titled
const TITLE = "Signed PDF";

/**
 * exportSigned exports the document as a PDF with the user's signature in
 * one of its signature blocks, with their name, where they sign and today's
 * date. It makes their signature first if they have none yet.
 */
export const exportSigned = (): Command => (state, dispatch, view) => {
  // asked whether it can run, e.g. by the main menu: with something to
  // export, and nothing done
  if (!dispatch) return !isEmpty(state);
  const request: ExportRequest = {
    title: TITLE,
    exporter: toPDF,
    filters: [PDF_FILTER],
    suffix: " signed",
  };
  if (exportProblem(state, request)) return true;
  if (targetsOf(state.doc).length === 0) {
    sendNotification({
      title: TITLE,
      body: "This document has no signature block. Insert one from the blocks pane, under Signing.",
    });
    return true;
  }
  if (!view) return true;
  // the document's file now, before another tab may show
  const file = { path: path.value, importedFrom: importedFrom.value };
  const refocus = () => view.focus();
  const sign = () => {
    const signature = savedMarks.value?.signature;
    // the document as it is once the user's signature is there
    const targets = targetsOf(view.state.doc);
    if (!signature || targets.length === 0) return;
    const name = config.value.signing.name;
    const named = file.path ?? file.importedFrom;
    signDialog.value = {
      title: named ? basename(named).replace(/\.[^.]+$/, "") : "Untitled",
      targets,
      chosen: chosenOf(targets, name),
      place: signingPlace.value,
      warnings: file.importedFrom
        ? [
            "Blank’s layout of this Word document can differ from Word’s. Check every page before you send it, or ask the sender for a PDF.",
          ]
        : [],
      check: async (passphrase) => {
        try {
          await checkPassphrase(passphrase);
          return null;
        } catch (error) {
          logWarning("the passphrase didn't open the key", signingKind(error));
          return signingMessage(error, "Blank couldn't open your key");
        }
      },
      createCertificate: (opener) =>
        void openCertificateDialog("create", focusBack(opener)),
      submit: (pos, place, passphrase) => {
        refocus();
        signNow(view, file, request, {
          pos,
          index: targets.findIndex((target) => target.pos === pos),
          png: signature.png,
          place,
          passphrase,
        });
      },
      cancel: refocus,
    };
  };
  void Promise.all([loadMarks(), loadCertificate()])
    .then(() => {
      if (savedMarks.value?.signature) sign();
      // their signature first, then on to signing
      else void openSignatureDialog("signature", refocus, sign);
    })
    .catch((error: unknown) =>
      reportSigningFailure(
        "failed to read the signature",
        error,
        "Blank couldn't read your signature",
        TITLE,
      ),
    );
  return true;
};

/**
 * signNow exports the document as it is now, the dialogs closed, with the
 * block chosen filled in: the one still at `pos`, else the one of its
 * number among them
 */
const signNow = (
  view: EditorView,
  file: { path: string | null; importedFrom: string | null },
  request: ExportRequest,
  {
    pos,
    index,
    png,
    place,
    passphrase,
  }: {
    pos: number;
    index: number;
    png: string;
    place: string;
    passphrase: string | null;
  },
) => {
  const state = view.state;
  const targets = targetsOf(state.doc);
  const { name, dateFormat } = config.value.signing;
  const target =
    targets.find((target) => target.pos === pos) ??
    targets[index] ??
    targets[0];
  if (!target) {
    sendNotification({
      title: TITLE,
      body: "The signature block is gone. Nothing was signed.",
    });
    return;
  }
  const signer = target.name || name;
  void runExport(state, file, {
    ...request,
    context: {
      signed: {
        pos: target.pos,
        src: png,
        signing: {
          name: signer,
          place,
          date: new Date(),
          format: dateFormat,
          language: language.value,
        },
      },
    },
    written: () => {
      if (place) signingPlace.value = place;
      announce("Signed and saved");
    },
    ...(passphrase === null
      ? {}
      : {
          finish: (result: ExportResult) =>
            signExport(result, passphrase, { name: signer, place }),
        }),
  });
};

/**
 * signExport signs an exported PDF with the user's key, its field over the
 * signature block the export filled in. A failure stops the export with
 * what went wrong, so nothing unsigned is written under the signed name.
 */
const signExport = async (
  result: ExportResult,
  passphrase: string,
  { name, place }: { name: string; place: string },
) => {
  const box = result.signatureBox;
  if (!box) throw new Error("the signature block isn't in the PDF");
  try {
    return await signPdf(result.contents, passphrase, {
      page: box.page + 1,
      rect: [box.x, box.y, box.width, box.height],
      name: name || null,
      location: place || null,
      reason: null,
      timestampServer: config.value.signing.timestampServer || null,
    });
  } catch (error) {
    throw new Error(signingMessage(error, "Blank couldn't sign the PDF"), {
      cause: error,
    });
  }
};

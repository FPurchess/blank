import type { Command } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { config } from "../../config";
import { focusBack } from "../../dom";
import { errorMessage } from "../../errors";
import { logError, logWarning } from "../../log";
import { fromDataUrl } from "../../images/dataUrl";
import {
  activeTabId,
  announce,
  importedFrom,
  path,
  savedMarks,
  signatureDialog,
  signDialog,
  signingCertificate,
  signingDates,
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
 * signerName returns the name the user signs as: their certificate's, which
 * a digital signature carries, else the one in Settings ▸ Signing
 */
const signerName = () =>
  signingCertificate.value?.name || config.value.signing.name;

/**
 * passphraseProblem says why a passphrase didn't open the user's key, with
 * a way on for a forgotten one
 */
const passphraseProblem = (error: unknown) =>
  signingKind(error) === "wrongPassphrase"
    ? "The passphrase is wrong. Forgot it? Sign with a picture only, or remove your certificate in Settings ▸ Signing and create a new one."
    : signingMessage(error, "Blank couldn't open your key");

/**
 * exportSigned exports the document as a PDF with the user's signature in
 * one of its signature blocks, with their name, where they sign and today's
 * date. It makes their signature first if they have none yet. It signs the
 * tab that showed when it ran, and nothing once another shows.
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
  // an empty document leaves the key to others, as the export does
  const problem = exportProblem(state, request);
  if (problem) return problem !== "empty";
  if (targetsOf(state.doc).length === 0) {
    sendNotification({
      title: TITLE,
      body: "This document has no signature block. Insert one from the blocks pane, under Signing.",
    });
    return true;
  }
  if (!view) return true;
  // the document's tab and file now, before another tab may show
  const tab = activeTabId.value;
  const file = { path: path.value, importedFrom: importedFrom.value };
  const shown = () => {
    if (activeTabId.value === tab) return true;
    sendNotification({
      title: TITLE,
      body: "Another tab shows now, so nothing was signed. Sign again with Export signed PDF.",
    });
    return false;
  };
  const refocus = () => view.focus();
  const sign = () => {
    const signature = savedMarks.value?.signature;
    if (!signature || !shown()) return;
    // the document as it is once the user's signature is there
    const targets = targetsOf(view.state.doc);
    if (targets.length === 0) return;
    const name = config.value.signing.name;
    const named = file.path ?? file.importedFrom;
    signDialog.value = {
      title: named ? basename(named).replace(/\.[^.]+$/, "") : "Untitled",
      targets,
      chosen: chosenOf(targets, name),
      place: signingPlace.value,
      signer: signerName(),
      warnings: file.importedFrom
        ? [
            "Blank's layout of this Word document can differ from Word's. Check every page before you send it, or ask the sender for a PDF.",
          ]
        : [],
      check: async (passphrase) => {
        try {
          await checkPassphrase(passphrase);
          return null;
        } catch (error) {
          logWarning("the passphrase didn't open the key", signingKind(error));
          return passphraseProblem(error);
        }
      },
      createCertificate: (opener) =>
        void openCertificateDialog("create", focusBack(opener)),
      submit: (pos, place, passphrase) => {
        refocus();
        if (!shown()) return;
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
 * number among them; with neither, it signs nothing
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
  const target = targets.find((target) => target.pos === pos) ?? targets[index];
  if (!target) {
    sendNotification({
      title: TITLE,
      body: "The signature block is gone. Nothing was signed.",
    });
    return;
  }
  // the place the page shows: the block's own, else where the user signs
  const shownPlace = target.place || place;
  const signer = signerName();
  void runExport(state, file, {
    ...request,
    context: {
      signed: {
        pos: target.pos,
        src: png,
        signing: {
          name: signer,
          place: shownPlace,
          date: new Date(),
          ...signingDates.value,
        },
      },
    },
    written: () => {
      if (shownPlace) signingPlace.value = shownPlace;
      announce("Signed and saved");
    },
    ...(passphrase === null
      ? {}
      : {
          finish: (result: ExportResult) =>
            signExport(result, passphrase, shownPlace),
        }),
  });
};

/**
 * signExport signs an exported PDF with the user's key, its field over the
 * signature block the export filled in, signed at `place`; the native side
 * names the certificate's holder as who signed it. A failure stops the
 * export with what went wrong, so nothing unsigned is written under the
 * signed name.
 */
const signExport = async (
  result: ExportResult,
  passphrase: string,
  place: string,
) => {
  const box = result.signatureBox;
  if (!box) throw new Error("the signature block isn't in the PDF");
  const timestampServer = config.value.signing.timestampServer;
  try {
    return await signPdf(result.contents, passphrase, {
      page: box.page + 1,
      rect: [box.x, box.y, box.width, box.height],
      location: place || null,
      reason: null,
      timestampServer: timestampServer || null,
    });
  } catch (error) {
    throw new Error(signingFailure(error, timestampServer), { cause: error });
  }
};

/**
 * signingFailure says why a PDF wasn't signed, that nothing was saved, and,
 * while a timestamp server is set, how to sign without it
 */
const signingFailure = (error: unknown, timestampServer: string) => {
  const message = signingMessage(error, "Blank couldn't sign the PDF").replace(
    /\.?$/,
    ".",
  );
  return [
    message,
    "Nothing was saved.",
    timestampServer && signingKind(error) === "failed"
      ? "If the timestamp server is down, sign without a timestamp: clear it in Settings ▸ Signing."
      : "",
  ]
    .filter(Boolean)
    .join(" ");
};

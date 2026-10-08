import type { Command, EditorState } from "prosemirror-state";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { config } from "../../config";
import { errorMessage } from "../../errors";
import { logError } from "../../log";
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
  type SignTarget,
} from "../../state";
import { basename } from "../../paths";
import { PDF_FILTER } from "../../formats";
import { toPDF } from "../../exporters";
import { signatureLines } from "../../markdown/blocks/signature";
import { canExport, isEmpty, runExport } from "./exportAs";
import { loadMarks, saveMark } from "../../signing/marks";
import type { Mark } from "../../signing/profile";
import { renderMark } from "../../signing/render";
import { chooseImageFile } from "./editImage";

// The user's signature and initials: the dialog that makes them, which
// Settings ▸ Signing, the commands and a signed export open.

/**
 * openSignatureDialog opens the dialog of the user's signature or initials,
 * as saved; `saved` is told once it is saved
 */
export const openSignatureDialog = async (
  mark: Mark,
  saved: () => void = () => undefined,
) => {
  await loadMarks();
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
      saved();
      return true;
    },
    cancel: () => undefined,
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
 * targetsOf returns the signature blocks of a document, by position
 */
const targetsOf = (state: EditorState): SignTarget[] => {
  const targets: SignTarget[] = [];
  state.doc.forEach((node, pos) => {
    if (node.type.name !== "signature") return;
    const label =
      signatureLines(node.attrs).length > 1
        ? signatureLines(node.attrs)[0]
        : "";
    targets.push({ pos, label: label || `Signature ${targets.length + 1}` });
  });
  return targets;
};

/**
 * chosenOf returns the block the user most likely signs: the one with their
 * name, else one that names nobody, else the first
 */
const chosenOf = (state: EditorState, targets: SignTarget[], name: string) => {
  const named = (pos: number) => state.doc.nodeAt(pos)?.attrs.name as string;
  return (
    targets.find((target) => name && named(target.pos) === name) ??
    targets.find((target) => !named(target.pos)) ??
    targets[0]
  ).pos;
};

/**
 * exportSigned exports the document as a PDF with the user's signature in
 * one of its signature blocks, with their name, where they sign and today's
 * date. It makes their signature first if they have none yet.
 */
export const exportSigned = (): Command => (state, dispatch) => {
  // asked whether it can run, e.g. by the main menu: with something to
  // export, and nothing done
  if (!dispatch) return !isEmpty(state);
  const request = {
    title: TITLE,
    exporter: toPDF,
    filters: [PDF_FILTER],
    suffix: " signed",
  };
  if (!canExport(state, request)) return true;
  const targets = targetsOf(state);
  if (targets.length === 0) {
    sendNotification({
      title: TITLE,
      body: "This document has no signature block. Insert one from the blocks pane, under Signing.",
    });
    return true;
  }
  // the document's file now, before another tab may show
  const docPath = path.value;
  const file = path.value ?? importedFrom.value;
  const sign = () => {
    const signature = savedMarks.value?.signature;
    if (!signature) return;
    const { name, dateFormat } = config.value.signing;
    signDialog.value = {
      title: file ? basename(file).replace(/\.[^.]+$/, "") : "Untitled",
      targets,
      chosen: chosenOf(state, targets, name),
      place: signingPlace.value,
      warnings: importedFrom.value
        ? [
            "Blank’s layout of this Word document can differ from Word’s. Check every page before you send it, or ask the sender for a PDF.",
          ]
        : [],
      submit: (pos, place) => {
        if (place) signingPlace.value = place;
        void runExport(state, docPath, {
          ...request,
          context: {
            signed: {
              pos,
              src: signature.png,
              signing: {
                name: (state.doc.nodeAt(pos)?.attrs.name as string) || name,
                place,
                date: new Date(),
                format: dateFormat,
                language: language.value,
              },
            },
          },
          written: () => announce("Signed and saved"),
        });
      },
      cancel: () => undefined,
    };
  };
  void loadMarks().then(() => {
    if (savedMarks.value?.signature) sign();
    // their signature first, then on to signing
    else void openSignatureDialog("signature", sign);
  });
  return true;
};

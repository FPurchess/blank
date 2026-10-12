import type { Command } from "prosemirror-state";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { config } from "../config";
import {
  SIGNED_PDF_TITLE,
  signDialogBase,
  signerName,
  signingFailure,
} from "../editor/commands/signing";
import { showSettings } from "../editor/commands/settings";
import suggestPath from "../editor/commands/suggestPath";
import { PDF_FILTER } from "../formats";
import { logError, logWarning } from "../log";
import { basename } from "../paths";
import {
  type InitialsChoice,
  type InitialsSide,
  initialsRect,
} from "../signing/initials";
import { forTheLog, pdfRules, signingKind, signPdf } from "../signing/ipc";
import { loadCertificate, reportSigningFailure } from "../signing/certificate";
import { loadMarks } from "../signing/marks";
import {
  activeTab,
  activeTabId,
  announce,
  isPdfTab,
  shownPdf,
  shownPdfRules,
  signDialog,
  type SignChoices,
  signingInitials,
  signingPlace,
  signingTabs,
  stampBooks,
} from "../state";
import type { PdfTabDocument } from "./document";
import type { OpenedPdf } from "./ipc";
import { PDF_VIEW_ID } from "./placeholder";
import { isOpen } from "./places";
import {
  shownContext,
  shownFilled,
  shownPlaces,
  shownStamps,
} from "./placesRead";
import { receivedPlan } from "./receivedPlan";
import { newStamp } from "./stampActions";
import {
  changeStamps,
  clearSheet,
  fillsOf,
  returnTo,
  stampsOf,
} from "./stampBooks";
import { stampPdf } from "./stampEngine";
import {
  onPages,
  scaledSpec,
  type Stamp,
  toggleRepeat,
  withoutStamp,
  withStamp,
} from "./stampModel";
import { signRefusal, toolRefusal, visibleRefusal } from "./toolRules";

// Signing a PDF the user received, `pdf.sign` (Sign… on the signing
// toolbar, Save's key in a PDF tab, and Sign… when a tab with stamps
// closes): the Sign dialog, then the save dialog, then the stamps' PDFs and
// the signer, which writes the fills, the stamps and the signature as
// updates of the file the tab opened (see .claude/rules/signing.md). What
// the PDF allows is read once it shows (`readShownRules`). While it signs,
// the tab's stamps, fills and places wait (`signingTabs`).

// what a PDF allows when it can't be read
const OPEN_RULES = {
  signed: false,
  docmdp: null,
  encrypted: false,
  damaged: false,
  locked: [],
};

export const SIGN_IN_PDF =
  "Sign… signs PDFs you received. Open one to sign it.";
const TITLE = SIGNED_PDF_TITLE;

declare global {
  interface Window {
    // where E2E has a signed PDF saved, since the save dialog can't be
    // automated: a debug build saves there once a test sets it
    blankTestSavePath?: string;
  }
}

/**
 * chooseDestination asks where the signed PDF goes, suggesting
 * `suggested`; null when the user cancelled
 */
const chooseDestination = (suggested: string | undefined) =>
  __TEST_HOOKS__ && window.blankTestSavePath
    ? Promise.resolve(window.blankTestSavePath)
    : save({ filters: [PDF_FILTER], defaultPath: suggested });

/**
 * sideOf returns the corner initials at `stamp` are nearest to
 */
const sideOf = (stamp: Stamp, width: number): InitialsSide =>
  stamp.rect[0] + stamp.rect[2] / 2 < width / 2 ? "left" : "right";

/**
 * initialsSetter returns what the Sign dialog's Initials row does in the
 * tab `tab`: on, the initials repeat on every page (those placed, else new
 * ones in the corner chosen of the first page); off, they don't (and those
 * the row added go again); another corner moves them there
 */
const initialsSetter = (tab: string) => {
  let added: string | null = null;
  return async ({ on, side }: InitialsChoice) => {
    const opened = shownPdf.value?.opened;
    if (activeTabId.value !== tab || !opened) return;
    const stamps = onPages(stampsOf(tab), opened.pages.length);
    const repeated = stamps.find(
      (stamp) => stamp.kind === "initials" && stamp.repeat,
    );
    if (!on) {
      if (!repeated) return;
      changeStamps(
        tab,
        repeated.id === added
          ? withoutStamp(stampsOf(tab), repeated.id)
          : toggleRepeat(stampsOf(tab), repeated.id),
      );
      if (repeated.id === added) added = null;
      return;
    }
    if (repeated) {
      const page = opened.pages[repeated.page];
      if (sideOf(repeated, page.width) !== side)
        changeStamps(
          tab,
          withStamp(stampsOf(tab), {
            ...repeated,
            rect: initialsRect(page, side, [
              repeated.rect[2],
              repeated.rect[3],
            ]),
          }),
        );
      return;
    }
    const placed = stamps.find((stamp) => stamp.kind === "initials");
    if (placed) {
      changeStamps(tab, toggleRepeat(stampsOf(tab), placed.id));
      return;
    }
    const made = await newStamp("initials");
    if (!made || activeTabId.value !== tab) return;
    const stamp: Stamp = {
      ...made,
      page: 0,
      rect: initialsRect(opened.pages[0], side, made.natural),
      repeat: true,
    };
    added = stamp.id;
    changeStamps(tab, withStamp(stampsOf(tab), stamp), {
      sha256: opened.sha256,
    });
  };
};

/**
 * signReceived signs the PDF shown with what was placed on it: the Sign
 * dialog, then where to save it, then the signer. Without a signature
 * placed, the dialog offers an invisible digital signature, or asks for
 * one on the page first.
 */
export const signReceived = () => {
  const refusal = signRefusal(shownContext());
  if (refusal) {
    announce(refusal);
    return;
  }
  const tab = activeTabId.value;
  const doc = shownPdf.value;
  const opened = doc?.opened;
  if (!tab || !doc || !opened) return;
  const pages = () => document.getElementById(PDF_VIEW_ID);
  const refocus = () => pages()?.focus();
  const shown = () => activeTabId.value === tab && shownPdf.value === doc;
  const ask = () => {
    if (!shown()) return;
    const stamps = shownStamps();
    const repeated = stamps.find(
      (stamp) => stamp.kind === "initials" && stamp.repeat,
    );
    const context = shownContext();
    const initialsReason = toolRefusal("initials", context);
    const visibleReason = visibleRefusal(context);
    const setInitials = initialsSetter(tab);
    // what the tab held before the Initials row changed it, which a cancel
    // brings back
    const before = stampBooks.value.get(tab);
    let changed = false;
    signDialog.value = {
      ...signDialogBase(refocus),
      mode: "pdf",
      title: basename(doc.path).replace(/\.pdf$/i, ""),
      targets: [],
      chosen: 0,
      warnings: [],
      confirmPages: false,
      initials: {
        on: !!repeated,
        side: repeated
          ? sideOf(repeated, opened.pages[repeated.page].width)
          : signingInitials.value.side,
        ...(initialsReason ? { reason: initialsReason } : {}),
      },
      setInitials: (choice) => {
        changed = true;
        void setInitials(choice);
      },
      stamped: stamps.some((stamp) => stamp.kind === "signature"),
      ...(visibleReason ? { visibleRefusal: visibleReason } : {}),
      emptyFields: shownPlaces.value.filter((place) =>
        isOpen(place, shownFilled.value),
      ).length,
      manage: () => {
        refocus();
        showSettings("signing");
      },
      submit: (choices) => {
        refocus();
        if (shown()) void signNow(tab, choices);
      },
      cancel: () => {
        if (changed) returnTo(tab, before);
        refocus();
      },
    };
  };
  void Promise.all([loadMarks(), loadCertificate()])
    .then(ask)
    .catch((error: unknown) =>
      reportSigningFailure(
        "failed to read the signature",
        error,
        "Blank couldn't read your signature",
        TITLE,
      ),
    );
};

/**
 * setSigning marks the tab `tab` as being signed, or not any more
 */
const setSigning = (tab: string, on: boolean) => {
  const next = new Set(signingTabs.value);
  if (on) next.add(tab);
  else next.delete(tab);
  signingTabs.value = next;
};

/**
 * writeSigned writes the PDF of the tab `tab` signed as chosen: where the
 * user says, then the stamps' PDFs (those on the pages it has), then the
 * signer
 * @returns where it went, null when the user didn't choose a place
 */
const writeSigned = async (
  tab: string,
  doc: PdfTabDocument,
  opened: OpenedPdf,
  choices: SignChoices,
) => {
  const dest = await chooseDestination(
    suggestPath("pdf", { path: doc.path, importedFrom: null }, " signed"),
  );
  if (dest === null) return null;
  const { plan, parts } = receivedPlan({
    stamps: onPages(stampsOf(tab), opened.pages.length),
    digital: choices.passphrase !== null,
    name: signerName(),
    place: choices.place,
    reason: choices.reason,
    timestampServer: config.value.signing.timestampServer,
  });
  await loadMarks();
  const pdfs: Uint8Array[] = [];
  for (const stamp of parts)
    pdfs.push(await stampPdf(scaledSpec(stamp), stamp.rect[2], stamp.rect[3]));
  const bytes = await signPdf(
    {
      passphrase: choices.passphrase,
      source: {
        kind: "tab",
        tab,
        path: doc.path,
        sha256: opened.sha256,
        fills: [...fillsOf(tab)],
      },
      plan,
    },
    pdfs,
  );
  await writeFile(dest, bytes);
  return dest;
};

/**
 * savedMessage says that the PDF was saved as `file`: signed, when it was
 * signed digitally; else saved, with the user's signature as a picture
 * when one was placed, since the PDF's signatures don't count it
 */
export const savedMessage = (
  file: string,
  digital: boolean,
  pictured: boolean,
) =>
  digital
    ? `Signed and saved as ${file}`
    : pictured
      ? `Saved as ${file}, your signature shows as a picture`
      : `Saved as ${file}`;

/**
 * signNow saves the PDF of the tab `tab` signed as chosen (writeSigned);
 * meanwhile its stamps, fills and places wait. Once it's written, the
 * tab's stamps and fills are done with, if they're still those it signed,
 * and the signed PDF opens in a tab of its own if asked. Nothing is written
 * when anything fails.
 */
const signNow = async (tab: string, choices: SignChoices) => {
  const doc = shownPdf.value;
  const opened = doc?.opened;
  if (!doc || !opened || signingTabs.value.has(tab)) return;
  // what is signed
  const book = stampBooks.value.get(tab)?.book;
  setSigning(tab, true);
  let dest: string | null;
  try {
    dest = await writeSigned(tab, doc, opened, choices);
  } catch (error) {
    logError("failed to sign a PDF", forTheLog(error));
    const body = signingFailure(error);
    sendNotification({ title: TITLE, body });
    announce(body);
    return;
  } finally {
    setSigning(tab, false);
  }
  if (dest === null) return;
  if (choices.place) signingPlace.value = choices.place;
  signingInitials.value = choices.initials;
  const pictured = (book?.stamps ?? []).some(
    (stamp) => stamp.kind === "signature",
  );
  if (stampBooks.value.get(tab)?.book === book) clearSheet(tab);
  const saved = savedMessage(
    basename(dest),
    choices.passphrase !== null,
    pictured,
  );
  announce(saved);
  sendNotification({ title: TITLE, body: saved });
  if (choices.open) {
    // the tabs ask this module to sign when a tab closes, so they're loaded
    // only here
    const { openPaths } = await import("../editor/tabs");
    await openPaths([dest]);
  }
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
 * one that can't be read allows anything, and the signer refuses what it
 * doesn't; that's logged by kind
 */
export const readShownRules = async () => {
  const doc = shownPdf.value;
  const sha256 = doc?.opened?.sha256;
  if (!doc || !sha256 || shownPdfRules.value?.sha256 === sha256) return;
  try {
    const rules = await pdfRules(doc.path, sha256);
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

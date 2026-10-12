import type { Command } from "prosemirror-state";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { config } from "../config";
import {
  openSignatureDialog,
  passphraseProblem,
  signerName,
  signingFailure,
} from "../editor/commands/signing";
import { showSettings } from "../editor/commands/settings";
import suggestPath from "../editor/commands/suggestPath";
import { engineless } from "../engine/engine";
import { focusBack } from "../dom";
import { PDF_FILTER } from "../formats";
import { logError, logWarning } from "../log";
import { basename } from "../paths";
import { formatSigningDate } from "../signing/date";
import { type InitialsChoice, type InitialsSide } from "../signing/initials";
import {
  checkPassphrase,
  forTheLog,
  pdfRules,
  signingKind,
  signPdf,
} from "../signing/ipc";
import {
  loadCertificate,
  openCertificateDialog,
  reportSigningFailure,
} from "../signing/certificate";
import { loadMarks } from "../signing/marks";
import { languageName } from "../spellcheck/service";
import {
  activeTab,
  activeTabId,
  announce,
  isPdfTab,
  shownPdf,
  shownPdfRules,
  signDialog,
  type SignChoices,
  signingCertificate,
  signingDates,
  signingInitials,
  signingPlace,
} from "../state";
import { PDF_VIEW_ID } from "./placeholder";
import { shownFilled, shownPlaces } from "./placesRead";
import { receivedPlan } from "./receivedPlan";
import { newStamp } from "./stampActions";
import { changeStamps, clearSheet, fillsOf, stampsOf } from "./stampBooks";
import { stampPdf } from "./stampEngine";
import {
  EDGE,
  scaledSpec,
  type Stamp,
  toggleRepeat,
  withoutStamp,
  withStamp,
} from "./stampModel";
import { signRefusal, type ToolContext, toolRefusal } from "./toolRules";

// Signing a PDF the user received, `pdf.sign` (Sign… on the signing
// toolbar, Save's key in a PDF tab, and Sign… when a tab with stamps
// closes): the Sign dialog, then the save dialog, then the stamps' PDFs and
// the signer, which writes the fills, the stamps and the signature as
// updates of the file the tab opened (see .claude/rules/signing.md). What
// the PDF allows is read once it shows (`readShownRules`).

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
const TITLE = "Signed PDF";

declare global {
  interface Window {
    // where E2E has a signed PDF saved, since the save dialog can't be
    // automated: a debug build saves there once a test sets it
    blankTestSavePath?: string;
  }
}

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
  };
};

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
 * cornerOf returns where initials of `stamp`'s size go in the corner `side`
 * of a page `page` large
 */
const cornerOf = (
  stamp: Pick<Stamp, "rect">,
  side: InitialsSide,
  page: { width: number; height: number },
): Stamp["rect"] => {
  const [, , w, h] = stamp.rect;
  return [
    side === "right" ? page.width - EDGE - w : EDGE,
    page.height - EDGE - h,
    w,
    h,
  ];
};

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
    const stamps = stampsOf(tab);
    const repeated = stamps.find(
      (stamp) => stamp.kind === "initials" && stamp.repeat,
    );
    if (!on) {
      if (!repeated) return;
      changeStamps(
        tab,
        repeated.id === added
          ? withoutStamp(stamps, repeated.id)
          : toggleRepeat(stamps, repeated.id),
      );
      if (repeated.id === added) added = null;
      return;
    }
    if (repeated) {
      const page = opened.pages[repeated.page];
      if (sideOf(repeated, page.width) !== side)
        changeStamps(
          tab,
          withStamp(stamps, {
            ...repeated,
            rect: cornerOf(repeated, side, page),
          }),
        );
      return;
    }
    const placed = stamps.find((stamp) => stamp.kind === "initials");
    if (placed) {
      changeStamps(tab, toggleRepeat(stamps, placed.id));
      return;
    }
    const made = await newStamp("initials");
    if (!made || activeTabId.value !== tab) return;
    const stamp: Stamp = {
      ...made,
      page: 0,
      rect: cornerOf(
        { rect: [0, 0, made.natural[0], made.natural[1]] },
        side,
        opened.pages[0],
      ),
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
 * dialog, then where to save it, then the signer. It makes the user's
 * signature first if they have none and placed nothing yet.
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
    const stamps = stampsOf(tab);
    const repeated = stamps.find(
      (stamp) => stamp.kind === "initials" && stamp.repeat,
    );
    const initialsReason = toolRefusal("initials", shownContext());
    const setInitials = initialsSetter(tab);
    const open = shownPlaces.value.filter(
      (place) => !shownFilled.value.has(place.id),
    );
    signDialog.value = {
      mode: "pdf",
      title: basename(doc.path).replace(/\.pdf$/i, ""),
      targets: [],
      chosen: 0,
      place: signingPlace.value,
      signer: signerName(),
      today: {
        date: formatSigningDate(
          new Date(),
          signingDates.value.language,
          signingDates.value.format,
        ),
        language: languageName(signingDates.value.language),
      },
      warnings: [],
      confirmPages: false,
      initials: {
        on: !!repeated,
        side: repeated
          ? sideOf(repeated, opened.pages[repeated.page].width)
          : signingInitials.value.side,
        ...(initialsReason ? { reason: initialsReason } : {}),
      },
      setInitials: (choice) => void setInitials(choice),
      stamped: stamps.some((stamp) => stamp.kind === "signature"),
      emptyFields: open.length,
      check: async (passphrase) => {
        try {
          await checkPassphrase(passphrase);
          return null;
        } catch (error) {
          logWarning("the passphrase didn't open the key", signingKind(error));
          return passphraseProblem(error);
        }
      },
      createCertificate: (opener) => {
        const back = focusBack(opener);
        void openCertificateDialog("create", () => {
          if (!signingCertificate.value) back();
        });
      },
      createInitials: (opener) =>
        void openSignatureDialog("initials", focusBack(opener)),
      manage: () => {
        refocus();
        showSettings("signing");
      },
      submit: (choices) => {
        refocus();
        if (shown()) void signNow(tab, choices);
      },
      cancel: refocus,
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
 * signNow saves the PDF of the tab `tab` signed as chosen: where the user
 * says, then the stamps' PDFs, then the signer. Once it's written, the
 * tab's stamps and fills are done with, and the signed PDF opens in a tab
 * of its own if asked. Nothing is written when anything fails.
 */
const signNow = async (tab: string, choices: SignChoices) => {
  const doc = shownPdf.value;
  const opened = doc?.opened;
  if (!doc || !opened) return;
  const dest = await chooseDestination(
    suggestPath("pdf", { path: doc.path, importedFrom: null }, " signed"),
  );
  if (dest === null) return;
  const digital = choices.passphrase !== null;
  const { plan, parts } = receivedPlan({
    stamps: stampsOf(tab),
    digital,
    name: signerName(),
    place: choices.place,
    reason: choices.reason,
    timestampServer: config.value.signing.timestampServer,
  });
  let bytes: Uint8Array;
  try {
    await loadMarks();
    const pdfs: Uint8Array[] = [];
    for (const stamp of parts)
      pdfs.push(
        await stampPdf(scaledSpec(stamp), stamp.rect[2], stamp.rect[3]),
      );
    bytes = await signPdf(
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
  } catch (error) {
    logError("failed to sign a PDF", forTheLog(error));
    const body = signingFailure(error);
    sendNotification({ title: TITLE, body });
    announce(body);
    return;
  }
  if (choices.place) signingPlace.value = choices.place;
  clearSheet(tab);
  announce(`Signed and saved as ${basename(dest)}`);
  sendNotification({
    title: TITLE,
    body: `Signed and saved as ${basename(dest)}`,
  });
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
 * one that can't be read leaves the tools waiting, which it logs by kind
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

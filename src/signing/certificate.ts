import { open, save } from "@tauri-apps/plugin-dialog";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { logError } from "../log";
import { config } from "../config";
import { basename } from "../paths";
import {
  announce,
  certificateDialog,
  confirmDialog,
  signingCertificate,
} from "../state";
import {
  certificate,
  type CertificateInfo,
  createCertificate,
  exportCertificate,
  importKey,
  removeCertificate,
  signingMessage,
} from "./ipc";

// The user's certificate, published in `signingCertificate`: read when first
// needed, made, imported, exported and removed.

// what the notifications about the certificate are titled
const TITLE = "Certificate";

/**
 * reportSigningFailure logs what failed and tells the user in a
 * notification: what the native side said, else `fallback`
 */
export const reportSigningFailure = (
  context: string,
  error: unknown,
  fallback: string,
  title = TITLE,
) => {
  logError(context, error);
  sendNotification({ title, body: signingMessage(error, fallback) });
};

let reading: Promise<void> | null = null;

/**
 * loadCertificate reads the user's certificate once
 */
export const loadCertificate = () =>
  (reading ??= certificate()
    .then((info) => {
      signingCertificate.value = info;
    })
    .catch((error: unknown) => {
      logError("failed to read the certificate", error);
      signingCertificate.value = null;
    }));

/**
 * resetCertificate forgets what was read, for the tests: the module's
 * state, which the state's ref alone doesn't reset
 */
export const resetCertificate = () => {
  reading = null;
  signingCertificate.value = undefined;
};

const publish = (info: CertificateInfo | null, message: string) => {
  signingCertificate.value = info;
  announce(message);
};

// the key files Blank can import, and how it saves them
const KEY_FILTERS = [{ name: "Key files", extensions: ["p12", "pfx"] }];

/**
 * chooseKeyFile asks for a key file to import, or returns null
 */
const chooseKeyFile = async () => {
  const path = await open({ filters: KEY_FILTERS }).catch((error: unknown) => {
    logError("failed to show the dialog to choose a key file", error);
    return null;
  });
  return typeof path === "string" ? path : null;
};

/**
 * saveCertificate asks where to save the certificate (for others to trust
 * it) or the key file (a backup), and saves it there
 */
export const saveCertificate = async (key: boolean) => {
  const name = signingCertificate.value?.name || "certificate";
  const path = await save({
    defaultPath: key ? `${name} key.p12` : `${name}.cer`,
    filters: key
      ? KEY_FILTERS
      : [{ name: "Certificates", extensions: ["cer"] }],
  }).catch((error: unknown) => {
    logError("failed to show the dialog to save the certificate", error);
    return null;
  });
  if (!path) return;
  try {
    await exportCertificate(key, path);
    announce(key ? "Key backed up" : "Certificate saved");
  } catch (error) {
    reportSigningFailure(
      key ? "failed to back up the key" : "failed to save the certificate",
      error,
      key
        ? "Blank couldn't back up your key"
        : "Blank couldn't save your certificate",
    );
  }
};

/**
 * forgetCertificate removes the user's key and certificate
 */
export const forgetCertificate = async () => {
  try {
    await removeCertificate();
    publish(null, "Certificate removed");
  } catch (error) {
    reportSigningFailure(
      "failed to remove the certificate",
      error,
      "Blank couldn't remove your certificate",
    );
  }
};

/**
 * confirmRemoval asks before the certificate is removed, which can't be
 * undone, and offers to back up the key first; `refocus` gives the focus
 * back once the question is closed
 */
export const confirmRemoval = (refocus: () => void) => {
  confirmDialog.value = {
    title: "Remove your certificate?",
    text: "Blank can't bring it back. Signatures you made stay valid, but you can't sign with it again.",
    action: "Remove",
    secondary: { label: "Back up key…", run: () => void saveCertificate(true) },
    // once it's gone, so the focus finds what took its place
    confirm: () => void forgetCertificate().then(refocus),
    cancel: refocus,
  };
};

/**
 * openCertificateDialog asks for what makes the user a certificate, or, for
 * `import`, for a key file and its passphrase. Once it closes, `refocus`
 * gives the focus back, and once the certificate is there `done` is told.
 */
export const openCertificateDialog = async (
  mode: "create" | "import",
  refocus: () => void,
  done: () => void = () => undefined,
) => {
  const path = mode === "import" ? await chooseKeyFile() : null;
  if (mode === "import" && !path) return refocus();
  certificateDialog.value = {
    mode,
    name: config.value.signing.name,
    file: path ? basename(path) : "",
    submit: async ({ name, email, passphrase }) => {
      try {
        if (path) {
          publish(await importKey(path, passphrase), "Certificate imported");
        } else {
          const info = await createCertificate(
            name,
            email.trim() || null,
            passphrase,
          );
          publish(info, "Certificate made");
        }
      } catch (error) {
        logError(
          path
            ? "failed to import a certificate"
            : "failed to make a certificate",
          error,
        );
        return signingMessage(
          error,
          path
            ? "Blank couldn't import the key file"
            : "Blank couldn't make your certificate",
        );
      }
      return null;
    },
    done: () => {
      refocus();
      done();
    },
    cancel: refocus,
  };
};

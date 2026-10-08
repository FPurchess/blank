import { open, save } from "@tauri-apps/plugin-dialog";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { logError } from "../log";
import { config } from "../config";
import { basename } from "../paths";
import { announce, certificateDialog, signingCertificate } from "../state";
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
 * resetCertificate forgets what was read, for the tests
 */
export const resetCertificate = () => {
  reading = null;
  signingCertificate.value = undefined;
};

const publish = (info: CertificateInfo | null, message: string) => {
  signingCertificate.value = info;
  announce(message);
};

/**
 * makeCertificate makes the user a certificate; it throws a SigningError
 */
export const makeCertificate = async (
  name: string,
  email: string,
  passphrase: string,
) => {
  const info = await createCertificate(name, email.trim() || null, passphrase);
  publish(info, "Certificate made");
  return info;
};

// the key files Blank can import, and how it saves them
const KEY_FILTERS = [{ name: "Key files", extensions: ["p12", "pfx"] }];

/**
 * chooseKeyFile asks for a key file to import, or returns null
 */
export const chooseKeyFile = async () => {
  const path = await open({ filters: KEY_FILTERS }).catch(() => null);
  return typeof path === "string" ? path : null;
};

/**
 * importCertificate takes the key file at `path` as the user's; it throws a
 * SigningError, e.g. for a wrong passphrase
 */
export const importCertificate = async (path: string, passphrase: string) => {
  const info = await importKey(path, passphrase);
  publish(info, "Certificate imported");
  return info;
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
  }).catch(() => null);
  if (!path) return;
  try {
    await exportCertificate(key, path);
    announce(key ? "Key backed up" : "Certificate saved");
  } catch (error) {
    logError(
      key ? "failed to back up the key" : "failed to save the certificate",
      error,
    );
    sendNotification(signingMessage(error));
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
    logError("failed to remove the certificate", error);
    sendNotification(signingMessage(error));
  }
};

/**
 * openCertificateDialog asks for what makes the user a certificate, or, for
 * `import`, for a key file and its passphrase; `done` is told once it's
 * there
 */
export const openCertificateDialog = async (
  mode: "create" | "import",
  done: () => void = () => undefined,
) => {
  const path = mode === "import" ? await chooseKeyFile() : null;
  if (mode === "import" && !path) return;
  certificateDialog.value = {
    mode,
    name: config.value.signing.name,
    file: path ? basename(path) : "",
    submit: async ({ name, email, passphrase }) => {
      try {
        if (path) await importCertificate(path, passphrase);
        else await makeCertificate(name, email, passphrase);
      } catch (error) {
        logError(
          path
            ? "failed to import a certificate"
            : "failed to make a certificate",
          error,
        );
        return signingMessage(error);
      }
      done();
      return null;
    },
    cancel: () => undefined,
  };
};

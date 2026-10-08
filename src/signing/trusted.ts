import { forgetSignatureChecks } from "../editor/tabs";
import { announce, confirmDialog, trustedCertificates } from "../state";
import { reportSigningFailure } from "./certificate";
import {
  type CheckedSignature,
  readTrusted,
  trustCertificate,
  untrustCertificate,
} from "./ipc";

// The certificates the user trusts, published in `trustedCertificates`:
// trusted from a signature's details, after the user compared its
// fingerprint with the signer's, and removed in Settings ▸ Signing. A
// change checks the open PDFs' signatures again.

const TITLE = "Trusted certificates";

/**
 * loadTrusted reads the certificates the user trusts
 */
export const loadTrusted = async () => {
  try {
    trustedCertificates.value = await readTrusted();
  } catch (error) {
    reportSigningFailure(
      "failed to read the trusted certificates",
      error,
      "Blank can't read the certificates you trust",
      TITLE,
    );
    trustedCertificates.value = [];
  }
};

/**
 * confirmTrust asks whether to trust the certificate of `signature`, showing
 * its fingerprint to compare with the signer's; `refocus` gives the focus
 * back once the question is closed
 */
export const confirmTrust = (
  signature: CheckedSignature,
  fingerprint: string,
  refocus: () => void,
) => {
  const name = signature.name ?? "the signer";
  confirmDialog.value = {
    title: `Trust ${name}'s certificate?`,
    text: `Only if ${name} told you this same fingerprint: ${fingerprint}`,
    action: "Trust",
    confirm: async () => {
      try {
        await trustCertificate(signature.certificateDer!);
        announce(`${name}'s certificate is trusted`);
        forgetSignatureChecks();
        await loadTrusted();
      } catch (error) {
        reportSigningFailure(
          "failed to trust a certificate",
          error,
          "Blank couldn't trust the certificate",
          TITLE,
        );
      }
      refocus();
    },
    cancel: refocus,
  };
};

/**
 * untrust stops trusting the certificate of `fingerprint`
 */
export const untrust = async (fingerprint: string) => {
  try {
    await untrustCertificate(fingerprint);
    announce("Certificate removed from those you trust");
    forgetSignatureChecks();
    await loadTrusted();
  } catch (error) {
    reportSigningFailure(
      "failed to forget a trusted certificate",
      error,
      "Blank couldn't remove the certificate",
      TITLE,
    );
  }
};

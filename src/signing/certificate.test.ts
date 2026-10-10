import { beforeEach, describe, expect, it, vi } from "vitest";
import { open, save } from "@tauri-apps/plugin-dialog";
import { sendNotification } from "@tauri-apps/plugin-notification";

import {
  announcement,
  certificateDialog,
  confirmDialog,
  signingCertificate,
} from "../state";
import { flushPromises } from "../test/async";
import {
  confirmRemoval,
  forgetCertificate,
  loadCertificate,
  openCertificateDialog,
  resetCertificate,
  saveCertificate,
} from "./certificate";

const ipc = vi.hoisted(() => ({
  certificate: vi.fn(),
  createCertificate: vi.fn(),
  importKey: vi.fn(),
  exportCertificate: vi.fn(),
  removeCertificate: vi.fn(),
}));
vi.mock("./ipc", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  ...ipc,
}));

const INFO = {
  name: "Ada Lovelace",
  issuer: "Ada Lovelace",
  notBefore: "2026-10-08",
  notAfter: "2031-10-08",
  selfSigned: true,
  fingerprint: "AB".repeat(32),
};

describe("the user's certificate", () => {
  beforeEach(() => {
    resetCertificate();
    certificateDialog.value = null;
    confirmDialog.value = null;
  });

  it("is read once", async () => {
    ipc.certificate.mockResolvedValue(INFO);
    await Promise.all([loadCertificate(), loadCertificate()]);
    expect(ipc.certificate).toHaveBeenCalledTimes(1);
    expect(signingCertificate.value).toEqual(INFO);
  });

  it("is read again after a read that failed", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    ipc.certificate.mockRejectedValueOnce({ kind: "failed", message: "" });
    await loadCertificate();
    expect(signingCertificate.value).toBeNull();
    ipc.certificate.mockResolvedValue(INFO);
    await loadCertificate();
    expect(ipc.certificate).toHaveBeenCalledTimes(2);
    expect(signingCertificate.value).toEqual(INFO);
  });

  it("is made in its dialog, which says what went wrong", async () => {
    await openCertificateDialog("create", () => {});
    const request = certificateDialog.value!;
    expect(request.mode).toBe("create");
    ipc.createCertificate.mockRejectedValue({
      kind: "failed",
      message: "Blank couldn't create your certificate",
    });
    expect(
      await request.submit({
        name: "Ada",
        email: "",
        passphrase: "correct horse",
      }),
    ).toBe("Blank couldn't create your certificate");
    ipc.createCertificate.mockResolvedValue(INFO);
    expect(
      await request.submit({
        name: "Ada",
        email: " ",
        passphrase: "correct horse",
      }),
    ).toBeNull();
    expect(ipc.createCertificate).toHaveBeenLastCalledWith(
      "Ada",
      null,
      "correct horse",
      false,
    );
    expect(signingCertificate.value).toEqual(INFO);
    expect(announcement.value?.text).toBe("Certificate created");
  });

  it("is imported from a key file, once its passphrase opens it", async () => {
    vi.mocked(open).mockResolvedValue("/keys/ada.p12");
    await openCertificateDialog("import", () => {});
    const request = certificateDialog.value!;
    expect(request.file).toBe("ada.p12");
    ipc.importKey.mockRejectedValue({ kind: "wrongPassphrase" });
    expect(await request.submit({ name: "", email: "", passphrase: "x" })).toBe(
      "The passphrase is wrong",
    );
  });

  it("replaces a key it has only once the user confirms it", async () => {
    vi.mocked(open).mockResolvedValue("/keys/ada.p12");
    await openCertificateDialog("import", () => {});
    const request = certificateDialog.value!;
    ipc.importKey.mockImplementation(async (_path, _passphrase, replace) => {
      if (!replace) throw { kind: "keyExists" };
      return INFO;
    });
    const fields = { name: "", email: "", passphrase: "x" };
    const kept = request.submit(fields);
    await flushPromises();
    expect(confirmDialog.value?.title).toBe("Replace your key?");
    confirmDialog.value!.cancel();
    expect(await kept).toBe("Blank kept the key you have");
    expect(ipc.importKey).toHaveBeenCalledTimes(1);
    expect(signingCertificate.value).toBeUndefined();
    const replaced = request.submit(fields);
    await flushPromises();
    confirmDialog.value!.confirm();
    expect(await replaced).toBeNull();
    expect(ipc.importKey).toHaveBeenLastCalledWith("/keys/ada.p12", "x", true);
    expect(signingCertificate.value).toEqual(INFO);
    expect(announcement.value?.text).toBe("Key file imported");
  });

  it("asks nothing when no key file is chosen", async () => {
    vi.mocked(open).mockResolvedValue(null);
    await openCertificateDialog("import", () => {});
    expect(certificateDialog.value).toBeNull();
  });

  it("is exported, backed up and removed", async () => {
    signingCertificate.value = INFO;
    vi.mocked(save).mockResolvedValue("/out/Ada Lovelace.cer");
    await saveCertificate(false);
    expect(ipc.exportCertificate).toHaveBeenCalledWith(
      false,
      "/out/Ada Lovelace.cer",
    );
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ defaultPath: "Ada Lovelace.cer" }),
    );
    await saveCertificate(true);
    expect(save).toHaveBeenLastCalledWith(
      expect.objectContaining({ defaultPath: "Ada Lovelace key.p12" }),
    );
    ipc.removeCertificate.mockRejectedValue({
      kind: "failed",
      message: "Blank couldn't remove your certificate",
    });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await forgetCertificate();
    expect(sendNotification).toHaveBeenCalledWith({
      title: "Certificate",
      body: "Blank couldn't remove your certificate",
    });
    // the log gets its kind only, never the native side's text
    expect(logged).toHaveBeenCalledWith(
      "failed to remove the certificate",
      "failed",
    );
    ipc.removeCertificate.mockResolvedValue(undefined);
    await forgetCertificate();
    expect(signingCertificate.value).toBeNull();
  });

  it("is removed only once the user confirms it", async () => {
    signingCertificate.value = INFO;
    const refocus = vi.fn();
    ipc.removeCertificate.mockResolvedValue(undefined);
    confirmRemoval(refocus);
    expect(confirmDialog.value?.title).toBe("Remove your certificate?");
    confirmDialog.value!.cancel();
    expect(ipc.removeCertificate).not.toHaveBeenCalled();
    expect(refocus).toHaveBeenCalled();
    confirmRemoval(refocus);
    confirmDialog.value!.confirm();
    await flushPromises();
    expect(ipc.removeCertificate).toHaveBeenCalled();
    expect(signingCertificate.value).toBeNull();
  });
});

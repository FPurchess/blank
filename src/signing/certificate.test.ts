import { beforeEach, describe, expect, it, vi } from "vitest";
import { open, save } from "@tauri-apps/plugin-dialog";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { announcement, certificateDialog, signingCertificate } from "../state";
import {
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
  });

  it("is read once", async () => {
    ipc.certificate.mockResolvedValue(INFO);
    await Promise.all([loadCertificate(), loadCertificate()]);
    expect(ipc.certificate).toHaveBeenCalledTimes(1);
    expect(signingCertificate.value).toEqual(INFO);
  });

  it("is made in its dialog, which says what went wrong", async () => {
    await openCertificateDialog("create");
    const request = certificateDialog.value!;
    expect(request.mode).toBe("create");
    ipc.createCertificate.mockRejectedValue({
      kind: "failed",
      message: "Blank couldn't make your certificate",
    });
    expect(
      await request.submit({
        name: "Ada",
        email: "",
        passphrase: "correct horse",
      }),
    ).toBe("Blank couldn't make your certificate");
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
    );
    expect(signingCertificate.value).toEqual(INFO);
    expect(announcement.value?.text).toBe("Certificate made");
  });

  it("is imported from a key file, once its passphrase opens it", async () => {
    vi.mocked(open).mockResolvedValue("/keys/ada.p12");
    await openCertificateDialog("import");
    const request = certificateDialog.value!;
    expect(request.file).toBe("ada.p12");
    ipc.importKey.mockRejectedValue({ kind: "wrongPassphrase" });
    expect(await request.submit({ name: "", email: "", passphrase: "x" })).toBe(
      "The passphrase is wrong",
    );
  });

  it("asks nothing when no key file is chosen", async () => {
    vi.mocked(open).mockResolvedValue(null);
    await openCertificateDialog("import");
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
    vi.spyOn(console, "error").mockImplementation(() => {});
    await forgetCertificate();
    expect(sendNotification).toHaveBeenCalledWith(
      "Blank couldn't remove your certificate",
    );
    ipc.removeCertificate.mockResolvedValue(undefined);
    await forgetCertificate();
    expect(signingCertificate.value).toBeNull();
  });
});

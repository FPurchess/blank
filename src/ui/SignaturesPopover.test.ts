import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { readTrusted, trustCertificate } from "../signing/ipc";
import type { CheckedSignature } from "../signing/ipc";
import {
  announcement,
  confirmDialog,
  shownPdf,
  signatureDetails,
  signaturesPopover,
} from "../state";
import { flushPromises } from "../test/async";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

vi.mock("../signing/ipc", async (original) => ({
  ...(await original<typeof import("../signing/ipc")>()),
  trustCertificate: vi.fn(),
  readTrusted: vi.fn(),
}));

const maria: CheckedSignature = {
  field: "Signature1",
  name: "Maria Keller",
  time: "2026-10-07T18:40:00Z",
  timestamped: true,
  reason: "I agree",
  location: null,
  status: "valid",
  trust: { kind: "unknown" },
  certificate: {
    name: "Maria Keller",
    issuer: "Maria Keller",
    notBefore: "2026-10-01T00:00:00Z",
    notAfter: "2031-10-01T00:00:00Z",
    selfSigned: true,
    fingerprint: "3F2A91C0".repeat(8),
  },
  certificateDer: "3082",
};

const buttons = (root: Element | null) =>
  [...(root?.querySelectorAll("button") ?? [])].map((button) =>
    button.textContent?.trim(),
  );

describe("a PDF's signatures", () => {
  let dispose = () => {};

  beforeEach(async () => {
    shownPdf.value = {
      path: "/contract.pdf",
      opened: null,
      problem: "failed",
      failedPages: [],
      signatures: [maria],
    };
    dispose = bootApp(createTestHandle());
    await flushPromises();
  });

  afterEach(() => {
    dispose();
    shownPdf.value = null;
    signaturesPopover.value = null;
    signatureDetails.value = null;
    confirmDialog.value = null;
  });

  it("lists them from the status bar, and shows one's details", async () => {
    const item = document.getElementById("ui-signatures")!;
    expect(item.textContent?.trim()).toBe("Signed, signer unknown");

    item.click();
    await flushPromises();
    const popover = document.getElementById("signatures-popover")!;
    expect(popover.querySelector(".who")?.textContent).toBe("Maria Keller");
    expect(popover.querySelector(".status")?.textContent).toBe(
      "Intact · signer unknown",
    );

    popover.querySelector("button")!.click();
    await flushPromises();
    const details = document.getElementById("signature-details")!;
    expect(details.textContent).toContain("Signature of Maria Keller");
    expect(details.querySelector(".fingerprint")?.textContent).toBe(
      "3F2A 91C0 ".repeat(8).trim(),
    );
    expect(details.querySelector(".note")?.textContent).toContain(
      "Blank doesn't check certificate authorities or revocation.",
    );
    expect(buttons(details)).toContain("Trust this certificate…");
  });

  it("trusts a certificate once the user confirms its fingerprint", async () => {
    vi.mocked(trustCertificate).mockResolvedValue(maria.certificate!);
    vi.mocked(readTrusted).mockResolvedValue([maria.certificate!]);
    signatureDetails.value = { signature: maria, refocus: () => {} };
    await flushPromises();

    [
      ...document.querySelectorAll<HTMLButtonElement>(
        "#signature-details button",
      ),
    ]
      .find((button) => button.textContent?.includes("Trust"))!
      .click();
    await flushPromises();
    expect(confirmDialog.value?.title).toBe(
      "Trust Maria Keller's certificate?",
    );
    expect(confirmDialog.value?.text).toContain("3F2A 91C0");

    confirmDialog.value!.confirm();
    await flushPromises();
    expect(trustCertificate).toHaveBeenCalledWith("3082");
    expect(announcement.value?.text).toBe(
      "Maria Keller's certificate is trusted",
    );
    // checked again, with the new trust
    expect(shownPdf.value?.signatures).toBeNull();
  });
});

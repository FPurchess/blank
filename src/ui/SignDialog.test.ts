import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import {
  signDialog,
  type SignDialogRequest,
  signingCertificate,
} from "../state";
import { flushPromises } from "../test/async";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

const dialog = () => document.getElementById("sign-dialog");

describe("the dialog that signs", () => {
  let dispose = () => {};
  let request: SignDialogRequest;

  const open = async (changes: Partial<SignDialogRequest> = {}) => {
    request = {
      title: "lease",
      targets: [
        { pos: 3, label: "Bea · Landlord" },
        { pos: 9, label: "Tenant" },
      ],
      chosen: 9,
      place: "Berlin",
      warnings: [],
      check: vi.fn(async () => null),
      createCertificate: vi.fn(),
      submit: vi.fn(),
      cancel: vi.fn(),
      ...changes,
    };
    signDialog.value = request;
    await nextTick();
  };

  beforeEach(() => {
    dispose = bootApp(createTestHandle());
  });

  afterEach(() => {
    signDialog.value = null;
    dispose();
  });

  it("names what it signs and offers the blocks", async () => {
    await open();
    expect(dialog()!.textContent).toContain("Sign “lease”");
    const options = [
      ...dialog()!.querySelectorAll<HTMLButtonElement>(".options button"),
    ];
    expect(options.map((option) => option.textContent!.trim())).toEqual([
      "Bea · Landlord",
      "Tenant",
    ]);
    expect(options[1].getAttribute("aria-checked")).toBe("true");
  });

  it("offers no choice with one block, and shows its warnings", async () => {
    await open({
      targets: [{ pos: 3, label: "Tenant" }],
      chosen: 3,
      warnings: ["Check every page."],
    });
    expect(dialog()!.querySelector(".options")).toBeNull();
    expect(dialog()!.querySelector(".warning")!.textContent).toContain(
      "Check every page.",
    );
  });

  it("signs in the chosen block, where the user says", async () => {
    await open();
    const place =
      document.querySelector<HTMLInputElement>("#sign-dialog-place")!;
    place.value = " Hamburg ";
    place.dispatchEvent(new Event("input"));
    dialog()!
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    // without a certificate, a picture only
    expect(request.submit).toHaveBeenCalledWith(9, "Hamburg", null);
    expect(signDialog.value).toBeNull();
  });

  describe("with a certificate", () => {
    beforeEach(() => {
      signingCertificate.value = {
        name: "Ada Lovelace",
        issuer: "Ada Lovelace",
        notBefore: "2026-10-08",
        notAfter: "2031-10-08",
        selfSigned: true,
        fingerprint: "AB".repeat(32),
      };
    });
    afterEach(() => {
      signingCertificate.value = undefined;
    });

    const submit = () =>
      dialog()!
        .querySelector("form")!
        .dispatchEvent(new Event("submit", { cancelable: true }));
    const passphrase = () =>
      document.querySelector<HTMLInputElement>("#sign-dialog-passphrase")!;

    it("signs digitally once the passphrase opens the key", async () => {
      await open();
      expect(passphrase().type).toBe("password");
      submit();
      await flushPromises();
      expect(
        document.getElementById("sign-dialog-error")!.textContent,
      ).toContain("Enter the passphrase");
      request.check = vi.fn(async () => "The passphrase is wrong");
      passphrase().value = "wrong";
      passphrase().dispatchEvent(new Event("input"));
      submit();
      await flushPromises();
      expect(
        document.getElementById("sign-dialog-error")!.textContent,
      ).toContain("The passphrase is wrong");
      expect(request.submit).not.toHaveBeenCalled();
      request.check = vi.fn(async () => null);
      submit();
      await flushPromises();
      expect(request.submit).toHaveBeenCalledWith(9, "Berlin", "wrong");
    });

    it("signs with a picture only when chosen", async () => {
      await open();
      const options = [
        ...dialog()!.querySelectorAll<HTMLButtonElement>(
          "[data-row=how] button",
        ),
      ];
      options[1].click();
      await nextTick();
      expect(document.querySelector("#sign-dialog-passphrase")).toBeNull();
      submit();
      await flushPromises();
      expect(request.submit).toHaveBeenCalledWith(9, "Berlin", null);
    });
  });
});

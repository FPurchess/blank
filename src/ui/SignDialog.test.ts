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
        {
          pos: 3,
          name: "Bea",
          place: "",
          dated: true,
          label: "Bea · Landlord",
        },
        { pos: 9, name: "", place: "", dated: true, label: "Tenant" },
      ],
      chosen: 9,
      place: "Berlin",
      signer: "Ada",
      today: { date: "10 October 2026", language: "English" },
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
      targets: [{ pos: 3, name: "", place: "", dated: true, label: "Tenant" }],
      chosen: 3,
      warnings: ["Check every page."],
    });
    expect(dialog()!.querySelector(".options")).toBeNull();
    expect(dialog()!.querySelector(".warning")!.textContent).toContain(
      "Check every page.",
    );
    expect(dialog()!.textContent).not.toContain("other signature blocks");
  });

  it("says the other blocks stay empty, and warns of a block for someone else", async () => {
    await open();
    expect(dialog()!.textContent).toContain(
      "The other signature blocks stay empty.",
    );
    expect(document.getElementById("sign-dialog-named")).toBeNull();
    dialog()!.querySelector<HTMLButtonElement>(".options button")!.click();
    await nextTick();
    expect(document.getElementById("sign-dialog-named")!.textContent).toContain(
      "This block is for Bea",
    );
  });

  it("says which date goes under the signature, in which language", async () => {
    await open();
    expect(document.getElementById("sign-dialog-date")!.textContent).toContain(
      "Dated 10 October 2026, written in English",
    );
  });

  it("signs a block that fixes its place there, and says so", async () => {
    await open({
      targets: [
        { pos: 3, name: "", place: "Paris", dated: false, label: "Tenant" },
      ],
      chosen: 3,
    });
    expect(document.querySelector("#sign-dialog-place")).toBeNull();
    // without the place, the focus is in the dialog all the same, never
    // behind it on the block, which a key would replace
    await flushPromises();
    expect(dialog()!.contains(document.activeElement)).toBe(true);
    expect(
      document.getElementById("sign-dialog-fixed-place")!.textContent,
    ).toContain("Paris");
    dialog()!
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { cancelable: true }));
    // the dialog passes what was typed; the command signs in the block's
    expect(request.submit).toHaveBeenCalledWith(3, "Berlin", null);
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

  const CERTIFICATE = {
    name: "Ada Lovelace",
    issuer: "Ada Lovelace",
    notBefore: "2026-10-08",
    notAfter: "2031-10-08",
    selfSigned: true,
    fingerprint: "AB".repeat(32),
  };

  it("signs digitally with a certificate made from it", async () => {
    signingCertificate.value = null;
    await open();
    expect(document.querySelector("#sign-dialog-passphrase")).toBeNull();
    signingCertificate.value = CERTIFICATE;
    await flushPromises();
    expect(document.activeElement?.id).toBe("sign-dialog-passphrase");
    signingCertificate.value = undefined;
  });

  describe("with a certificate", () => {
    beforeEach(() => {
      signingCertificate.value = CERTIFICATE;
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
      let answer: (failure: string | null) => void = () => {};
      request.check = vi.fn(
        () => new Promise<string | null>((resolve) => (answer = resolve)),
      );
      passphrase().value = "wrong";
      passphrase().dispatchEvent(new Event("input"));
      submit();
      await nextTick();
      // checking takes a moment, which can't be cancelled
      const [cancel, sign] = dialog()!.querySelectorAll<HTMLButtonElement>(
        ".dialog-foot > button",
      );
      expect(sign.textContent!.trim()).toBe("Checking…");
      expect(cancel.disabled).toBe(true);
      answer("The passphrase is wrong");
      await flushPromises();
      expect(
        document.getElementById("sign-dialog-error")!.textContent,
      ).toContain("The passphrase is wrong");
      // selected, to type it again
      expect(document.activeElement).toBe(passphrase());
      expect(passphrase().selectionEnd).toBe(5);
      expect(request.submit).not.toHaveBeenCalled();
      request.check = vi.fn(async () => null);
      submit();
      await flushPromises();
      expect(request.submit).toHaveBeenCalledWith(9, "Berlin", "wrong");
    });

    it("signs nothing when it's closed while the passphrase is checked", async () => {
      let answer: (failure: string | null) => void = () => {};
      await open({
        check: vi.fn(
          () => new Promise<string | null>((resolve) => (answer = resolve)),
        ),
      });
      const first = request;
      passphrase().value = "secret";
      passphrase().dispatchEvent(new Event("input"));
      submit();
      await nextTick();
      // another tab comes up meanwhile, with a dialog of its own
      signDialog.value = null;
      await nextTick();
      await open({ title: "offer" });
      answer(null);
      await flushPromises();
      expect(first.submit).not.toHaveBeenCalled();
      expect(signDialog.value).toBe(request);
      expect(dialog()!.textContent).toContain("Sign “offer”");
    });

    it("starts on the passphrase when the block fixes its place", async () => {
      await open({
        targets: [
          { pos: 3, name: "", place: "Paris", dated: false, label: "Tenant" },
        ],
        chosen: 3,
      });
      await flushPromises();
      expect(document.activeElement).toBe(passphrase());
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

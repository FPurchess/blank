import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import {
  contextMenu,
  type MenuItem,
  savedMarks,
  type SignChoices,
  signDialog,
  type SignDialogRequest,
  signingCertificate,
} from "../state";
import { flushPromises } from "../test/async";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

const dialog = () => document.getElementById("sign-dialog");
const byId = <T extends HTMLElement = HTMLButtonElement>(id: string) =>
  document.getElementById(id) as T | null;
const submitForm = () =>
  dialog()!
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));
// what the dialog hands on, with what a test changes
const chose = (changes: Partial<SignChoices>): SignChoices => ({
  pos: 9,
  place: "Berlin",
  reason: "",
  passphrase: null,
  initials: { on: false, side: "right" },
  open: true,
  ...changes,
});
// runs the item of Sign as's menu with this id
const signAs = async (id: string) => {
  byId("sign-dialog-how")!.click();
  await nextTick();
  const item = contextMenu.value!.items.find(
    (line) => line !== "separator" && "id" in line && line.id === id,
  ) as Exclude<MenuItem, "separator">;
  item.run!();
  contextMenu.value = null;
  await nextTick();
};

describe("the dialog that signs", () => {
  let dispose = () => {};
  let request: SignDialogRequest;

  const open = async (changes: Partial<SignDialogRequest> = {}) => {
    request = {
      mode: "export",
      title: "lease",
      targets: [
        {
          pos: 3,
          name: "Bea",
          place: "",
          dated: true,
          role: "Landlord",
          label: "Bea · Landlord",
        },
        { pos: 9, name: "", place: "", dated: true, role: "", label: "Tenant" },
      ],
      chosen: 9,
      place: "Berlin",
      signer: "Ada",
      today: { date: "10 October 2026", language: "English" },
      warnings: [],
      confirmPages: false,
      initials: { on: false, side: "right" },
      stamped: true,
      emptyFields: 0,
      check: vi.fn(async () => null),
      createCertificate: vi.fn(),
      createInitials: vi.fn(),
      manage: vi.fn(),
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
      targets: [
        { pos: 3, name: "", place: "", dated: true, role: "", label: "Tenant" },
      ],
      chosen: 3,
      warnings: ["Check every page."],
    });
    expect(dialog()!.querySelector(".options")).toBeNull();
    expect(dialog()!.querySelector(".warning")!.textContent).toContain(
      "Check every page.",
    );
    expect(byId("sign-dialog-others")).toBeNull();
  });

  it("says the other blocks stay empty, and warns of a block for someone else", async () => {
    await open();
    expect(byId("sign-dialog-others")!.textContent).toContain(
      "The other signature blocks get empty signature fields.",
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
        {
          pos: 3,
          name: "",
          place: "Paris",
          dated: false,
          role: "",
          label: "Tenant",
        },
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
    expect(request.submit).toHaveBeenCalledWith(chose({ pos: 3 }));
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
    expect(request.submit).toHaveBeenCalledWith(chose({ place: "Hamburg" }));
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

  it("offers to make a certificate from Sign as", async () => {
    signingCertificate.value = null;
    await open();
    expect(byId("sign-dialog-how")!.textContent).toContain(
      "No digital signature",
    );
    await signAs("create");
    expect(request.createCertificate).toHaveBeenCalledWith(
      byId("sign-dialog-how"),
    );
    signingCertificate.value = undefined;
  });

  it("takes the reason into the signature", async () => {
    await open();
    const reason = byId<HTMLInputElement>("sign-dialog-reason")!;
    expect(reason.placeholder).toBe("Optional, e.g. I agree to these terms");
    reason.value = " I agree ";
    reason.dispatchEvent(new Event("input"));
    submitForm();
    expect(request.submit).toHaveBeenCalledWith(chose({ reason: "I agree" }));
  });

  describe("the initials", () => {
    afterEach(() => {
      savedMarks.value = undefined;
    });

    const MARK = {
      source: { kind: "draw" as const, strokes: [] },
      png: "data:image/png;base64,AAAA",
      width: 40,
      height: 20,
    };

    it("asks for initials first, and puts new ones on every page", async () => {
      savedMarks.value = { signature: MARK, initials: null };
      await open();
      const toggle = byId("sign-dialog-initials")!;
      expect(toggle.disabled).toBe(true);
      expect(byId("sign-dialog-initials-note")!.textContent).toContain(
        "Add your initials in Settings ▸ Signing first.",
      );
      const make = byId("sign-dialog-make-initials")!;
      make.click();
      expect(request.createInitials).toHaveBeenCalledWith(make);
      savedMarks.value = { signature: MARK, initials: MARK };
      await nextTick();
      expect(toggle.disabled).toBe(false);
      expect(toggle.getAttribute("aria-checked")).toBe("true");
      expect(byId("sign-dialog-initials-note")).toBeNull();
    });

    it("puts them in the corner chosen, and tells a PDF tab at once", async () => {
      savedMarks.value = { signature: MARK, initials: MARK };
      const setInitials = vi.fn();
      await open({ initials: { on: true, side: "right" }, setInitials });
      const corners = [
        ...dialog()!.querySelectorAll<HTMLButtonElement>(
          "[data-row=initials-side] button",
        ),
      ];
      expect(corners.map((corner) => corner.textContent!.trim())).toEqual([
        "Bottom right",
        "Bottom left",
      ]);
      corners[1].click();
      await nextTick();
      expect(setInitials).toHaveBeenLastCalledWith({ on: true, side: "left" });
      submitForm();
      expect(request.submit).toHaveBeenCalledWith(
        chose({ initials: { on: true, side: "left" } }),
      );
    });

    it("can't put them on pages others signed, and says why", async () => {
      savedMarks.value = { signature: MARK, initials: MARK };
      await open({
        mode: "pdf",
        targets: [],
        initials: {
          on: true,
          side: "right",
          reason: "Initials would change pages the earlier signers signed.",
        },
      });
      expect(byId("sign-dialog-initials")!.disabled).toBe(true);
      expect(byId("sign-dialog-initials-note")!.textContent).toContain(
        "Initials would change pages",
      );
      expect(byId("sign-dialog-make-initials")).toBeNull();
      // and opens the signed PDF, unless switched off
      byId("sign-dialog-open")!.click();
      await nextTick();
      submitForm();
      expect(request.submit).toHaveBeenCalledWith(
        chose({ pos: null, open: false }),
      );
    });
  });

  it("signs a picture only in a PDF tab once the signature is on a page", async () => {
    await open({ mode: "pdf", targets: [], stamped: false });
    const sign = dialog()!.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    expect(sign.disabled).toBe(true);
    expect(byId("sign-dialog-stamp")!.textContent).toBe(
      "Place your signature on the page first, or sign digitally.",
    );
    submitForm();
    expect(request.submit).not.toHaveBeenCalled();
  });

  it("signs a Word document once every page is checked", async () => {
    await open({ warnings: ["Check every page."], confirmPages: true });
    const sign = dialog()!.querySelector<HTMLButtonElement>(
      'button[type="submit"]',
    )!;
    expect(sign.disabled).toBe(true);
    const checked = byId("sign-dialog-checked")!;
    expect(checked.textContent!.trim()).toBe("I checked every page");
    checked.click();
    await nextTick();
    expect(sign.disabled).toBe(false);
    submitForm();
    expect(request.submit).toHaveBeenCalled();
  });

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
      expect(request.submit).toHaveBeenCalledWith(
        chose({ passphrase: "wrong" }),
      );
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
          {
            pos: 3,
            name: "",
            place: "Paris",
            dated: false,
            role: "",
            label: "Tenant",
          },
        ],
        chosen: 3,
      });
      await flushPromises();
      expect(document.activeElement).toBe(passphrase());
    });

    it("signs as the certificate, or with a picture only when chosen", async () => {
      await open();
      expect(byId("sign-dialog-how")!.textContent).toContain(
        "Ada Lovelace · your certificate",
      );
      await signAs("visible");
      expect(byId("sign-dialog-how")!.textContent).toContain(
        "No digital signature (only the visible signature)",
      );
      expect(document.querySelector("#sign-dialog-passphrase")).toBeNull();
      submit();
      await flushPromises();
      expect(request.submit).toHaveBeenCalledWith(chose({}));
    });

    it("manages the certificate in Settings ▸ Signing, the dialog closed", async () => {
      await open();
      await signAs("manage");
      expect(signDialog.value).toBeNull();
      expect(request.manage).toHaveBeenCalled();
    });

    it("says a PDF tab without the signature on a page is signed invisibly", async () => {
      await open({ mode: "pdf", targets: [], stamped: false, emptyFields: 2 });
      expect(byId("sign-dialog-stamp")!.textContent).toContain(
        "the signature will be invisible",
      );
      expect(byId("sign-dialog-empty")!.textContent).toContain(
        "This PDF still has 2 places to fill in.",
      );
      // no blocks in a PDF tab
      expect(document.getElementById("sign-dialog-target")).toBeNull();
      expect(byId("sign-dialog-others")).toBeNull();
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { signatureDialog, type SignatureDialogRequest } from "../state";
import { flushPromises } from "../test/async";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

vi.mock("../signing/fonts", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  loadSignatureFonts: vi.fn(async () => {}),
}));

const dialog = () => document.getElementById("signature-dialog")!;
const tab = (label: string) =>
  [...dialog().querySelectorAll<HTMLButtonElement>("[role=tab]")].find(
    (button) => button.textContent!.trim() === label,
  )!;
const submit = () =>
  dialog()
    .querySelector("form")!
    .dispatchEvent(new Event("submit", { cancelable: true }));

describe("the dialog of the user's signature", () => {
  let dispose = () => {};
  let request: SignatureDialogRequest;

  beforeEach(async () => {
    dispose = bootApp(createTestHandle());
    request = {
      mark: "signature",
      saved: null,
      name: "Ada Lovelace",
      chooseFile: vi.fn(async () => ({
        src: "data:image/png;base64,AAAA",
        name: "scan.png",
      })),
      submit: vi.fn(async () => true),
      cancel: vi.fn(),
    };
    signatureDialog.value = request;
    await nextTick();
  });

  afterEach(() => {
    signatureDialog.value = null;
    dispose();
  });

  it("starts on the pad, which says how to draw", () => {
    expect(dialog().textContent).toContain("Your signature");
    expect(tab("Draw").getAttribute("aria-selected")).toBe("true");
    expect(dialog().querySelector("canvas")!.getAttribute("aria-label")).toBe(
      "Draw your signature",
    );
    expect(dialog().textContent).toContain(
      "Draw with the mouse, trackpad or pen",
    );
  });

  it("says what's missing instead of saving an empty pad", async () => {
    submit();
    await nextTick();
    expect(request.submit).not.toHaveBeenCalled();
    expect(document.getElementById("signature-dialog-error")!.textContent).toBe(
      "Draw your signature first.",
    );
  });

  it("saves the name typed in the chosen font", async () => {
    tab("Type").click();
    await nextTick();
    expect(
      document.querySelector<HTMLInputElement>("#signature-dialog-name")!.value,
    ).toBe("Ada Lovelace");
    const fonts = [
      ...dialog().querySelectorAll<HTMLButtonElement>("[role=radio]"),
    ];
    expect(fonts.map((font) => font.textContent)).toEqual([
      expect.stringContaining("Formal · Pinyon Script"),
      expect.stringContaining("Quick · Ms Madi"),
      expect.stringContaining("Legible · Dancing Script"),
      expect.stringContaining("Handwritten · Caveat"),
    ]);
    // ↓ chooses the next
    fonts[0].focus();
    fonts[0].dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    await nextTick();
    expect(fonts[1].getAttribute("aria-checked")).toBe("true");
    submit();
    await flushPromises();
    expect(request.submit).toHaveBeenCalledWith(
      { kind: "type", text: "Ada Lovelace", font: "Ms Madi" },
      undefined,
    );
    expect(signatureDialog.value).toBeNull();
  });

  it("saves a picture, its background removed unless switched off", async () => {
    tab("Image").click();
    await nextTick();
    dialog()
      .querySelector<HTMLButtonElement>(".signature-image button")!
      .click();
    await flushPromises();
    expect(dialog().querySelector(".signature-image img")).not.toBeNull();
    dialog().querySelector<HTMLButtonElement>("[role=switch]")!.click();
    submit();
    await flushPromises();
    expect(request.submit).toHaveBeenCalledWith(
      { kind: "image" },
      { src: "data:image/png;base64,AAAA", clean: false },
    );
  });
});

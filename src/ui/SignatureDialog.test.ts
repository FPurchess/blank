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
      done: vi.fn(),
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

  it("cancels on Esc", () => {
    dialog()
      .querySelector("form")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(request.cancel).toHaveBeenCalled();
    expect(signatureDialog.value).toBeNull();
  });

  it("can't be cancelled while it saves, which would still save", async () => {
    let saved: (done: boolean) => void = () => {};
    request.submit = vi.fn(
      () => new Promise<boolean>((resolve) => (saved = resolve)),
    );
    tab("Type").click();
    await nextTick();
    submit();
    await nextTick();
    const cancel = [
      ...dialog().querySelectorAll<HTMLButtonElement>(".dialog-foot > button"),
    ].find((button) => button.textContent!.trim() === "Cancel")!;
    expect(cancel.disabled).toBe(true);
    dialog()
      .querySelector("form")!
      .dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(request.cancel).not.toHaveBeenCalled();
    saved(true);
    await flushPromises();
    expect(request.done).toHaveBeenCalled();
  });

  it("switches between drawing, typing and an image with the arrow keys", async () => {
    tab("Draw").focus();
    tab("Draw").dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }),
    );
    await nextTick();
    expect(tab("Type").getAttribute("aria-selected")).toBe("true");
    expect(dialog().querySelector("#signature-dialog-name")).not.toBeNull();
  });

  it("saves what was drawn on the pad", async () => {
    const canvas = dialog().querySelector("canvas")!;
    canvas.setPointerCapture = () => {};
    const press = (type: string, x: number) =>
      canvas.dispatchEvent(
        new PointerEvent(type, {
          clientX: x,
          clientY: 10,
          button: 0,
          pointerType: "mouse",
        }),
      );
    // each in a task of its own, as a pointer's events come
    for (const [type, x] of [
      ["pointerdown", 10],
      ["pointermove", 20],
      ["pointerup", 20],
    ] as const) {
      press(type, x);
      await nextTick();
    }
    expect(document.getElementById("signature-pad-state")!.textContent).toBe(
      "Drawn",
    );
    submit();
    await flushPromises();
    // one stroke of the two points drawn
    expect(request.submit).toHaveBeenCalledWith(
      {
        kind: "draw",
        strokes: [[expect.any(Array), expect.any(Array)]],
      },
      undefined,
    );
    expect(request.done).toHaveBeenCalled();
  });

  it("says what's missing instead of saving an empty pad", async () => {
    submit();
    await nextTick();
    expect(request.submit).not.toHaveBeenCalled();
    expect(document.getElementById("signature-dialog-error")!.textContent).toBe(
      "Draw your signature first.",
    );
    expect(dialog().querySelector("canvas")!.getAttribute("aria-invalid")).toBe(
      "true",
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
      expect.stringContaining("Pinyon Script"),
      expect.stringContaining("Ms Madi"),
      expect.stringContaining("Dancing Script"),
      expect.stringContaining("Caveat"),
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

  it("keeps a saved picture as it is when saved again unchanged", async () => {
    signatureDialog.value = {
      ...request,
      saved: {
        source: { kind: "image" },
        png: "data:image/png;base64,SAVED",
        width: 1,
        height: 1,
      },
    };
    await nextTick();
    submit();
    await flushPromises();
    expect(request.submit).not.toHaveBeenCalled();
    expect(request.done).toHaveBeenCalled();
    expect(signatureDialog.value).toBeNull();
  });
});

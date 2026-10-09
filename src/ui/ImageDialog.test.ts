import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";
import { type ImageDialogRequest, imageDialog } from "../state";
import { deferred, flushPromises } from "../test/async";

// stops what the last boot rendered, so boots don't pile up
let dispose = () => {};
afterEach(() => dispose());

const dialog = () => document.querySelector<HTMLElement>("#image-dialog");
const form = () => dialog()?.querySelector("form") as HTMLFormElement;
const srcInput = () =>
  document.querySelector<HTMLInputElement>("#image-dialog-src")!;
const altInput = () =>
  document.querySelector<HTMLInputElement>("#image-dialog-alt")!;
const hint = () => document.querySelector<HTMLElement>("#image-dialog-hint")!;
const button = (label: string) =>
  Array.from(dialog()?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent?.trim() === label,
  );

const EMBEDDED = "data:image/png;base64,AAAA";

const openDialog = async (request: Partial<ImageDialogRequest> = {}) => {
  const full: ImageDialogRequest = {
    src: "",
    alt: "",
    width: null,
    isEdit: false,
    chooseFile: vi.fn().mockResolvedValue(null),
    submit: vi.fn(),
    remove: vi.fn(),
    cancel: vi.fn(),
    ...request,
  };
  imageDialog.value = full;
  await nextTick();
  return full;
};

/**
 * type types `value` into `input`, as the user would
 */
const type = async (input: HTMLInputElement, value: string) => {
  input.value = value;
  input.dispatchEvent(new Event("input"));
  await nextTick();
};

const typeSrc = (value: string) => type(srcInput(), value);

const submit = async () => {
  form().requestSubmit();
  await nextTick();
};

describe("imageDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    imageDialog.value = null;
    dispose = bootApp(createTestHandle());
  });

  it("is hidden without a request", async () => {
    expect(dialog()).toBeNull();
  });

  it("opens for a new image with the source focused", async () => {
    await openDialog();

    expect(dialog()?.querySelector("h2")?.textContent).toBe("Image");
    expect(document.activeElement).toBe(srcInput());
    expect(button("Insert")).toBeDefined();
    expect(button("Remove")).toBeUndefined();
  });

  it("inserts a typed path or address", async () => {
    const request = await openDialog();
    await typeSrc("images/chart.png");
    await type(altInput(), "Chart");

    await submit();

    expect(request.submit).toHaveBeenCalledWith(
      "images/chart.png",
      "Chart",
      null,
    );
    expect(imageDialog.value).toBeNull();
    expect(dialog()).toBeNull();
  });

  it("asks for a source before inserting", async () => {
    const request = await openDialog();

    await submit();

    expect(request.submit).not.toHaveBeenCalled();
    expect(hint().textContent).toBe(
      "Choose a file, or enter a path or web address",
    );
  });

  it("refuses sources that can't be saved", async () => {
    await openDialog();

    await typeSrc("javascript:alert(1)");

    expect(hint().hidden).toBe(false);
    expect(button("Insert")?.disabled).toBe(true);
  });

  it("embeds a chosen file and suggests its name as description", async () => {
    const request = await openDialog({
      chooseFile: vi
        .fn()
        .mockResolvedValue({ src: EMBEDDED, name: "chart.png" }),
    });

    button("Choose file…")!.click();

    await nextTick();
    await flushPromises();

    expect(srcInput().value).toBe("chart.png");
    expect(altInput().value).toBe("chart");
    expect(hint().textContent).toBe("Embedded in the document");
    expect(document.activeElement).toBe(altInput());

    await submit();
    expect(request.submit).toHaveBeenCalledWith(EMBEDDED, "chart", null);
  });

  it("keeps a description that was already typed", async () => {
    await openDialog({
      chooseFile: vi
        .fn()
        .mockResolvedValue({ src: EMBEDDED, name: "chart.png" }),
    });
    await type(altInput(), "Sales");

    button("Choose file…")!.click();

    await nextTick();
    await flushPromises();

    expect(altInput().value).toBe("Sales");
  });

  it("goes back to the button when no file was chosen", async () => {
    await openDialog();
    const choose = button("Choose file…")!;

    choose.click();
    await nextTick();
    expect(choose.disabled).toBe(true);
    expect(hint().textContent).toBe("Choosing a file…");
    await flushPromises();

    expect(choose.disabled).toBe(false);
    expect(document.activeElement).toBe(choose);
    expect(hint().hidden).toBe(true);
  });

  it("stops asking for a source once the choice of a file is cancelled", async () => {
    await openDialog();
    await submit();
    expect(hint().hidden).toBe(false);

    button("Choose file…")!.click();
    await flushPromises();

    expect(hint().hidden).toBe(true);
  });

  it("ignores a file chosen after the dialog was closed", async () => {
    const chosen = deferred<{ src: string; name: string } | null>();
    const request = await openDialog({ chooseFile: () => chosen.promise });
    button("Choose file…")!.click();
    await nextTick();
    button("Cancel")!.click();
    await nextTick();

    chosen.resolve({ src: EMBEDDED, name: "chart.png" });
    await flushPromises();

    expect(request.cancel).toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("shows an embedded image as a note, not as its data URL", async () => {
    const request = await openDialog({
      src: EMBEDDED,
      alt: "Chart",
      isEdit: true,
    });

    expect(dialog()?.querySelector("h2")?.textContent).toBe("Edit image");
    expect(srcInput().value).toBe("");
    expect(srcInput().placeholder).toBe("Embedded image");
    expect(hint().textContent).toBe("Embedded in the document");

    await submit();
    expect(request.submit).toHaveBeenCalledWith(EMBEDDED, "Chart", null);
  });

  it("drops an embedded image on any typing, even one that changes nothing", async () => {
    await openDialog({ src: EMBEDDED, isEdit: true });

    await typeSrc("");

    expect(srcInput().placeholder).toBe("images/chart.png");
    expect(hint().hidden).toBe(true);
  });

  it("gets out of choosing when the choice of a file fails", async () => {
    const error = new Error("no access");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await openDialog({ chooseFile: () => Promise.reject(error) });
    const choose = button("Choose file…")!;
    choose.click();
    await flushPromises();

    expect(logged).toHaveBeenCalledWith(error);
    expect(document.activeElement).toBe(choose);
    await typeSrc("images/x.png");

    expect(choose.disabled).toBe(false);
    expect(hint().textContent).not.toBe("Choosing a file…");
  });

  it("replaces an embedded image with a typed address", async () => {
    const request = await openDialog({ src: EMBEDDED, isEdit: true });

    await typeSrc("https://example.com/a.png");
    await submit();

    expect(request.submit).toHaveBeenCalledWith(
      "https://example.com/a.png",
      "",
      null,
    );
  });

  it("gives the image the width chosen, and keeps one of another app", async () => {
    const request = await openDialog({
      src: "a.png",
      isEdit: true,
      width: "300",
    });
    const option = (label: string) =>
      [
        ...dialog()!.querySelectorAll<HTMLButtonElement>(
          '[data-row="width"] button',
        ),
      ].find((button) => button.textContent?.trim() === label)!;
    expect(dialog()!.querySelector("[aria-checked='true']")).toBeNull();
    await submit();
    expect(request.submit).toHaveBeenLastCalledWith("a.png", "", "300");
    const again = await openDialog({ src: "a.png", isEdit: true });
    option("50%").click();
    await submit();
    expect(again.submit).toHaveBeenLastCalledWith("a.png", "", "50%");
  });

  it("removes an existing image", async () => {
    const request = await openDialog({ src: "a.png", isEdit: true });

    button("Remove")!.click();

    await nextTick();

    expect(request.remove).toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("cancels on Escape", async () => {
    const request = await openDialog();

    srcInput().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    await nextTick();

    expect(request.cancel).toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("stops asking for a source once one is typed", async () => {
    await openDialog();
    await submit();
    expect(hint().hidden).toBe(false);

    await typeSrc("h");
    await typeSrc("");

    expect(hint().hidden).toBe(true);
  });

  it("selects the suggested description", async () => {
    await openDialog({
      chooseFile: vi
        .fn()
        .mockResolvedValue({ src: EMBEDDED, name: "chart.png" }),
    });

    button("Choose file…")!.click();
    await nextTick();
    await flushPromises();

    expect(document.activeElement).toBe(altInput());
    expect(altInput().selectionStart).toBe(0);
    expect(altInput().selectionEnd).toBe("chart".length);
  });

  it("shows a new dialog for a new request", async () => {
    await openDialog({ src: "first.png" });
    await typeSrc("typed.png");
    await openDialog({ src: "second.png" });

    expect(document.querySelectorAll("#image-dialog")).toHaveLength(1);
    expect(srcInput().value).toBe("second.png");
  });
});

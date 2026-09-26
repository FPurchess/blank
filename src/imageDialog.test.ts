import { beforeEach, describe, expect, it, vi } from "vitest";

import { bootImageDialog } from "./imageDialog";
import { type ImageDialogRequest, imageDialog } from "./state";
import { deferred, flushPromises } from "./test/async";

const dialog = () => document.querySelector<HTMLElement>("#image-dialog");
const form = () => dialog()?.querySelector("form") as HTMLFormElement;
const srcInput = () =>
  document.querySelector<HTMLInputElement>("#image-dialog-src")!;
const altInput = () =>
  document.querySelector<HTMLInputElement>("#image-dialog-alt")!;
const hint = () => document.querySelector<HTMLElement>("#image-dialog-hint")!;
const button = (label: string) =>
  Array.from(dialog()?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === label,
  );

const EMBEDDED = "data:image/png;base64,AAAA";

const openDialog = (request: Partial<ImageDialogRequest> = {}) => {
  const full: ImageDialogRequest = {
    src: "",
    alt: "",
    isEdit: false,
    chooseFile: vi.fn().mockResolvedValue(null),
    submit: vi.fn(),
    remove: vi.fn(),
    cancel: vi.fn(),
    ...request,
  };
  imageDialog.value = full;
  return full;
};

const typeSrc = (value: string) => {
  srcInput().value = value;
  srcInput().dispatchEvent(new Event("input"));
};

const submit = () => form().requestSubmit();

describe("imageDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    imageDialog.value = null;
    bootImageDialog();
  });

  it("is hidden without a request", () => {
    expect(dialog()).toBeNull();
  });

  it("opens for a new image with the source focused", () => {
    openDialog();

    expect(dialog()?.querySelector("h2")?.textContent).toBe("Image");
    expect(document.activeElement).toBe(srcInput());
    expect(button("Insert")).toBeDefined();
    expect(button("Remove")).toBeUndefined();
  });

  it("inserts a typed path or address", () => {
    const request = openDialog();
    typeSrc("images/chart.png");
    altInput().value = "Chart";

    submit();

    expect(request.submit).toHaveBeenCalledWith("images/chart.png", "Chart");
    expect(imageDialog.value).toBeNull();
    expect(dialog()).toBeNull();
  });

  it("asks for a source before inserting", () => {
    const request = openDialog();

    submit();

    expect(request.submit).not.toHaveBeenCalled();
    expect(hint().textContent).toBe(
      "Choose a file, or enter a path or web address",
    );
  });

  it("refuses sources that can't be saved", () => {
    openDialog();

    typeSrc("javascript:alert(1)");

    expect(hint().hidden).toBe(false);
    expect(button("Insert")?.disabled).toBe(true);
  });

  it("embeds a chosen file and suggests its name as description", async () => {
    const request = openDialog({
      chooseFile: vi
        .fn()
        .mockResolvedValue({ src: EMBEDDED, name: "chart.png" }),
    });

    button("Choose file…")!.click();
    await flushPromises();

    expect(srcInput().value).toBe("chart.png");
    expect(altInput().value).toBe("chart");
    expect(hint().textContent).toBe("Embedded in the document");
    expect(document.activeElement).toBe(altInput());

    submit();
    expect(request.submit).toHaveBeenCalledWith(EMBEDDED, "chart");
  });

  it("keeps a description that was already typed", async () => {
    openDialog({
      chooseFile: vi
        .fn()
        .mockResolvedValue({ src: EMBEDDED, name: "chart.png" }),
    });
    altInput().value = "Sales";

    button("Choose file…")!.click();
    await flushPromises();

    expect(altInput().value).toBe("Sales");
  });

  it("goes back to the button when no file was chosen", async () => {
    openDialog();
    const choose = button("Choose file…")!;

    choose.click();
    expect(choose.disabled).toBe(true);
    expect(hint().textContent).toBe("Choosing a file…");
    await flushPromises();

    expect(choose.disabled).toBe(false);
    expect(document.activeElement).toBe(choose);
    expect(hint().hidden).toBe(true);
  });

  it("ignores a file chosen after the dialog was closed", async () => {
    const chosen = deferred<{ src: string; name: string } | null>();
    const request = openDialog({ chooseFile: () => chosen.promise });
    button("Choose file…")!.click();
    button("Cancel")!.click();

    chosen.resolve({ src: EMBEDDED, name: "chart.png" });
    await flushPromises();

    expect(request.cancel).toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("shows an embedded image as a note, not as its data URL", () => {
    const request = openDialog({ src: EMBEDDED, alt: "Chart", isEdit: true });

    expect(dialog()?.querySelector("h2")?.textContent).toBe("Edit image");
    expect(srcInput().value).toBe("");
    expect(srcInput().placeholder).toBe("Embedded image");
    expect(hint().textContent).toBe("Embedded in the document");

    submit();
    expect(request.submit).toHaveBeenCalledWith(EMBEDDED, "Chart");
  });

  it("replaces an embedded image with a typed address", () => {
    const request = openDialog({ src: EMBEDDED, isEdit: true });

    typeSrc("https://example.com/a.png");
    submit();

    expect(request.submit).toHaveBeenCalledWith(
      "https://example.com/a.png",
      "",
    );
  });

  it("removes an existing image", () => {
    const request = openDialog({ src: "a.png", isEdit: true });

    button("Remove")!.click();

    expect(request.remove).toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });

  it("cancels on Escape", () => {
    const request = openDialog();

    srcInput().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );

    expect(request.cancel).toHaveBeenCalled();
    expect(dialog()).toBeNull();
  });
});

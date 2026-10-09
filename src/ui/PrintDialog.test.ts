import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { PRINT_DEFAULTS } from "../print/printModel";
import {
  contextMenu,
  printDialog,
  type PrintRequest,
  printSettings,
} from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

let dispose = () => {};
afterEach(() => {
  dispose();
  vi.useRealTimers();
});

const A4 = { width: 595.28, height: 841.89 };

const dialog = () => document.querySelector<HTMLElement>("#print");
const form = () => dialog()?.querySelector("form") as HTMLFormElement;
const row = (name: string) =>
  dialog()!.querySelector<HTMLElement>(`[data-row="${name}"]`);
const option = (name: string, label: string) =>
  [...row(name)!.querySelectorAll<HTMLButtonElement>(".options button")].find(
    (button) => button.textContent?.trim() === label,
  )!;
const submitButton = () =>
  dialog()!.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const button = (label: string) =>
  [...dialog()!.querySelectorAll<HTMLButtonElement>("button")].find(
    (candidate) => candidate.textContent?.trim() === label,
  )!;
const summary = () => dialog()!.querySelector(".summary")?.textContent?.trim();
const sheetLabel = () =>
  dialog()!.querySelector(".pager p")?.textContent?.trim();
const custom = () => document.querySelector<HTMLInputElement>("#print-custom");
const error = () =>
  document.querySelector("#print-custom-error")?.textContent?.trim();

const openDialog = async (request: Partial<PrintRequest> = {}) => {
  const full: PrintRequest = {
    pages: 3,
    current: 1,
    page: A4,
    paper: "A4, normal margins",
    print: vi.fn(),
    savePdf: vi.fn(),
    pageSetup: vi.fn(),
    cancel: vi.fn(),
    ...request,
  };
  printDialog.value = full;
  await nextTick();
  await nextTick();
  return full;
};

const click = async (element: HTMLElement) => {
  element.click();
  await nextTick();
};

const keydown = async (key: string, target?: Element | null) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  (target ?? document.activeElement ?? form()).dispatchEvent(event);
  await nextTick();
  return event;
};

const typeCustom = async (text: string) => {
  custom()!.value = text;
  custom()!.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
};

describe("the print dialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    printDialog.value = null;
    contextMenu.value = null;
    printSettings.value = PRINT_DEFAULTS;
    dispose = bootApp(createTestHandle());
  });

  it("opens on Print, ready to print every page", async () => {
    const request = await openDialog();

    expect(document.activeElement).toBe(submitButton());
    expect(submitButton().textContent?.trim()).toBe("Print…");
    expect(summary()).toBe("3 pages");
    expect(sheetLabel()).toBe("Page 1 of 3");
    expect(
      row("destination")!
        .querySelector('[aria-checked="true"]')
        ?.textContent?.trim(),
    ).toBe("Printer");

    form().requestSubmit();
    await nextTick();

    expect(printDialog.value).toBeNull();
    expect(request.print).toHaveBeenCalledWith({
      pages: [0, 1, 2],
      perSheet: 1,
      scale: "actual",
      copies: 1,
      collate: true,
    });
  });

  it("closes with Escape and with Cancel", async () => {
    const request = await openDialog();
    await keydown("Escape");
    expect(printDialog.value).toBeNull();
    expect(request.cancel).toHaveBeenCalledOnce();

    const again = await openDialog();
    await click(button("Cancel"));
    expect(printDialog.value).toBeNull();
    expect(again.cancel).toHaveBeenCalledOnce();
  });

  it("prints the current page, which its tooltip names", async () => {
    const request = await openDialog();
    const current = option("pages", "Current page");
    expect(current.dataset.tip).toBe("Page 2, where the cursor is");

    await click(current);
    expect(summary()).toBe("1 page");
    expect(sheetLabel()).toBe("Page 2 (1 of 1)");
    // Enter on an option prints instead of pressing it
    const enter = await keydown("Enter", current);

    expect(enter.defaultPrevented).toBe(true);
    expect(request.print).toHaveBeenCalledWith(
      expect.objectContaining({ pages: [1] }),
    );
  });

  it("says what is wrong with the pages typed once typing pauses, and won't print", async () => {
    vi.useFakeTimers();
    const request = await openDialog();
    await click(option("pages", "Custom"));
    expect(document.activeElement).toBe(custom());

    await typeCustom("9");
    // Print can't print it at once, but the message waits
    expect(submitButton().disabled).toBe(true);
    expect(error()).toBeUndefined();
    vi.advanceTimersByTime(800);
    await nextTick();
    expect(error()).toBe("There is no page 9. This document has 3 pages.");
    expect(custom()!.getAttribute("aria-invalid")).toBe("true");
    expect(custom()!.getAttribute("aria-describedby")).toBe(
      "print-custom-error",
    );

    // Enter in the field doesn't print either
    form().requestSubmit();
    await nextTick();
    expect(request.print).not.toHaveBeenCalled();
    expect(printDialog.value).not.toBeNull();

    // and the message goes as soon as the pages are right
    await typeCustom("1, 3");
    expect(error()).toBeUndefined();
    expect(submitButton().disabled).toBe(false);
    expect(summary()).toBe("2 pages");
  });

  it("says at once what is wrong on Enter in the field, and goes once Custom does", async () => {
    const request = await openDialog();
    await click(option("pages", "Custom"));
    await typeCustom("a");

    const enter = await keydown("Enter", custom());

    expect(enter.defaultPrevented).toBe(true);
    expect(error()).toBe(
      "“a” isn't a page or a range. Use numbers, like 1-3, 5.",
    );
    expect(request.print).not.toHaveBeenCalled();
    await click(option("pages", "All"));
    expect(error()).toBeUndefined();
    expect(submitButton().disabled).toBe(false);
  });

  it("pages through the preview with PageUp and PageDown while Print has the focus", async () => {
    printSettings.value = { ...PRINT_DEFAULTS, more: true };
    await openDialog();
    // remembered open
    expect(button("More settings").getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(submitButton());

    await keydown("PageDown");
    expect(sheetLabel()).toBe("Page 2 of 3");
    await keydown("PageUp");
    expect(sheetLabel()).toBe("Page 1 of 3");
    // and starts on the first sheet again once other pages print
    await keydown("PageDown");
    await click(option("pages", "Current page"));
    expect(sheetLabel()).toBe("Page 2 (1 of 1)");
  });

  it("says what is wrong once the field is left", async () => {
    await openDialog();
    await click(option("pages", "Custom"));
    await typeCustom("3-1");

    custom()!.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    await nextTick();

    expect(error()).toBe("3-1 runs backwards. Write it as 1-3.");
  });

  it("asks the system for copies, kept together from two on", async () => {
    const request = await openDialog();
    expect(button("Keep each copy together")).toBeUndefined();

    await click(dialog()!.querySelector('[aria-label="More copies"]')!);

    expect(
      document.querySelector<HTMLInputElement>("#print-copies")!.value,
    ).toBe("2");
    expect(summary()).toBe("3 pages, 2 copies");
    const together = button("Keep each copy together");
    expect(together.getAttribute("aria-checked")).toBe("true");
    await click(together);

    form().requestSubmit();
    await nextTick();
    expect(request.print).toHaveBeenCalledWith(
      expect.objectContaining({ copies: 2, collate: false }),
    );
  });

  it("prints several pages to a sheet and remembers it", async () => {
    const request = await openDialog();
    await click(button("More settings"));
    expect(button("More settings").getAttribute("aria-expanded")).toBe("true");

    await click(option("perSheet", "2"));

    expect(summary()).toBe("3 pages on 2 sheets");
    expect(sheetLabel()).toBe("Sheet 1 of 2, pages 1, 2");
    await keydown("PageDown");
    expect(sheetLabel()).toBe("Sheet 2 of 2, page 3");
    // the remembered choices change only once it prints
    expect(printSettings.value).toEqual(PRINT_DEFAULTS);

    form().requestSubmit();
    await nextTick();
    expect(request.print).toHaveBeenCalledWith(
      expect.objectContaining({ perSheet: 2 }),
    );
    expect(printSettings.value).toEqual({
      destination: "printer",
      perSheet: 2,
      scale: "actual",
      more: true,
    });
  });

  it("saves a PDF of the pages as they are", async () => {
    printSettings.value = {
      ...PRINT_DEFAULTS,
      perSheet: 2,
      more: true,
    };
    const request = await openDialog();

    await click(option("destination", "PDF file"));

    expect(submitButton().textContent?.trim()).toBe("Save PDF…");
    expect(row("copies")).toBeNull();
    expect(row("perSheet")).toBeNull();
    expect(row("scale")).toBeNull();
    expect(summary()).toBe("3 pages");
    expect(dialog()!.querySelector(".note")?.textContent?.trim()).toBe(
      "Saves the chosen pages as a PDF, the same file Export as PDF writes.",
    );

    form().requestSubmit();
    await nextTick();
    expect(request.savePdf).toHaveBeenCalledWith([0, 1, 2]);
    expect(request.print).not.toHaveBeenCalled();
  });

  it("opens again after printing failed, ready to save a PDF", async () => {
    const note =
      "Printing needs your desktop's print service. Save a PDF and print it from another app.";
    const request = await openDialog({ note, destination: "pdf" });

    expect(submitButton().textContent?.trim()).toBe("Save PDF…");
    const shown = dialog()!.querySelector(".note")!;
    expect(shown.textContent?.trim()).toBe(note);
    expect(shown.classList.contains("warning")).toBe(true);

    form().requestSubmit();
    await nextTick();
    expect(request.savePdf).toHaveBeenCalled();
    // the destination it opened with isn't remembered
    expect(printSettings.value.destination).toBe("printer");
  });

  it("names the paper and opens the page setup instead", async () => {
    const request = await openDialog();
    await click(button("More settings"));
    expect(row("paper")!.querySelector(".paper")?.textContent).toBe(
      "A4, normal margins",
    );

    await click(button("Page setup…"));

    expect(printDialog.value).toBeNull();
    expect(request.pageSetup).toHaveBeenCalledOnce();
  });
});

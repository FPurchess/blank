import { beforeEach, describe, expect, it, vi } from "vitest";

import { allMargins, DEFAULT_PAGE } from "./layout/settings";
import { bootPageSetup } from "./pageSetup";
import { pageSetup, type PageSetupRequest } from "./state";
import { cm, mm } from "./test/layout";

const dialog = () => document.querySelector<HTMLElement>("#page-setup");
const form = () => dialog()?.querySelector("form") as HTMLFormElement;
const row = (name: string) =>
  dialog()!.querySelector<HTMLElement>(`[data-row="${name}"]`)!;
const checked = (name: string) =>
  row(name).querySelector<HTMLButtonElement>('[aria-checked="true"]')!;
const option = (name: string, label: string) =>
  [...row(name).querySelectorAll<HTMLButtonElement>('[role="radio"]')].find(
    (button) => button.textContent === label,
  )!;
const fields = (name: string) =>
  dialog()!.querySelector<HTMLElement>(`[data-fields="${name}"]`)!;
const input = (id: string) =>
  document.querySelector<HTMLInputElement>(`#page-setup-${id}`)!;
const button = (label: string) =>
  [...(dialog()?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent === label,
  )!;
const errors = () => document.querySelector<HTMLElement>("#page-setup-errors")!;

const openDialog = (request: Partial<PageSetupRequest> = {}) => {
  const full: PageSetupRequest = {
    settings: DEFAULT_PAGE,
    locale: "de-DE",
    unit: "cm",
    frontmatter: null,
    warnings: [],
    apply: vi.fn(),
    applyText: vi.fn(() => null),
    makeDefault: vi.fn(),
    cancel: vi.fn(),
    ...request,
  };
  pageSetup.value = full;
  return full;
};

const keydown = (key: string) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  (document.activeElement ?? form()).dispatchEvent(event);
  return event;
};

const type = (id: string, value: string) => {
  input(id).value = value;
  input(id).dispatchEvent(new Event("input"));
};

describe("pageSetup dialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    pageSetup.value = null;
    bootPageSetup();
  });

  it("is hidden without a request", () => {
    expect(dialog()).toBeNull();
  });

  it("shows the document's page and focuses the paper", () => {
    openDialog();

    expect(checked("paper").textContent).toBe("A4 (your region)");
    expect(checked("orientation").textContent).toBe("Portrait");
    expect(checked("margins").textContent).toBe("Normal");
    expect(document.activeElement).toBe(checked("paper"));
    expect(dialog()!.querySelector("figcaption")?.textContent).toBe("A4");
    expect(fields("paper").hidden).toBe(true);
    expect(fields("margins").hidden).toBe(true);
  });

  it("keeps only the checked option of a row in the tab order", () => {
    openDialog();

    const tabbable = [...row("margins").querySelectorAll("button")].map(
      (b) => b.tabIndex,
    );
    expect(tabbable).toEqual([-1, 0, -1, -1]);
  });

  it("changes a row with ←→ and moves between rows with ↑↓", () => {
    openDialog();

    keydown("ArrowDown");
    expect(document.activeElement).toBe(checked("orientation"));
    keydown("ArrowRight");
    expect(checked("orientation").textContent).toBe("Landscape");
    expect(document.activeElement).toBe(checked("orientation"));
    expect(dialog()!.querySelector("figcaption")?.textContent).toBe(
      "A4 landscape",
    );
    keydown("ArrowRight");
    expect(checked("orientation").textContent).toBe("Portrait");
    keydown("ArrowUp");
    expect(document.activeElement).toBe(checked("paper"));
    keydown("End");
    expect(checked("paper").textContent).toBe("Custom…");
  });

  it("applies the chosen settings with Enter", () => {
    const request = openDialog();

    keydown("ArrowDown");
    keydown("ArrowRight");
    keydown("Enter");

    expect(request.apply).toHaveBeenCalledWith({
      ...DEFAULT_PAGE,
      orientation: "landscape",
    });
    expect(pageSetup.value).toBeNull();
    expect(dialog()).toBeNull();
  });

  it("applies a clicked option", () => {
    const request = openDialog();

    option("margins", "Wide").click();
    button("Apply").click();

    expect(request.apply).toHaveBeenCalledWith({
      ...DEFAULT_PAGE,
      margins: allMargins(cm(3.5)),
    });
  });

  it("takes custom margins, with ↓ into the fields", () => {
    const request = openDialog();

    option("margins", "Custom…").click();
    expect(fields("margins").hidden).toBe(false);
    keydown("ArrowDown");
    expect(document.activeElement).toBe(input("margins-top"));
    type("margins-top", "3");
    type("margins-left", "20mm");
    form().requestSubmit();

    expect(request.apply).toHaveBeenCalledWith({
      ...DEFAULT_PAGE,
      margins: { ...allMargins(cm(2.5)), top: cm(3), left: mm(20) },
    });
  });

  it("explains what can't be used and doesn't apply it", () => {
    const request = openDialog();

    option("paper", "Custom…").click();
    type("paper-width", "wide");

    expect(errors().hidden).toBe(false);
    expect(errors().textContent).toBe(
      "Enter the width and height, e.g. 17 and 24",
    );
    expect(button("Apply").disabled).toBe(true);
    form().requestSubmit();
    expect(request.apply).not.toHaveBeenCalled();

    type("paper-width", "17");
    expect(errors().hidden).toBe(true);
    expect(button("Apply").disabled).toBe(false);
  });

  it("shows lengths in the unit of the region", () => {
    openDialog({
      settings: { ...DEFAULT_PAGE, margins: { ...allMargins(72), top: 36 } },
      locale: "en-US",
      unit: "in",
    });

    expect(checked("paper").textContent).toBe("Letter (your region)");
    expect(checked("margins").textContent).toBe("Custom…");
    expect(input("margins-top").value).toBe("0.5");
    expect(
      document.querySelector('label[for="page-setup-margins-top"]')
        ?.textContent,
    ).toBe("Top (in)");
  });

  it("starts chapters on new pages", () => {
    const request = openDialog();

    expect(checked("chapters").textContent).toBe("Run On");
    option("chapters", "Each on a New Page").click();
    button("Apply").click();

    expect(request.apply).toHaveBeenCalledWith({
      ...DEFAULT_PAGE,
      newPageBefore: [1],
    });
  });

  it("keeps the heading levels of the text", () => {
    const request = openDialog({
      settings: { ...DEFAULT_PAGE, newPageBefore: [1, 2] },
    });

    expect(checked("chapters").textContent).toBe(
      "Headings 1 and 2 on new pages",
    );
    button("Apply").click();

    expect(request.apply).toHaveBeenCalledWith({
      ...DEFAULT_PAGE,
      newPageBefore: [1, 2],
    });
  });

  it("makes the settings the default", () => {
    const request = openDialog();

    option("paper", "A5").click();
    button("Make This My Default").click();

    expect(request.makeDefault).toHaveBeenCalledWith({
      ...DEFAULT_PAGE,
      size: "a5",
    });
    expect(dialog()).toBeNull();
  });

  it("shows what of the document's page setup can't be used", () => {
    openDialog({ warnings: ["Blank used the default page setup where x"] });

    const warning = dialog()!.querySelector<HTMLElement>(".warning")!;
    expect(warning.hidden).toBe(false);
    expect(warning.textContent).toBe(
      "Blank used the default page setup where x",
    );
  });

  it("cancels with Escape and with Cancel", () => {
    const request = openDialog();
    keydown("Escape");
    expect(request.cancel).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();

    const again = openDialog();
    button("Cancel").click();
    expect(again.cancel).toHaveBeenCalledTimes(1);
  });

  describe("as text", () => {
    it("edits the whole frontmatter", () => {
      const request = openDialog({ frontmatter: "title: Hi" });

      button("Edit as Text").click();
      const text =
        document.querySelector<HTMLTextAreaElement>("#page-setup-text")!;
      expect(text.value).toBe("title: Hi");
      expect(document.activeElement).toBe(text);
      expect(button("Make This My Default").hidden).toBe(true);
      expect(dialog()!.querySelector<HTMLElement>(".hint")!.hidden).toBe(true);

      text.value = "title: Bye";
      form().requestSubmit();

      expect(request.applyText).toHaveBeenCalledWith("title: Bye");
      expect(request.apply).not.toHaveBeenCalled();
      expect(dialog()).toBeNull();
    });

    it("stays open to fix what can't be written", () => {
      openDialog({ applyText: vi.fn(() => "Nested mappings are not allowed") });

      button("Edit as Text").click();
      form().requestSubmit();

      expect(dialog()).not.toBeNull();
      expect(errors().hidden).toBe(false);
      expect(errors().textContent).toBe("Nested mappings are not allowed");
    });
  });
});

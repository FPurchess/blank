import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isProxy, nextTick } from "vue";

import {
  allMargins,
  DEFAULT_PAGE,
  type PageSettings,
} from "../layout/settings";
import { pageSetup, type PageSetupRequest } from "../state";
import { createTestHandle } from "../test/editor";
import { cm, mm } from "../test/layout";
import { bootApp } from "./mount";

let dispose = () => {};
afterEach(() => dispose());

const dialog = () => document.querySelector<HTMLElement>("#page-setup");
const form = () => dialog()?.querySelector("form") as HTMLFormElement;
const row = (name: string) =>
  dialog()!.querySelector<HTMLElement>(`[data-row="${name}"]`)!;
const checked = (name: string) =>
  row(name).querySelector<HTMLButtonElement>('[aria-checked="true"]')!;
const option = (name: string, label: string) =>
  [...row(name).querySelectorAll<HTMLButtonElement>(".options button")].find(
    (button) => button.textContent?.trim() === label,
  )!;
const fields = (name: string) =>
  dialog()!.querySelector<HTMLElement>(`[data-fields="${name}"]`)!;
const input = (id: string) =>
  document.querySelector<HTMLInputElement>(`#page-setup-${id}`)!;
const button = (label: string) =>
  [...(dialog()?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent?.trim() === label,
  )!;
const errors = () => document.querySelector<HTMLElement>("#page-setup-errors")!;

const openDialog = async (request: Partial<PageSetupRequest> = {}) => {
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
  await nextTick();
  return full;
};

const keydown = async (key: string) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  (document.activeElement ?? form()).dispatchEvent(event);
  await nextTick();
  return event;
};

const type = async (id: string, value: string) => {
  input(id).value = value;
  input(id).dispatchEvent(new Event("input"));
  await nextTick();
};

const click = async (element: HTMLElement) => {
  element.click();
  await nextTick();
};

const submit = async () => {
  form().requestSubmit();
  await nextTick();
};

describe("pageSetup dialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    pageSetup.value = null;
    dispose = bootApp(createTestHandle());
  });

  it("is hidden without a request", async () => {
    expect(dialog()).toBeNull();
  });

  it("shows the document's page and focuses the paper", async () => {
    await openDialog();

    expect(checked("paper").textContent?.trim()).toBe("A4 (your region)");
    expect(checked("orientation").textContent?.trim()).toBe("Portrait");
    expect(checked("margins").textContent?.trim()).toBe("Normal");
    expect(document.activeElement).toBe(checked("paper"));
    expect(dialog()!.querySelector("figcaption")?.textContent?.trim()).toBe(
      "A4",
    );
    expect(fields("paper").hidden).toBe(true);
    expect(fields("margins").hidden).toBe(true);
  });

  it("keeps only the checked option of a row in the tab order", async () => {
    await openDialog();

    const tabbable = [...row("margins").querySelectorAll("button")].map(
      (b) => b.tabIndex,
    );
    expect(tabbable).toEqual([-1, 0, -1, -1]);
  });

  it("changes a row with ←→ and moves between rows with ↑↓", async () => {
    await openDialog();

    await keydown("ArrowDown");
    expect(document.activeElement).toBe(checked("orientation"));
    await keydown("ArrowRight");
    expect(checked("orientation").textContent?.trim()).toBe("Landscape");
    expect(document.activeElement).toBe(checked("orientation"));
    expect(dialog()!.querySelector("figcaption")?.textContent?.trim()).toBe(
      "A4 landscape",
    );
    await keydown("ArrowRight");
    expect(checked("orientation").textContent?.trim()).toBe("Portrait");
    await keydown("ArrowUp");
    expect(document.activeElement).toBe(checked("paper"));
    await keydown("End");
    expect(checked("paper").textContent?.trim()).toBe("Custom…");
  });

  it("applies the chosen settings with Enter", async () => {
    const request = await openDialog();

    await keydown("ArrowDown");
    await keydown("ArrowRight");
    await keydown("Enter");

    expect(request.apply).toHaveBeenCalledWith({
      ...DEFAULT_PAGE,
      orientation: "landscape",
    });
    expect(pageSetup.value).toBeNull();
    expect(dialog()).toBeNull();
  });

  it("applies a clicked option", async () => {
    const request = await openDialog();

    await click(option("margins", "Wide"));
    await click(button("Apply"));

    expect(request.apply).toHaveBeenCalledWith({
      ...DEFAULT_PAGE,
      margins: allMargins(cm(3.5)),
    });
  });

  it("takes custom margins, with ↓ into the fields", async () => {
    const request = await openDialog();

    await click(option("margins", "Custom…"));
    expect(fields("margins").hidden).toBe(false);
    await keydown("ArrowDown");
    expect(document.activeElement).toBe(input("margins-top"));
    await type("margins-top", "3");
    await type("margins-left", "20mm");
    await submit();

    expect(request.apply).toHaveBeenCalledWith({
      ...DEFAULT_PAGE,
      margins: { ...allMargins(cm(2.5)), top: cm(3), left: mm(20) },
    });
  });

  it("explains what can't be used and doesn't apply it", async () => {
    const request = await openDialog();

    await click(option("paper", "Custom…"));
    await type("paper-width", "wide");

    expect(errors().hidden).toBe(false);
    expect(errors().textContent?.trim()).toBe(
      "Enter the width and height, e.g. 17 and 24",
    );
    expect(button("Apply").disabled).toBe(true);
    await submit();
    expect(request.apply).not.toHaveBeenCalled();

    await type("paper-width", "17");
    expect(errors().hidden).toBe(true);
    expect(button("Apply").disabled).toBe(false);
  });

  it("shows lengths in the unit of the region", async () => {
    await openDialog({
      settings: { ...DEFAULT_PAGE, margins: { ...allMargins(72), top: 36 } },
      locale: "en-US",
      unit: "in",
    });

    expect(checked("paper").textContent?.trim()).toBe("Letter (your region)");
    expect(checked("margins").textContent?.trim()).toBe("Custom…");
    expect(input("margins-top").value).toBe("0.5");
    expect(
      document
        .querySelector('label[for="page-setup-margins-top"]')
        ?.textContent?.trim(),
    ).toBe("Top (in)");
  });

  describe("new page before", () => {
    const toggles = () => [
      ...row("newPageBefore").querySelectorAll<HTMLButtonElement>("button"),
    ];
    const pressed = () =>
      toggles()
        .filter((button) => button.getAttribute("aria-pressed") === "true")
        .map((button) => button.textContent?.trim());

    it("offers every heading level, none pressed by default", async () => {
      await openDialog();

      expect(row("newPageBefore").getAttribute("role")).toBe("group");
      expect(toggles().map((button) => button.textContent?.trim())).toEqual([
        "Heading 1",
        "Heading 2",
        "Heading 3",
        "Heading 4",
        "Heading 5",
        "Heading 6",
      ]);
      expect(pressed()).toEqual([]);
    });

    it("starts the headings that are pressed on a new page", async () => {
      const request = await openDialog({
        settings: { ...DEFAULT_PAGE, newPageBefore: [2] },
      });
      expect(pressed()).toEqual(["Heading 2"]);

      await click(option("newPageBefore", "Heading 1"));
      await click(option("newPageBefore", "Heading 2"));
      await click(option("newPageBefore", "Heading 3"));
      await click(button("Apply"));

      expect(request.apply).toHaveBeenCalledWith({
        ...DEFAULT_PAGE,
        newPageBefore: [1, 3],
      });
    });

    it("moves with ←→ without switching, and stays a stop for ↑↓", async () => {
      await openDialog();
      checked("margins").focus();

      await keydown("ArrowDown");
      expect(document.activeElement).toBe(toggles()[0]);
      await keydown("ArrowRight");
      expect(document.activeElement).toBe(toggles()[1]);
      expect(pressed()).toEqual([]);
      // only the focused toggle is in the tab order
      expect(toggles().map((button) => button.tabIndex)).toEqual([
        -1, 0, -1, -1, -1, -1,
      ]);
      await keydown("ArrowUp");
      expect(document.activeElement).toBe(checked("margins"));
    });
  });

  it("makes the settings the default", async () => {
    const request = await openDialog();

    await click(option("paper", "A5"));
    await click(button("Make This My Default"));

    expect(request.makeDefault).toHaveBeenCalledWith({
      ...DEFAULT_PAGE,
      size: "a5",
    });
    expect(dialog()).toBeNull();
  });

  it("shows what of the document's page setup can't be used", async () => {
    await openDialog({
      warnings: ["Blank used the default page setup where x"],
    });

    const warning = dialog()!.querySelector<HTMLElement>(".warning")!;
    expect(warning.hidden).toBe(false);
    expect(warning.textContent?.trim()).toBe(
      "Blank used the default page setup where x",
    );
  });

  it("cancels with Escape and with Cancel", async () => {
    const request = await openDialog();
    await keydown("Escape");
    expect(request.cancel).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();

    const again = await openDialog();
    await click(button("Cancel"));
    expect(again.cancel).toHaveBeenCalledTimes(1);
  });

  describe("as text", () => {
    it("edits the whole frontmatter", async () => {
      const request = await openDialog({ frontmatter: "title: Hi" });

      await click(button("Edit as Text"));
      const text =
        document.querySelector<HTMLTextAreaElement>("#page-setup-text")!;
      expect(text.value).toBe("title: Hi");
      expect(document.activeElement).toBe(text);
      expect(button("Make This My Default").hidden).toBe(true);
      expect(dialog()!.querySelector<HTMLElement>(".hint")!.hidden).toBe(true);

      text.value = "title: Bye";
      text.dispatchEvent(new Event("input"));
      await submit();

      expect(request.applyText).toHaveBeenCalledWith("title: Bye");
      expect(request.apply).not.toHaveBeenCalled();
      expect(dialog()).toBeNull();
    });

    it("stays open to fix what can't be written", async () => {
      await openDialog({
        applyText: vi.fn(() => "Nested mappings are not allowed"),
      });

      await click(button("Edit as Text"));
      await submit();

      expect(dialog()).not.toBeNull();
      expect(errors().hidden).toBe(false);
      expect(errors().textContent?.trim()).toBe(
        "Nested mappings are not allowed",
      );
    });
  });

  it("is a dialog of its own, with fields for lengths", async () => {
    await openDialog();

    expect(form().classList).toContain("page-setup");
    expect(form().classList).toContain("dialog");
    expect(input("margins-top").inputMode).toBe("decimal");
  });

  it("focuses a clicked option, so ↑↓ go on from it", async () => {
    await openDialog();

    await click(option("margins", "Wide"));
    expect(document.activeElement).toBe(option("margins", "Wide"));
    await keydown("ArrowUp");
    expect(document.activeElement).toBe(checked("orientation"));
  });

  it("applies with Enter on a heading, without switching it", async () => {
    const request = await openDialog();
    checked("margins").focus();
    await keydown("ArrowDown");

    const enter = await keydown("Enter");

    expect(enter.defaultPrevented).toBe(true);
    expect(request.apply).toHaveBeenCalledWith(DEFAULT_PAGE);
  });

  it("keeps showing the last page it could draw while the choices are wrong", async () => {
    await openDialog();
    await click(option("paper", "Custom…"));
    const drawn = dialog()!.querySelector(".thumbnail")!.innerHTML;

    await type("paper-width", "wide");

    expect(dialog()!.querySelector(".thumbnail")!.innerHTML).toBe(drawn);
    expect(dialog()!.querySelector(".thumbnail svg")).not.toBeNull();
  });

  it("applies settings that Vue doesn't proxy, with the headers kept", async () => {
    const header = { left: "{title}", center: "", right: "" };
    const settings: PageSettings = { ...DEFAULT_PAGE, header };
    const request = await openDialog({ settings });

    await click(option("newPageBefore", "Heading 1"));
    await click(option("margins", "Custom…"));
    await submit();

    const [applied] = vi.mocked(request.apply).mock.calls[0];
    expect(applied).toEqual({ ...settings, newPageBefore: [1] });
    const proxied = (value: unknown): boolean =>
      isProxy(value) ||
      (typeof value === "object" &&
        value !== null &&
        Object.values(value).some(proxied));
    expect(proxied(applied)).toBe(false);
    expect(applied.header).toBe(header);
  });

  it("shows a new dialog for a new request", async () => {
    await openDialog();
    await click(option("margins", "Wide"));

    await openDialog();

    expect(document.querySelectorAll("#page-setup")).toHaveLength(1);
    expect(checked("margins").textContent?.trim()).toBe("Normal");
  });

  it("clears what was wrong with the text once it's typed again", async () => {
    await openDialog({
      applyText: vi.fn(() => "Nested mappings are not allowed"),
    });
    await click(button("Edit as Text"));
    await submit();
    expect(errors().hidden).toBe(false);

    const text =
      document.querySelector<HTMLTextAreaElement>("#page-setup-text")!;
    text.dispatchEvent(new Event("input"));
    await nextTick();

    expect(errors().hidden).toBe(true);
    expect(button("Apply").disabled).toBe(false);
  });

  it("names each row by its label and marks its options", async () => {
    await openDialog();

    const margins = row("margins");
    const label = document.getElementById(
      margins.getAttribute("aria-labelledby")!,
    );
    expect(label?.textContent?.trim()).toBe("Margins");
    expect(margins.contains(label)).toBe(true);
    expect(checked("margins").getAttribute("role")).toBe("radio");
    expect(checked("margins").dataset.value).toBe("normal");
    expect(
      row("newPageBefore").querySelector("button")!.hasAttribute("role"),
    ).toBe(false);
  });

  it("takes the arrow keys it handles", async () => {
    await openDialog();

    expect((await keydown("ArrowRight")).defaultPrevented).toBe(true);
    expect((await keydown("ArrowDown")).defaultPrevented).toBe(true);
    // at the last stop, ↓ is left alone
    checked("margins").focus();
    await keydown("ArrowDown");
    expect((await keydown("ArrowDown")).defaultPrevented).toBe(false);
  });

  it("hides the warning line without warnings", async () => {
    await openDialog();

    expect(dialog()!.querySelector<HTMLElement>(".warning")!.hidden).toBe(true);
  });

  it("joins several warnings and errors into sentences", async () => {
    await openDialog({ warnings: ["One", "Two"] });
    expect(dialog()!.querySelector(".warning")!.textContent?.trim()).toBe(
      "One. Two",
    );

    await click(option("paper", "Custom…"));
    await type("paper-width", "wide");
    await click(option("margins", "Custom…"));
    await type("margins-top", "much");
    expect(errors().textContent?.trim()).toBe(
      "Enter the width and height, e.g. 17 and 24. " +
        "Enter each margin as a length, e.g. 2.5",
    );
  });

  it("blocks making wrong choices the default", async () => {
    await openDialog();

    await click(option("paper", "Custom…"));
    await type("paper-width", "wide");

    expect(button("Make This My Default").disabled).toBe(true);
  });

  // even while the rows hold something wrong
  it("shows only the text once it's edited as text", async () => {
    await openDialog();
    await click(option("paper", "Custom…"));
    await type("paper-width", "wide");

    await click(button("Edit as Text"));

    expect(dialog()!.querySelector<HTMLElement>(".settings")!.hidden).toBe(
      true,
    );
    expect(dialog()!.querySelector<HTMLElement>(".thumbnail")!.hidden).toBe(
      true,
    );
    expect(button("Edit as Text").hidden).toBe(true);
    expect(button("Apply").disabled).toBe(false);
    expect(errors().hidden).toBe(true);
  });
});

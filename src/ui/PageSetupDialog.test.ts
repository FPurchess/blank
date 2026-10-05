import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isProxy, nextTick } from "vue";

import {
  allMargins,
  DEFAULT_PAGE,
  type PageSettings,
} from "../layout/settings";
import { contextMenu, pageSetup, type PageSetupRequest } from "../state";
import { createTestHandle } from "../test/editor";
import { cm, mm } from "../test/layout";
import { bootApp } from "./mount";

let dispose = () => {};
afterEach(() => {
  dispose();
  contextMenu.value = null;
});

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
const errorTexts = () =>
  [...errors().querySelectorAll("p")].map((p) => p.textContent?.trim());
const textarea = () =>
  document.querySelector<HTMLTextAreaElement>("#page-setup-text")!;
const caption = () =>
  dialog()!.querySelector("figcaption")?.textContent?.trim();

// the paper's list, and what it shows
const paper = () => input("paper") as unknown as HTMLButtonElement;
const paperText = () => paper().querySelector(".text")?.textContent?.trim();
const menuItem = (id: string) =>
  document.querySelector<HTMLElement>(`.context-menu [data-id="${id}"]`);
const choosePaper = async (id: string) => {
  await click(paper());
  await click(menuItem(id)!);
};

// what the dialog wrote onto: the document's own page setup
const opened = (request: PageSetupRequest) => ({
  frontmatter: request.frontmatter,
  settings: request.settings,
});

const openDialog = async (request: Partial<PageSetupRequest> = {}) => {
  const full: PageSetupRequest = {
    settings: DEFAULT_PAGE,
    locale: "de-DE",
    unit: "cm",
    frontmatter: null,
    warnings: [],
    apply: vi.fn(),
    applyText: vi.fn(() => null),
    textOf: vi.fn(() => "page:\n  size: a5"),
    readText: vi.fn(() => ({ settings: DEFAULT_PAGE, warnings: [] })),
    makeDefault: vi.fn(),
    cancel: vi.fn(),
    ...request,
  };
  pageSetup.value = full;
  await nextTick();
  return full;
};

const keydown = async (key: string, init: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
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

const typeText = async (value: string) => {
  textarea().value = value;
  textarea().dispatchEvent(new Event("input"));
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
    contextMenu.value = null;
    dispose = bootApp(createTestHandle());
  });

  it("is hidden without a request", async () => {
    expect(dialog()).toBeNull();
  });

  it("shows the document's page and focuses the paper", async () => {
    await openDialog();

    expect(paperText()).toBe("A4 (your region)");
    expect(paper().getAttribute("aria-label")).toBe("Paper: A4 (your region)");
    expect(checked("orientation").textContent?.trim()).toBe("Portrait");
    expect(checked("margins").textContent?.trim()).toBe("Normal");
    expect(document.activeElement).toBe(paper());
    expect(caption()).toBe("A4");
    expect(fields("paper").hidden).toBe(true);
    expect(fields("margins").hidden).toBe(true);
    expect(dialog()!.querySelector(".note")?.textContent?.trim()).toBe(
      "Kept in this document. Headers and footers are set on the pages.",
    );
  });

  it("keeps only the checked option of a row in the tab order", async () => {
    await openDialog();

    const tabbable = [...row("margins").querySelectorAll("button")].map(
      (b) => b.tabIndex,
    );
    expect(tabbable).toEqual([-1, 0, -1, -1]);
  });

  describe("the paper's list", () => {
    it("lists the paper of the region first, the chosen one checked", async () => {
      await openDialog();

      await click(paper());

      const items = [
        ...document.querySelectorAll<HTMLElement>(".context-menu [data-id]"),
      ];
      expect(items.map((item) => item.textContent?.trim())).toEqual([
        "✓A4 (your region)",
        "A3",
        "A5",
        "B5",
        "Letter",
        "Legal",
        "Custom…",
      ]);
      expect(menuItem("auto")?.getAttribute("aria-checked")).toBe("true");
      expect(paper().getAttribute("aria-expanded")).toBe("true");
    });

    it("chooses a paper, and gives the list the focus back", async () => {
      const request = await openDialog();

      await choosePaper("a5");

      expect(paperText()).toBe("A5");
      expect(caption()).toBe("A5");
      expect(document.activeElement).toBe(paper());
      await submit();
      expect(request.apply).toHaveBeenCalledWith(
        { ...DEFAULT_PAGE, size: "a5" },
        opened(request),
      );
    });

    it("starts a custom size from the paper chosen, and focuses it", async () => {
      await openDialog({
        settings: { ...DEFAULT_PAGE, orientation: "landscape" },
      });

      await choosePaper("custom");
      await nextTick();

      expect(fields("paper").hidden).toBe(false);
      expect(input("paper-width").value).toBe("297");
      expect(input("paper-height").value).toBe("210");
      expect(document.activeElement).toBe(input("paper-width"));
    });

    it("leaves ↑↓ to the rows, and opens with Alt+↓", async () => {
      await openDialog();

      const down = await keydown("ArrowDown");
      expect(down.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(checked("orientation"));
      expect(contextMenu.value).toBeNull();

      await keydown("ArrowUp");
      expect(document.activeElement).toBe(paper());
      await keydown("ArrowDown", { altKey: true });
      expect(contextMenu.value).not.toBeNull();
    });

    it("never applies with Enter, which opens it", async () => {
      const request = await openDialog();

      const enter = await keydown("Enter");

      expect(enter.defaultPrevented).toBe(false);
      expect(request.apply).not.toHaveBeenCalled();
      expect(dialog()).not.toBeNull();
    });

    it("steps through the papers with ←→, stopping at the ends", async () => {
      await openDialog();

      await keydown("ArrowRight");
      expect(paperText()).toBe("A3");
      await keydown("ArrowLeft");
      await keydown("ArrowLeft");
      expect(paperText()).toBe("A4 (your region)");
    });

    it("keeps the focus on the list when the arrows reach Custom…", async () => {
      await openDialog();

      for (let step = 0; step < 6; step++) await keydown("ArrowRight");
      await nextTick();

      expect(paperText()).toBe("Custom…");
      expect(fields("paper").hidden).toBe(false);
      expect(document.activeElement).toBe(paper());
      await keydown("ArrowLeft");
      expect(paperText()).toBe("Legal");
    });
  });

  it("changes a row with ←→ and moves between rows with ↑↓", async () => {
    await openDialog();

    await keydown("ArrowDown");
    expect(document.activeElement).toBe(checked("orientation"));
    await keydown("ArrowRight");
    expect(checked("orientation").textContent?.trim()).toBe("Landscape");
    expect(document.activeElement).toBe(checked("orientation"));
    expect(caption()).toBe("A4 landscape");
    await keydown("ArrowRight");
    expect(checked("orientation").textContent?.trim()).toBe("Portrait");
    await keydown("ArrowUp");
    expect(document.activeElement).toBe(paper());
  });

  it("applies the chosen settings with Enter", async () => {
    const request = await openDialog();

    await keydown("ArrowDown");
    await keydown("ArrowRight");
    await keydown("Enter");

    expect(request.apply).toHaveBeenCalledWith(
      { ...DEFAULT_PAGE, orientation: "landscape" },
      opened(request),
    );
    expect(pageSetup.value).toBeNull();
    expect(dialog()).toBeNull();
  });

  it("applies a clicked option", async () => {
    const request = await openDialog();

    await click(option("margins", "Wide"));
    await click(button("Apply"));

    expect(request.apply).toHaveBeenCalledWith(
      { ...DEFAULT_PAGE, margins: allMargins(cm(3.5)) },
      opened(request),
    );
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

    expect(request.apply).toHaveBeenCalledWith(
      {
        ...DEFAULT_PAGE,
        margins: { ...allMargins(cm(2.5)), top: cm(3), left: mm(20) },
      },
      opened(request),
    );
  });

  it("explains what can't be used and doesn't apply it", async () => {
    const request = await openDialog();

    await choosePaper("custom");
    await type("paper-width", "wide");

    expect(errors().getAttribute("aria-live")).toBe("polite");
    expect(errorTexts()).toEqual([
      "Enter the width and height, e.g. 170 and 240.",
    ]);
    expect(button("Apply").disabled).toBe(true);
    await submit();
    expect(request.apply).not.toHaveBeenCalled();

    await type("paper-width", "170");
    // the live region stays, empty
    expect(errors().hidden).toBe(false);
    expect(errorTexts()).toEqual([]);
    expect(button("Apply").disabled).toBe(false);
  });

  it("links the fields to what is wrong with them", async () => {
    await openDialog();
    await choosePaper("custom");
    expect(input("paper-width").hasAttribute("aria-invalid")).toBe(false);

    await type("paper-width", "wide");

    const width = input("paper-width");
    expect(width.getAttribute("aria-invalid")).toBe("true");
    const described = width.getAttribute("aria-describedby")!.split(" ");
    expect(described).toContain("page-setup-error-paper");
    expect(document.getElementById("page-setup-error-paper")?.textContent).toBe(
      "Enter the width and height, e.g. 170 and 240.",
    );
    // the margins are fine
    expect(input("margins-top").hasAttribute("aria-invalid")).toBe(false);
  });

  it("links what is wrong with the margins to their row while a preset is chosen", async () => {
    await openDialog();
    await choosePaper("custom");
    await type("paper-width", "90");
    await type("paper-height", "90");
    await click(option("margins", "Wide"));

    expect(errorTexts()).toEqual(["The margins leave no room for the text."]);
    expect(row("margins").getAttribute("aria-invalid")).toBe("true");
    expect(row("margins").getAttribute("aria-describedby")).toBe(
      "page-setup-error-margins",
    );

    // the custom margins it opened with (2.5 cm) leave room, and the fields
    // describe the margins from then on
    await click(option("margins", "Custom…"));
    expect(errorTexts()).toEqual([]);
    expect(row("margins").hasAttribute("aria-describedby")).toBe(false);
    await type("margins-left", "7");
    expect(input("margins-top").getAttribute("aria-invalid")).toBe("true");
    expect(row("margins").hasAttribute("aria-invalid")).toBe(false);
  });

  it("leaves Shift+↑↓ to a field, to select in it", async () => {
    await openDialog();
    await click(option("margins", "Custom…"));
    input("margins-top").focus();

    const shifted = await keydown("ArrowDown", { shiftKey: true });

    expect(shifted.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(input("margins-top"));
  });

  it("says when the paper is too small for the text", async () => {
    await openDialog();
    await choosePaper("custom");

    await type("paper-width", "20");

    expect(errorTexts()).toEqual(["The paper is too small for the text."]);
  });

  it("measures custom paper in millimetres and margins in the region's unit", async () => {
    await openDialog();
    await choosePaper("custom");

    const unit = (id: string) =>
      document.getElementById(`page-setup-${id}-unit`)?.textContent;
    expect(unit("paper-width")).toBe("mm");
    expect(unit("margins-top")).toBe("cm");
    expect(
      input("paper-width").getAttribute("aria-describedby")?.split(" "),
    ).toContain("page-setup-paper-width-unit");
  });

  it("turns a custom size wider than high landscape, and back", async () => {
    const request = await openDialog();
    await choosePaper("custom");

    await type("paper-width", "300");
    expect(checked("orientation").textContent?.trim()).toBe("Landscape");
    // the stop of the row follows what it shows
    expect(checked("orientation").tabIndex).toBe(0);
    // kept as its portrait size, turned
    expect(caption()).toBe("297 × 300 mm landscape");

    // turning it swaps the size
    await click(option("orientation", "Portrait"));
    expect(input("paper-width").value).toBe("297");
    expect(input("paper-height").value).toBe("300");

    await submit();
    expect(request.apply).toHaveBeenCalledWith(
      expect.objectContaining({
        size: { width: mm(297), height: mm(300) },
        orientation: "portrait",
      }),
      opened(request),
    );
  });

  it("shows lengths in the unit of the region", async () => {
    await openDialog({
      settings: { ...DEFAULT_PAGE, margins: { ...allMargins(72), top: 36 } },
      locale: "en-US",
      unit: "in",
    });

    expect(paperText()).toBe("Letter (your region)");
    expect(checked("margins").textContent?.trim()).toBe("Custom…");
    expect(input("margins-top").value).toBe("0.5");
    expect(
      document
        .querySelector('label[for="page-setup-margins-top"]')
        ?.textContent?.trim(),
    ).toBe("Top");
    expect(
      document.getElementById("page-setup-margins-top-unit")?.textContent,
    ).toBe("in");
  });

  describe("new page before", () => {
    const toggles = () => [
      ...row("newPageBefore").querySelectorAll<HTMLButtonElement>("button"),
    ];
    const pressed = () =>
      toggles()
        .filter((button) => button.getAttribute("aria-pressed") === "true")
        .map((button) => button.textContent?.trim());

    it("offers every heading level, short, none pressed by default", async () => {
      await openDialog();

      expect(row("newPageBefore").getAttribute("role")).toBe("group");
      expect(toggles().map((button) => button.textContent?.trim())).toEqual([
        "H1",
        "H2",
        "H3",
        "H4",
        "H5",
        "H6",
      ]);
      // named by what they show, as voice control finds them
      expect(toggles()[0].hasAttribute("aria-label")).toBe(false);
      expect(toggles()[0].dataset.tip).toBe("Heading 1");
      expect(pressed()).toEqual([]);
    });

    it("starts the headings that are pressed on a new page", async () => {
      const request = await openDialog({
        settings: { ...DEFAULT_PAGE, newPageBefore: [2] },
      });
      expect(pressed()).toEqual(["H2"]);

      await click(option("newPageBefore", "H1"));
      await click(option("newPageBefore", "H2"));
      await click(option("newPageBefore", "H3"));
      await click(button("Apply"));

      expect(request.apply).toHaveBeenCalledWith(
        { ...DEFAULT_PAGE, newPageBefore: [1, 3] },
        opened(request),
      );
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

    await choosePaper("a5");
    await click(button("Make this my default"));

    expect(request.makeDefault).toHaveBeenCalledWith(
      { ...DEFAULT_PAGE, size: "a5" },
      opened(request),
    );
    expect(dialog()).toBeNull();
  });

  it("makes the default from an edited text, which it hands on", async () => {
    const request = await openDialog({ frontmatter: "title: Hi" });
    await click(button("Edit as text"));
    await typeText("title: Bye");
    await click(button("Edit as options"));

    await click(button("Make this my default"));

    expect(request.makeDefault).toHaveBeenCalledWith(DEFAULT_PAGE, {
      frontmatter: "title: Bye",
      settings: DEFAULT_PAGE,
    });
  });

  describe("on frontmatter it can't read", () => {
    const unreadable = () =>
      openDialog({
        frontmatter: "title: [oops",
        readText: vi.fn((text: string) =>
          text.includes("[oops")
            ? { error: "Flow sequence isn't closed" }
            : { settings: DEFAULT_PAGE, warnings: [] },
        ),
      });

    it("offers only to fix it as text", async () => {
      const request = await unreadable();

      expect(errorTexts()).toEqual([
        "The properties at the top of the file can't be read. Fix them with Edit as text.",
      ]);
      expect(button("Apply").disabled).toBe(true);
      expect(button("Make this my default").disabled).toBe(true);
      expect(button("Edit as text").disabled).toBe(false);
      expect(button("Edit as text").getAttribute("aria-describedby")).toBe(
        "page-setup-error-properties",
      );
      await submit();
      expect(request.apply).not.toHaveBeenCalled();
      expect(dialog()).not.toBeNull();
    });

    it("applies again once the text is fixed", async () => {
      const request = await unreadable();
      await click(button("Edit as text"));
      await typeText("title: fixed");
      await click(button("Edit as options"));

      expect(errorTexts()).toEqual([]);
      await submit();
      expect(request.apply).toHaveBeenCalledWith(DEFAULT_PAGE, {
        frontmatter: "title: fixed",
        settings: DEFAULT_PAGE,
      });
    });
  });

  it("shows what of the document's page setup can't be used, as sentences", async () => {
    await openDialog({
      warnings: [
        "Blank used the default page setup where x",
        "The top margin is small for the header",
      ],
    });

    const warning = dialog()!.querySelector<HTMLElement>(".warning")!;
    expect(warning.hidden).toBe(false);
    expect(
      [...warning.querySelectorAll("p")].map((p) => p.textContent?.trim()),
    ).toEqual([
      "Blank used the default page setup where x.",
      "The top margin is small for the header.",
    ]);
    // read out with the title
    expect(form().getAttribute("aria-describedby")).toBe(warning.id);
  });

  it("hides the warning line without warnings", async () => {
    await openDialog();

    expect(dialog()!.querySelector<HTMLElement>(".warning")!.hidden).toBe(true);
    expect(form().hasAttribute("aria-describedby")).toBe(false);
  });

  it("shows each error on a line of its own", async () => {
    await openDialog();

    await choosePaper("custom");
    await type("paper-width", "wide");
    await click(option("margins", "Custom…"));
    await type("margins-top", "much");

    expect(errorTexts()).toEqual([
      "Enter the width and height, e.g. 170 and 240.",
      "Enter each margin as a length, e.g. 2.5.",
    ]);
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

  it("puts Edit as text on the left, and Apply last", async () => {
    await openDialog();

    const foot = dialog()!.querySelector(".dialog-foot")!;
    expect(foot.querySelector(".secondary button")?.textContent?.trim()).toBe(
      "Edit as text",
    );
    expect(
      [...foot.querySelectorAll("button")].map((b) => b.textContent?.trim()),
    ).toEqual(["Edit as text", "Make this my default", "Cancel", "Apply"]);
  });

  describe("as text", () => {
    it("shows the choices written into the frontmatter", async () => {
      const request = await openDialog({ frontmatter: "title: Hi" });
      await click(option("orientation", "Landscape"));

      await click(button("Edit as text"));

      expect(request.textOf).toHaveBeenCalledWith(
        { ...DEFAULT_PAGE, orientation: "landscape" },
        opened(request),
      );
      expect(textarea().value).toBe("page:\n  size: a5");
      expect(document.activeElement).toBe(textarea());
      expect(button("Make this my default").hidden).toBe(true);
      expect(dialog()!.querySelector<HTMLElement>(".settings")!.hidden).toBe(
        true,
      );
      expect(dialog()!.querySelector<HTMLElement>(".thumbnail")!.hidden).toBe(
        true,
      );
    });

    it("applies the text it reads, closing the dialog", async () => {
      const request = await openDialog({ frontmatter: "title: Hi" });
      await click(button("Edit as text"));

      await typeText("title: Bye");
      await submit();

      expect(request.readText).toHaveBeenCalledWith("title: Bye");
      expect(request.applyText).toHaveBeenCalledWith("title: Bye");
      expect(request.apply).not.toHaveBeenCalled();
      expect(pageSetup.value).toBeNull();
      expect(dialog()).toBeNull();
    });

    it("stays open to fix what can't be read, linked to the text", async () => {
      const request = await openDialog({
        readText: vi.fn(() => ({ error: "Nested mappings are not allowed" })),
      });

      await click(button("Edit as text"));
      await submit();

      expect(dialog()).not.toBeNull();
      expect(request.applyText).not.toHaveBeenCalled();
      expect(errorTexts()).toEqual(["Nested mappings are not allowed"]);
      expect(textarea().getAttribute("aria-invalid")).toBe("true");
      expect(textarea().getAttribute("aria-describedby")).toBe(
        "page-setup-error-text",
      );

      await typeText("title: Hi");
      expect(errorTexts()).toEqual([]);
      expect(textarea().hasAttribute("aria-invalid")).toBe(false);
    });

    it("goes back to the rows with what the text says", async () => {
      const header = { left: "{title}", center: "", right: "" };
      const read: PageSettings = {
        ...DEFAULT_PAGE,
        size: "a5",
        orientation: "landscape",
        header,
      };
      const request = await openDialog({
        readText: vi.fn(() => ({ settings: read, warnings: ["Odd"] })),
      });
      await click(button("Edit as text"));
      await typeText("page:\n  size: a5");

      await click(button("Edit as options"));
      await nextTick();

      expect(textarea().closest<HTMLElement>(".text-editor")!.hidden).toBe(
        true,
      );
      expect(paperText()).toBe("A5");
      expect(checked("orientation").textContent?.trim()).toBe("Landscape");
      expect(checked("orientation").tabIndex).toBe(0);
      expect(caption()).toBe("A5 landscape");
      expect(dialog()!.querySelector(".warning")?.textContent?.trim()).toBe(
        "Odd.",
      );
      expect(document.activeElement).toBe(paper());

      // what is applied now goes onto the text, with its header
      await click(option("margins", "Wide"));
      await submit();
      expect(request.apply).toHaveBeenCalledWith(
        { ...read, margins: allMargins(cm(3.5)) },
        { frontmatter: "page:\n  size: a5", settings: read },
      );
    });

    it("stays in the text when it can't be read", async () => {
      await openDialog({
        readText: vi.fn(() => ({ error: "Nested mappings are not allowed" })),
      });
      await click(button("Edit as text"));

      await click(button("Edit as options"));

      expect(dialog()!.querySelector<HTMLElement>(".settings")!.hidden).toBe(
        true,
      );
      expect(errorTexts()).toEqual(["Nested mappings are not allowed"]);
    });

    it("can't be edited as text while the rows hold something wrong", async () => {
      await openDialog();
      await choosePaper("custom");
      await type("paper-width", "wide");

      expect(button("Edit as text").disabled).toBe(true);
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
    expect(request.apply).toHaveBeenCalledWith(DEFAULT_PAGE, opened(request));
  });

  it("keeps showing the last page it could draw while the choices are wrong", async () => {
    await openDialog();
    await choosePaper("custom");
    const drawn = dialog()!.querySelector(".thumbnail")!.innerHTML;

    await type("paper-width", "wide");

    expect(dialog()!.querySelector(".thumbnail")!.innerHTML).toBe(drawn);
    expect(dialog()!.querySelector(".thumbnail svg")).not.toBeNull();
  });

  it("applies settings that Vue doesn't proxy, with the headers kept", async () => {
    const header = { left: "{title}", center: "", right: "" };
    const settings: PageSettings = { ...DEFAULT_PAGE, header };
    const request = await openDialog({ settings });

    await click(option("newPageBefore", "H1"));
    await click(option("margins", "Custom…"));
    await submit();

    const [applied, base] = vi.mocked(request.apply).mock.calls[0];
    expect(applied).toEqual({ ...settings, newPageBefore: [1] });
    const proxied = (value: unknown): boolean =>
      isProxy(value) ||
      (typeof value === "object" &&
        value !== null &&
        Object.values(value).some(proxied));
    expect(proxied(applied)).toBe(false);
    expect(proxied(base)).toBe(false);
    expect(applied.header).toBe(header);
  });

  it("shows a new dialog for a new request", async () => {
    await openDialog();
    await click(option("margins", "Wide"));

    await openDialog();

    expect(document.querySelectorAll("#page-setup")).toHaveLength(1);
    expect(checked("margins").textContent?.trim()).toBe("Normal");
  });

  it("names each row by its label and marks its options", async () => {
    await openDialog();

    const margins = row("margins");
    const label = document.getElementById(
      margins.getAttribute("aria-labelledby")!,
    );
    expect(label?.textContent?.trim()).toBe("Margins");
    expect(margins.contains(label)).toBe(true);
    expect(margins.getAttribute("role")).toBe("radiogroup");
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

  it("blocks applying and making wrong choices the default", async () => {
    await openDialog();

    await choosePaper("custom");
    await type("paper-width", "wide");

    expect(button("Make this my default").disabled).toBe(true);
    expect(button("Apply").disabled).toBe(true);
  });
});

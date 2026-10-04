import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type BandSettings,
  bandSettings,
  DEFAULT_PAGE,
  NO_BANDS,
  NO_SLOTS,
  type Slots,
} from "../layout/settings";
import {
  bandEditor,
  type BandEditorRequest,
  contextMenu,
  engineMissing,
  type MenuItem,
  transaction,
} from "../state";
import type { EditorHandle } from "../editor/handle";
import {
  createState,
  createTestHandle,
  docWithFrontmatter,
  h,
} from "../test/editor";
import { formatShortcut } from "../editor/keyBindings";
import { TOP_BAR_HEIGHT } from "../chrome";
import { NEAR_BOTTOM, NEAR_TOP } from "./bandStripsModel";
import { flushPromises } from "../test/async";
import { bootApp } from "./mount";

const fields = { title: "Report", author: "Ada", date: "1 May", file: "" };

// lets Vue render, and a strip focus its slot after showing other pages
const settle = () => flushPromises();

const publish = async (frontmatter: string) => {
  transaction.value = createState(
    docWithFrontmatter(frontmatter, h(1, "Report")),
  ).tr;
  await settle();
};

const click = async (element: HTMLElement) => {
  element.click();
  await settle();
};

const edge = (band: string) =>
  document.querySelector<HTMLElement>(`#band-${band}`)!;
const strip = () => document.querySelector<HTMLElement>("#band-editor");
const button = (label: string) =>
  [...(strip()?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent?.trim() === label,
  )!;
const slot = (name: string) =>
  strip()!.querySelector<HTMLElement>(`.slot.${name} .ProseMirror`)!;

const open = async ({
  band = "header",
  bands = {},
  insert,
}: {
  band?: BandEditorRequest["band"];
  bands?: Partial<BandSettings>;
  insert?: string;
} = {}) => {
  const request: BandEditorRequest = {
    band,
    bands: { ...bandSettings(DEFAULT_PAGE), ...bands },
    fields,
    insert,
    apply: vi.fn(),
  };
  bandEditor.value = request;
  await settle();
  return request;
};

// what the strip kept when it closed
const applied = (request: BandEditorRequest) =>
  vi.mocked(request.apply).mock.calls[0][0];

// runs the item of the open menu that reads `label`
// runs an item of the open menu as ContextMenu.vue does: it closes first
const choose = async (label: string) => {
  const menu = contextMenu.value!;
  const item = menu.items.find(
    (item): item is Exclude<MenuItem, "separator"> =>
      item !== "separator" && item.label === label,
  )!;
  menu.close();
  if (item.edit) item.edit.submit(item.edit.value);
  else item.run?.();
  await settle();
  return item;
};

// the hints of an edge, by what they read
const hints = (band: string) =>
  [...edge(band).querySelectorAll("button")].map((hint) =>
    hint.textContent?.trim(),
  );

const tabs = () =>
  [...strip()!.querySelectorAll<HTMLElement>("[role=tab]")].filter(
    (tab) => !tab.closest("[hidden]"),
  );

describe("band strips", () => {
  let dispose = () => {};
  let editor: EditorHandle;

  beforeEach(() => {
    // jsdom has no layout, which ProseMirror asks when a slot is focused
    document.elementFromPoint = () => null;
    document.body.innerHTML = "";
    bandEditor.value = null;
    contextMenu.value = null;
    transaction.value = null;
    editor = createTestHandle();
    dispose = bootApp(editor);
  });

  afterEach(() => {
    dispose();
    bandEditor.value = null;
    contextMenu.value = null;
  });

  describe("at rest", () => {
    it("offers to add a header and a footer with page numbers", async () => {
      expect(edge("header").classList).toContain("empty");
      expect(hints("header")).toEqual(["+ Header"]);
      expect(hints("footer")).toEqual(["+ Footer", "# Page numbers"]);
      expect(document.body.classList).not.toContain("has-header");
    });

    it("shows the header as it reads, and makes room for it", async () => {
      await publish(
        'page:\n  header: { left: "{title}", right: "Page {page}" }',
      );

      const line = edge("header").querySelector(".band-line")!;
      expect([...line.children].map((part) => part.textContent)).toEqual([
        "Report",
        "",
        "Page page",
      ]);
      expect(edge("header").classList).not.toContain("empty");
      expect(document.body.classList).toContain("has-header");
      expect(document.body.classList).not.toContain("has-footer");
      // the pages show it, on the sheets or where each page ends; the edge
      // only offers to add a footer
      expect(edge("header").hidden).toBe(true);
      expect(edge("footer").hidden).toBe(false);
    });

    it("shows the header at the edge when there are no pages to show it", async () => {
      // without the layout engine from the start, the editor shows the text
      // itself
      engineMissing.value = true;
      try {
        await publish('page:\n  header: { left: "{title}" }');
        expect(edge("header").hidden).toBe(false);
        expect(edge("header").querySelector(".band-line")!.textContent).toBe(
          "Report",
        );
        // it hides while its strip is open
        await open();
        expect(edge("header").hidden).toBe(true);
      } finally {
        engineMissing.value = false;
      }
    });

    it("shows the header at the edge once the engine fails", async () => {
      await publish('page:\n  header: { left: "{title}" }');
      expect(edge("header").hidden).toBe(true);
      try {
        engineMissing.value = true;
        await settle();
        expect(edge("header").hidden).toBe(false);
      } finally {
        engineMissing.value = false;
      }
      await settle();
      expect(edge("header").hidden).toBe(true);
    });

    it("shows a band only the first or even pages have", async () => {
      await publish('page:\n  first-page:\n    header: { left: "ACME" }');

      expect(edge("header").classList).not.toContain("empty");
      expect(edge("header").textContent).toBe("ACME");
      expect(document.body.classList).toContain("has-header");
    });

    it("opens the strip of a band when its line or hint is clicked", async () => {
      await publish('page:\n  footer: { center: "{page}" }');

      await click(edge("footer").querySelector<HTMLElement>(".band-line")!);
      expect(bandEditor.value).toMatchObject({ band: "footer" });
      expect(strip()?.classList).toContain("footer");
      await click(button("Done"));

      await click([...edge("header").querySelectorAll("button")][0]);
      expect(bandEditor.value).toMatchObject({ band: "header" });
    });

    it("shows the hints while the mouse is near an edge", async () => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientY: TOP_BAR_HEIGHT + 10 }),
      );
      await settle();
      expect(document.body.classList).toContain("near-top");

      window.dispatchEvent(
        new MouseEvent("mousemove", { clientY: window.innerHeight - 10 }),
      );
      await settle();
      expect(document.body.classList).toContain("near-bottom");
      expect(document.body.classList).not.toContain("near-top");

      // out of the window: onto nothing of the page
      window.dispatchEvent(new MouseEvent("mouseout", { relatedTarget: null }));
      await settle();
      expect(document.body.classList).not.toContain("near-bottom");

      // within the page, the hint stays
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientY: window.innerHeight - 10 }),
      );
      await settle();
      window.dispatchEvent(
        new MouseEvent("mouseout", { relatedTarget: document.body }),
      );
      await settle();
      expect(document.body.classList).toContain("near-bottom");

      // but not on the status bar's controls
      document.getElementById("ui-stats")!.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientY: window.innerHeight - 10,
        }),
      );
      await settle();
      expect(document.body.classList).not.toContain("near-bottom");
    });

    it("only renders again when what it shows changes", async () => {
      await publish('page:\n  header: { left: "x" }');
      const line = edge("header").querySelector(".band-line");

      await publish('page:\n  header: { left: "x" }');

      expect(edge("header").querySelector(".band-line")).toBe(line);
    });
  });

  describe("editing", () => {
    it("opens the strip with the band's slots, and fades the text", async () => {
      await open({
        bands: { header: { left: "{title}", center: "", right: "draft" } },
      });

      expect(strip()?.classList).toContain("header");
      expect(slot("left").textContent).toBe("Report");
      expect(slot("right").textContent).toBe("draft");
      expect(strip()!.querySelector(".band-label")!.textContent).toBe(
        "Header · every page",
      );
      expect(tabs()).toEqual([]);
      expect(document.body.classList).toContain("band-editing");
      expect(document.body.classList).toContain("editing-header");
      expect(edge("header").hidden).toBe(true);
      expect(document.activeElement).toBe(slot("center"));
    });

    it("opens on the pages whose band the edge shows", async () => {
      await open({
        bands: {
          firstPage: { ...NO_BANDS, header: { ...NO_SLOTS, left: "ACME" } },
        },
      });

      expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
      expect(slot("left").textContent).toBe("ACME");
    });

    it("says when the first page has none", async () => {
      await open({ bands: { firstPage: "plain" } });

      expect(strip()!.querySelector(".band-label")!.textContent).toBe(
        "Header · every page but the first",
      );
    });

    it("keeps what was edited with Done", async () => {
      const request = await open({ band: "footer" });

      await click(button("Title"));
      await click(button("Done"));

      expect(applied(request)).toEqual({
        ...bandSettings(DEFAULT_PAGE),
        footer: { ...NO_SLOTS, center: "{title}" } satisfies Slots,
      });
      expect(strip()).toBeNull();
      expect(bandEditor.value).toBeNull();
      expect(document.body.classList).not.toContain("band-editing");
    });

    it("inserts into the slot last in use", async () => {
      const request = await open();

      slot("left").focus();
      slot("left").dispatchEvent(new FocusEvent("focus"));
      await settle();
      await click(button("Chapter"));
      await click(button("Done"));

      expect(applied(request).header).toEqual({
        ...NO_SLOTS,
        left: "{chapter}",
      });
    });

    it.each([
      ["Author", "{author}"],
      ["Date", "{date}"],
      ["File", "{file}"],
    ])("inserts the %s", async (label, placeholder) => {
      const request = await open();

      await click(button(label));
      await click(button("Done"));

      expect(applied(request).header.center).toBe(placeholder);
    });

    it("offers the page numbers as they read, and inserts the chosen one", async () => {
      const request = await open({ band: "footer" });

      await click(button("# Page number ▾"));
      expect(
        contextMenu.value!.items.map((item) =>
          item === "separator" ? "-" : item.label,
        ),
      ).toEqual([
        "3",
        "Page 3",
        "3 of 12",
        "Page 3 of 12",
        "-",
        "1, 2, 3",
        "i, ii, iii",
        "I, II, III",
        "-",
        "Start At 1…",
      ]);
      await choose("Page 3 of 12");
      expect(contextMenu.value).toBeNull();
      await click(button("Done"));

      expect(applied(request).footer).toEqual({
        ...NO_SLOTS,
        center: "Page {page} of {pages}",
      });
    });

    it("sets the numbering and the first number in the page number menu", async () => {
      const request = await open({ band: "footer" });

      await click(button("# Page number ▾"));
      expect((await choose("1, 2, 3")).checked).toBe(true);
      await click(button("# Page number ▾"));
      await choose("i, ii, iii");
      await click(button("# Page number ▾"));
      expect(contextMenu.value!.items[0]).toMatchObject({ label: "iii" });
      const start = await choose("Start At 1…");
      start.edit!.submit(" 5 ");
      await click(button("# Page number ▾"));
      (await choose("Start At 5…")).edit!.submit("-1");
      await click(button("Done"));

      expect(applied(request)).toMatchObject({
        numberStyle: "i",
        startNumber: 5,
      });
    });

    it("closes a menu on a second click on its button", async () => {
      await open();
      const first = button("First Page ▾");

      await click(first);
      expect(contextMenu.value?.owner).toBe(first);
      expect(first.getAttribute("aria-expanded")).toBe("true");
      await click(first);
      expect(contextMenu.value).toBeNull();
      expect(first.getAttribute("aria-expanded")).toBe("false");
    });

    describe("the first page", () => {
      it("leaves it without a header and footer", async () => {
        const request = await open();

        await click(button("First Page ▾"));
        expect((await choose("Like the Other Pages")).checked).toBe(true);
        await click(button("First Page ▾"));
        await choose("None");
        await click(button("Done"));

        expect(applied(request).firstPage).toBe("plain");
      });

      it("gives it its own, on a tab of its own", async () => {
        const request = await open({
          bands: { header: { ...NO_SLOTS, right: "{page}" } },
        });

        await click(button("First Page ▾"));
        await choose("Its Own");
        expect(tabs().map((tab) => tab.textContent?.trim())).toEqual([
          "First Page",
          "Other Pages",
        ]);
        expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
        expect(strip()!.querySelector(".band-label")!.textContent).toBe(
          "Header",
        );
        await click(button("Title"));
        // the other pages keep theirs
        await click(tabs()[1]);
        expect(slot("right").textContent).toBe("page");
        await click(button("Done"));

        expect(applied(request)).toMatchObject({
          header: { ...NO_SLOTS, right: "{page}" },
          firstPage: {
            header: { ...NO_SLOTS, center: "{title}" },
            footer: NO_SLOTS,
          },
        });
      });

      it("keeps the other band of its own, and is plain without text", async () => {
        const letterhead = {
          ...NO_BANDS,
          footer: { ...NO_SLOTS, left: "ACME" },
        };
        const kept = await open({ bands: { firstPage: letterhead } });
        await click(button("Done"));
        expect(applied(kept).firstPage).toEqual(letterhead);

        const empty = await open({ bands: { firstPage: "same" } });
        await click(button("First Page ▾"));
        await choose("Its Own");
        await click(button("Done"));
        expect(applied(empty).firstPage).toBe("plain");
      });

      it("goes back to the other pages when it has none of its own", async () => {
        await open({
          bands: {
            firstPage: { ...NO_BANDS, header: { ...NO_SLOTS, left: "x" } },
          },
        });
        await click(tabs()[0]);

        await click(button("First Page ▾"));
        await choose("None");

        expect(tabs()).toEqual([]);
        expect(slot("left").textContent).toBe("");
      });
    });

    describe("even pages", () => {
      it("start as the odd pages mirrored, on a tab of their own", async () => {
        const request = await open({
          bands: { header: { ...NO_SLOTS, left: "{title}", right: "{page}" } },
        });

        await click(button("Odd & Even Pages"));

        expect(button("Odd & Even Pages").getAttribute("aria-pressed")).toBe(
          "true",
        );
        expect(tabs().map((tab) => tab.textContent?.trim())).toEqual([
          "Odd Pages",
          "Even Pages",
        ]);
        expect(slot("left").textContent).toBe("page");
        expect(slot("right").textContent).toBe("Report");
        await click(button("Done"));

        expect(applied(request).evenPages).toEqual({
          header: { ...NO_SLOTS, left: "{page}", right: "{title}" },
          footer: NO_SLOTS,
        });
      });

      it("mirror the odd pages again on request", async () => {
        const even = { ...NO_BANDS, header: { ...NO_SLOTS, center: "x" } };
        const request = await open({
          bands: {
            header: { ...NO_SLOTS, left: "a" },
            evenPages: even,
          },
        });
        expect(button("Mirror Odd Pages").hidden).toBe(true);

        await click(tabs()[1]);
        expect(button("Mirror Odd Pages").hidden).toBe(false);
        await click(button("Mirror Odd Pages"));
        await click(button("Done"));

        expect(applied(request).evenPages!.header).toEqual({
          ...NO_SLOTS,
          right: "a",
        });
      });

      it("are the same as the others once turned off", async () => {
        const request = await open({ bands: { evenPages: NO_BANDS } });
        await click(tabs()[1]);

        await click(button("Odd & Even Pages"));

        expect(tabs()).toEqual([]);
        await click(button("Done"));
        expect(applied(request).evenPages).toBeNull();
      });

      it("share the tabs with a first page of its own", async () => {
        await open({ bands: { firstPage: NO_BANDS, evenPages: NO_BANDS } });

        await click(button("First Page ▾"));
        await choose("Its Own");

        expect(tabs().map((tab) => tab.textContent?.trim())).toEqual([
          "First Page",
          "Odd Pages",
          "Even Pages",
        ]);
      });
    });

    it("stops listening for clicks outside once it is closed", async () => {
      const add = vi.spyOn(window, "addEventListener");
      const remove = vi.spyOn(window, "removeEventListener");
      const pointerdown = (spy: typeof add) =>
        spy.mock.calls.filter(([type]) => type === "pointerdown");

      await open();
      await click(button("Done"));
      await open({ band: "footer" });
      await click(button("Done"));

      expect(pointerdown(add)).toHaveLength(2);
      expect(pointerdown(remove)).toEqual(pointerdown(add));
      add.mockRestore();
      remove.mockRestore();
    });

    it("keeps what was edited when the text is clicked", async () => {
      const request = await open({
        bands: { header: { ...NO_SLOTS, left: "x" } },
      });

      document.body.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
      await settle();

      expect(applied(request).header).toEqual({ ...NO_SLOTS, left: "x" });
      expect(strip()).toBeNull();
    });

    it("stays open for clicks on itself and its menu, submenus included", async () => {
      const request = await open();
      // the context menu's levels, as src/ui/ContextMenu.vue renders them
      const menus = document.createElement("div");
      menus.className = "context-menus";
      const menu = document.createElement("div");
      menu.id = "context-menu";
      const submenu = document.createElement("div");
      submenu.className = "context-menu submenu";
      menus.append(menu, submenu);
      document.body.append(menus);

      slot("left").dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true }),
      );
      await settle();
      menu.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await settle();
      submenu.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await settle();

      expect(request.apply).not.toHaveBeenCalled();
    });

    it("removes the band from every page", async () => {
      const request = await open({
        bands: {
          header: { left: "a", center: "b", right: "c" },
          firstPage: { header: { ...NO_SLOTS, left: "d" }, footer: NO_SLOTS },
          evenPages: { header: { ...NO_SLOTS, left: "e" }, footer: NO_SLOTS },
        },
      });

      await click(button("Remove"));

      expect(applied(request)).toMatchObject({
        header: NO_SLOTS,
        firstPage: "plain",
        evenPages: NO_BANDS,
      });
    });

    it("moves between the slots and buttons with Tab", async () => {
      await open();
      slot("right").focus();

      slot("right").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );
      await settle();

      expect(document.activeElement).toBe(button("# Page number ▾"));
    });

    it("goes around from the last button to the first, and back", async () => {
      await open();
      const key = (target: HTMLElement, shiftKey = false) =>
        target.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Tab", shiftKey, bubbles: true }),
        );
      button("Done").focus();

      key(button("Done"));
      expect(document.activeElement).toBe(button("First Page ▾"));

      key(button("First Page ▾"), true);
      expect(document.activeElement).toBe(button("Done"));
    });

    it("is done with Esc on a button too", async () => {
      const request = await open({
        bands: { header: { ...NO_SLOTS, left: "x" } },
      });
      button("Title").focus();

      button("Title").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      await settle();

      expect(strip()).toBeNull();
      expect(applied(request).header).toEqual({ ...NO_SLOTS, left: "x" });
    });

    it("numbers the pages from the footer hint, through the editor", async () => {
      await click([...edge("footer").querySelectorAll("button")][1]);
      expect(bandEditor.value).toMatchObject({
        band: "footer",
        insert: "{page}",
      });

      await click(button("Done"));

      expect(editor.view.state.doc.attrs.frontmatter).toBe(
        'page:\n  footer: {center: "{page}"}',
      );
    });
  });

  describe("names, titles and focus", () => {
    it("shows the placeholders of a footer without a header", async () => {
      await publish('page:\n  footer: { left: "{title}" }');
      expect(edge("footer").querySelector(".band-line")!.textContent).toBe(
        "Report",
      );
    });

    it("shows only the hint of the edge the mouse is near", async () => {
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientY: TOP_BAR_HEIGHT + 10 }),
      );
      await settle();
      expect(document.body.classList).toContain("near-top");
      expect(document.body.classList).not.toContain("near-bottom");

      window.dispatchEvent(new MouseEvent("mousemove", { clientY: NEAR_TOP }));
      await settle();
      expect(document.body.classList).not.toContain("near-top");

      // the status bar and the hint just above it
      window.dispatchEvent(
        new MouseEvent("mousemove", {
          clientY: window.innerHeight - NEAR_BOTTOM + 1,
        }),
      );
      await settle();
      expect(document.body.classList).toContain("near-bottom");

      // but not on the status bar's controls
      document.getElementById("ui-stats")!.dispatchEvent(
        new MouseEvent("mousemove", {
          bubbles: true,
          clientY: window.innerHeight - 10,
        }),
      );
      await settle();
      expect(document.body.classList).not.toContain("near-bottom");
    });

    it("titles the line at rest with its shortcut and keeps the focus", async () => {
      await publish('page:\n  header: { left: "a" }\n  footer: { left: "b" }');
      const header = edge("header").querySelector<HTMLElement>(".band-line")!;
      const footer = edge("footer").querySelector<HTMLElement>(".band-line")!;
      expect(header.getAttribute("role")).toBe("button");
      // its tooltip (src/ui/tooltipModel.ts)
      expect(header.dataset.tip).toBe("Edit the header");
      expect(header.dataset.tipKey).toBe(formatShortcut("Mod-Alt-h"));
      expect(footer.dataset.tip).toBe("Edit the footer");
      expect(footer.dataset.tipKey).toBe(formatShortcut("Mod-Alt-f"));

      const press = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      });
      header.dispatchEvent(press);
      expect(press.defaultPrevented).toBe(true);
    });

    it("leaves the hints out of the tab order", () => {
      const hints = [
        ...document.querySelectorAll<HTMLElement>(".band-hint button"),
      ];
      expect(hints).toHaveLength(3);
      expect(hints.every((hint) => hint.tabIndex === -1)).toBe(true);
    });

    it("leaves the editor unfocused when the line opens the strip", async () => {
      await publish('page:\n  header: { left: "a" }');
      const focus = vi.spyOn(editor.view, "focus");
      await click(edge("header").querySelector<HTMLElement>(".band-line")!);
      expect(bandEditor.value).toMatchObject({ band: "header" });
      expect(focus).not.toHaveBeenCalled();
    });

    it("shows the page number at rest as a named chip", async () => {
      engineMissing.value = true;
      try {
        await publish('page:\n  header: { right: "Page {page}" }');
        const chip =
          edge("header").querySelector<HTMLElement>(".band-line .chip")!;
        expect(chip.dataset.field).toBe("page");
        expect(chip.title).toBe("Page number");
        expect(chip.textContent).toBe("page");
      } finally {
        engineMissing.value = false;
      }
    });

    it("opens a new strip for another request while one is open", async () => {
      await open();
      await open({ band: "footer" });
      expect(strip()!.classList).toContain("footer");
      expect(strip()!.classList).not.toContain("header");
    });

    it("names the strip, its slots and its Remove button", async () => {
      await open({ band: "footer" });
      expect(strip()!.getAttribute("aria-label")).toBe("Footer");
      expect(button("Remove").title).toBe("Remove the footer");
      expect(
        [...strip()!.querySelectorAll<HTMLElement>(".slot")].map(
          (place) => place.dataset.placeholder,
        ),
      ).toEqual(["Left", "Center", "Right"]);
    });

    it("destroys the slot editors it replaces", async () => {
      await open();
      const place = slot("center").parentElement!;
      await click(button("Odd & Even Pages"));
      expect(place.isConnected).toBe(false);
      expect(place.querySelector(".ProseMirror")).toBeNull();
    });

    it("keeps what was typed only once", async () => {
      const opened = await open();
      slot("center").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
      await settle();
      expect(opened.apply).toHaveBeenCalledTimes(1);
    });

    it("opens the menus for the keyboard when their button has the focus", async () => {
      await open({ band: "footer" });
      await click(button("# Page number ▾"));
      expect(contextMenu.value!.keyboard).toBe(false);
      contextMenu.value = null;

      button("First Page ▾").focus();
      await click(button("First Page ▾"));
      expect(contextMenu.value!.keyboard).toBe(true);
    });

    it("gives the slot the focus back when its menu closes", async () => {
      await open({ band: "footer" });
      await click(button("# Page number ▾"));
      const { close } = contextMenu.value!;
      button("Done").focus();

      close();
      expect(contextMenu.value).toBeNull();
      expect(document.activeElement).toBe(slot("center"));

      await click(button("# Page number ▾"));
      const other = { ...contextMenu.value!, close: () => {} };
      contextMenu.value = other;
      close();
      expect(contextMenu.value).toBe(other);
    });
  });
});

describe("band strips in the app", () => {
  it("go with the app: the strips, their editor and the body's classes", async () => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = "";
    transaction.value = null;
    const dispose = bootApp(createTestHandle());
    await publish('page:\n  header: { left: "x" }');
    const request = await open();
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientY: TOP_BAR_HEIGHT + 10 }),
    );
    await settle();
    expect(document.body.classList).toContain("near-top");

    dispose();

    expect(document.querySelector(".band-edge, #band-editor")).toBeNull();
    expect([...document.body.classList]).toEqual([]);
    // the strip is closed, so the editor takes the focus again
    expect(bandEditor.value).toBeNull();
    // nor does the closed strip listen for clicks outside of it
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(request.apply).not.toHaveBeenCalled();
    // the strips no longer follow the document
    await publish('page:\n  footer: { left: "y" }');
    expect(document.querySelector(".band-edge")).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { watch } from "vue";

import {
  type BandSettings,
  bandSettings,
  DEFAULT_PAGE,
  NO_BANDS,
  NO_SLOTS,
  type Slots,
} from "../layout/settings";
import {
  announcement,
  bandEditor,
  type BandEditorRequest,
  contextMenu,
  type MenuItem,
  pageScrollRequest,
} from "../state";
import { controlsStay } from "../state/focusMode";
import { createTestHandle } from "../test/editor";
import { flushPromises } from "../test/async";
import { bandInWindow, centerRequest } from "./bandStripsModel";
import { bootApp } from "./mount";

// where the band is in the window, which follows the scrolling as
// pageViewport does; none without pages
const placed = await vi.hoisted(async () => {
  const { shallowRef } = await import("vue");
  return shallowRef<{
    sheet: { left: number; top: number; width: number; height: number };
    band: {
      left: number;
      top: number;
      width: number;
      height: number;
      size: number;
    };
    view: { left: number; top: number; width: number; height: number };
  } | null>(null);
});
vi.mock("./bandStripsModel", async (original) => ({
  ...(await original<typeof import("./bandStripsModel")>()),
  bandInWindow: vi.fn(() => placed.value),
  centerRequest: vi.fn(() => ({
    page: 1,
    x: 0,
    y: 700,
    width: 0,
    height: 0,
    at: 300,
  })),
}));

// a footer on a sheet in a view from 80 to 800 px, 1000 px wide
const view = { left: 0, top: 80, width: 1000, height: 720 };
const shownAt = (top: number) => ({
  sheet: { left: 100, top: top - 1000, width: 800, height: 1100 },
  band: { left: 180, top, width: 640, height: 15, size: 11.7 },
  view,
});

// lets Vue render, and a strip focus its slot after showing other pages
const settle = () => flushPromises();

const click = async (element: HTMLElement) => {
  element.click();
  await settle();
};

const strip = () => document.querySelector<HTMLElement>("#band-editor");
const card = () => strip()!.querySelector<HTMLElement>(".band-card")!;
const slots = () => strip()!.querySelector<HTMLElement>(".band-slots")!;
// a control of the strip by what it says, or by its name
const button = (label: string) =>
  [...(strip()?.querySelectorAll("button") ?? [])].find(
    (b) =>
      b.textContent?.trim() === label || b.getAttribute("aria-label") === label,
  )!;
const firstPage = () =>
  strip()!.querySelector<HTMLButtonElement>("button.select")!;
const evenPages = () =>
  strip()!.querySelector<HTMLButtonElement>("[role=switch]")!;
const slot = (name: string) =>
  strip()!.querySelector<HTMLElement>(`.slot.${name} .ProseMirror`)!;
const tabs = () => [
  ...strip()!.querySelectorAll<HTMLButtonElement>("[role=tab]"),
];
const key = (target: HTMLElement, name: string, shiftKey = false) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: name, shiftKey, bubbles: true }),
  );

const open = async ({
  band = "header",
  bands = {},
  page = null,
  center = false,
}: {
  band?: BandEditorRequest["band"];
  bands?: Partial<BandSettings>;
  page?: number | null;
  center?: boolean;
} = {}) => {
  const request: BandEditorRequest = {
    band,
    page,
    center,
    bands: { ...bandSettings(DEFAULT_PAGE), ...bands },
    apply: vi.fn(),
  };
  bandEditor.value = request;
  await settle();
  return request;
};

// what the strip kept when it closed
const applied = (request: BandEditorRequest) =>
  vi.mocked(request.apply).mock.calls[0][0];

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

describe("the header or footer being edited", () => {
  let dispose = () => {};

  beforeEach(() => {
    // jsdom has no layout, which ProseMirror asks when a slot is focused
    document.elementFromPoint = () => null;
    document.body.innerHTML = "";
    bandEditor.value = null;
    contextMenu.value = null;
    announcement.value = null;
    pageScrollRequest.value = null;
    placed.value = null;
    dispose = bootApp(createTestHandle());
  });

  afterEach(() => {
    dispose();
    bandEditor.value = null;
    contextMenu.value = null;
    pageScrollRequest.value = null;
  });

  describe("on the page", () => {
    it("puts the slots over the band, and the strip above a footer", async () => {
      placed.value = shownAt(700);
      await open({ band: "footer", page: 2 });

      expect(bandInWindow).toHaveBeenCalledWith(1, "footer");
      expect(strip()!.classList).not.toContain("at-edge");
      // over the view, which clips the slots and the strip
      expect(strip()!.style).toMatchObject({
        left: "0px",
        top: "80px",
        width: "1000px",
        height: "720px",
      });
      // the band grown to a control's height, 6 px wider on each side, from
      // the view's corner
      expect(slots().style).toMatchObject({
        left: "174px",
        top: "613.5px",
        width: "652px",
        minHeight: "28px",
        fontSize: "12px",
      });
      // as wide as the sheet, from its left edge; jsdom measures it 0 high
      expect(card().style).toMatchObject({
        left: "100px",
        top: "605.5px",
        width: "800px",
      });
    });

    it("puts the strip below a header", async () => {
      placed.value = shownAt(200);
      await open({ page: 1 });
      expect(card().style.top).toBe("149.5px");
    });

    it("follows the band when the view scrolls or the window changes", async () => {
      placed.value = shownAt(700);
      await open({ band: "footer", page: 2 });
      const shown = slots();
      placed.value = shownAt(600);
      await settle();
      expect(slots()).toBe(shown);
      expect(shown.style.top).toBe("513.5px");
    });

    it("scrolls the band into the middle only when it doesn't show with its strip", async () => {
      // the page view serves the request and clears it
      const requests: unknown[] = [];
      const stop = watch(
        pageScrollRequest,
        (request) => {
          if (request) requests.push(request);
        },
        { flush: "sync" },
      );
      placed.value = shownAt(700);
      await open({ band: "footer", page: 2, center: true });
      expect(requests).toEqual([]);
      await click(button("Done"));

      // below the view, but opened by a click: where it is
      placed.value = shownAt(900);
      await open({ band: "footer", page: 2 });
      expect(requests).toEqual([]);
      await click(button("Done"));

      // below the view, opened by the keys
      await open({ band: "footer", page: 2, center: true });
      expect(centerRequest).toHaveBeenCalledWith(1, "footer");
      expect(requests).toEqual([expect.objectContaining({ page: 1, at: 300 })]);
      stop();
    });

    it("sits at the window's edge without pages, with the slots in it", async () => {
      await open({ band: "footer" });
      expect(strip()!.classList).toContain("at-edge");
      expect(strip()!.classList).toContain("footer");
      expect(card().getAttribute("style")).toBeNull();
      expect(slots().getAttribute("style")).toBeNull();
    });
  });

  describe("editing", () => {
    it("shows the band's slots, says on which pages it is, and fades the text", async () => {
      await open({
        bands: { header: { left: "{title}", center: "", right: "draft" } },
      });

      expect(strip()!.classList).toContain("header");
      expect(slot("left").textContent).toBe("Title");
      expect(slot("right").textContent).toBe("draft");
      expect(card().querySelector(".band-card-title")!.textContent).toBe(
        "Header on every page",
      );
      expect(card().querySelector(".summary")!.textContent).toBe(
        "on every page",
      );
      expect(tabs()).toEqual([]);
      expect(document.body.classList).toContain("band-editing");
      expect(document.activeElement).toBe(slot("center"));
      expect(announcement.value?.text).toBe("Editing the header");
    });

    it("opens on the band of its page", async () => {
      await open({
        page: 1,
        bands: {
          firstPage: { ...NO_BANDS, header: { ...NO_SLOTS, left: "ACME" } },
        },
      });

      expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
      expect(slot("left").textContent).toBe("ACME");
    });

    it("says when the first page has none", async () => {
      await open({ bands: { firstPage: "plain" } });

      expect(card().querySelector(".summary")!.textContent).toBe(
        "not on the first page",
      );
      expect(firstPage().getAttribute("aria-label")).toBe("First page: None");
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
      ["Author", "{author}", "Insert the author"],
      ["Date", "{date}", "Insert the date"],
      ["File", "{file}", "Insert the file name"],
    ])("inserts the %s", async (label, placeholder, tip) => {
      const request = await open();

      expect(button(label).dataset.tip).toBe(tip);
      await click(button(label));
      await click(button("Done"));

      expect(applied(request).header.center).toBe(placeholder);
    });

    it("offers the page numbers as they read, and inserts the chosen one", async () => {
      const request = await open({ band: "footer" });

      await click(button("Page number"));
      expect(
        contextMenu.value!.items.map((item) =>
          item === "separator" ? "-" : item.label,
        ),
      ).toEqual([
        "1",
        "Page 1",
        "1 of 2",
        "Page 1 of 2",
        "-",
        "1, 2, 3",
        "i, ii, iii",
        "I, II, III",
        "-",
        "Start at 1…",
      ]);
      await choose("Page 1 of 2");
      expect(contextMenu.value).toBeNull();
      await click(button("Done"));

      expect(applied(request).footer).toEqual({
        ...NO_SLOTS,
        center: "Page {page} of {pages}",
      });
    });

    it("sets the numbering and the first number in the page number menu", async () => {
      const request = await open({ band: "footer" });

      await click(button("Page number"));
      expect((await choose("1, 2, 3")).checked).toBe(true);
      await click(button("Page number"));
      await choose("i, ii, iii");
      await click(button("Page number"));
      expect(contextMenu.value!.items[0]).toMatchObject({ label: "i" });
      const start = await choose("Start at 1…");
      start.edit!.submit(" 5 ");
      await click(button("Page number"));
      (await choose("Start at 5…")).edit!.submit("-1");
      await click(button("Done"));

      expect(applied(request)).toMatchObject({
        numberStyle: "i",
        startNumber: 5,
      });
    });

    it("closes a menu on a second click on its button", async () => {
      await open();

      await click(firstPage());
      expect(contextMenu.value?.owner).toBe(firstPage());
      expect(firstPage().getAttribute("aria-expanded")).toBe("true");
      await click(firstPage());
      expect(contextMenu.value).toBeNull();
      expect(firstPage().getAttribute("aria-expanded")).toBe("false");
    });

    describe("the first page", () => {
      it("leaves it without a header and footer", async () => {
        const request = await open();

        await click(firstPage());
        expect((await choose("The same as the others")).checked).toBe(true);
        await click(firstPage());
        await choose("None");
        await click(button("Done"));

        expect(applied(request).firstPage).toBe("plain");
      });

      it("gives it its own, on a tab of its own", async () => {
        const request = await open({
          bands: { header: { ...NO_SLOTS, right: "{page}" } },
        });

        await click(firstPage());
        await choose("Its own");
        expect(tabs().map((tab) => tab.textContent?.trim())).toEqual([
          "First page",
          "All pages",
        ]);
        expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
        expect(card().querySelector(".summary")!.textContent).toBe(
          "its own on the first page",
        );
        await click(button("Title"));
        // the other pages keep theirs
        await click(tabs()[1]);
        expect(slot("right").textContent).toBe("Page");
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
        await click(firstPage());
        await choose("Its own");
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

        await click(firstPage());
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
        expect(evenPages().getAttribute("aria-checked")).toBe("false");
        expect(evenPages().textContent?.trim()).toBe(
          "Odd and even pages differ",
        );

        await click(evenPages());

        expect(evenPages().getAttribute("aria-checked")).toBe("true");
        expect(tabs().map((tab) => tab.textContent?.trim())).toEqual([
          "Odd pages",
          "Even pages",
        ]);
        expect(card().querySelector(".summary")!.textContent).toBe(
          "odd and even pages differ",
        );
        expect(slot("left").textContent).toBe("Page");
        expect(slot("right").textContent).toBe("Title");
        await click(button("Done"));

        expect(applied(request).evenPages).toEqual({
          header: { ...NO_SLOTS, left: "{page}", right: "{title}" },
          footer: NO_SLOTS,
        });
      });

      it("mirror the odd pages on request, which shows only while they differ", async () => {
        expect((await open(), button("Mirror the odd pages"))).toBeUndefined();
        await click(button("Done"));

        const even = { ...NO_BANDS, header: { ...NO_SLOTS, center: "x" } };
        const request = await open({
          bands: { header: { ...NO_SLOTS, left: "a" }, evenPages: even },
        });

        await click(button("Mirror the odd pages"));
        expect(announcement.value?.text).toBe("Even pages mirrored");
        await click(tabs()[1]);
        expect(slot("right").textContent).toBe("a");
        await click(button("Done"));

        expect(applied(request).evenPages!.header).toEqual({
          ...NO_SLOTS,
          right: "a",
        });
      });

      it("are the same as the others once turned off", async () => {
        const request = await open({ bands: { evenPages: NO_BANDS } });
        await click(tabs()[1]);

        await click(evenPages());

        expect(tabs()).toEqual([]);
        expect(button("Mirror the odd pages")).toBeUndefined();
        await click(button("Done"));
        expect(applied(request).evenPages).toBeNull();
      });

      it("share the tabs with a first page of its own", async () => {
        await open({ bands: { firstPage: NO_BANDS, evenPages: NO_BANDS } });

        await click(firstPage());
        await choose("Its own");

        expect(tabs().map((tab) => tab.textContent?.trim())).toEqual([
          "First page",
          "Odd pages",
          "Even pages",
        ]);
      });
    });

    it("moves between the tabs with the arrows, which keep the focus", async () => {
      await open({
        bands: {
          header: { ...NO_SLOTS, left: "odd" },
          evenPages: { ...NO_BANDS, header: { ...NO_SLOTS, left: "even" } },
        },
      });
      expect(tabs().map((tab) => tab.tabIndex)).toEqual([0, -1]);
      tabs()[0].focus();

      key(tabs()[0], "ArrowRight");
      await settle();

      expect(tabs()[1].getAttribute("aria-selected")).toBe("true");
      expect(document.activeElement).toBe(tabs()[1]);
      expect(slot("left").textContent).toBe("even");
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

    it("stays open for clicks on itself, its slots and its menu, submenus included", async () => {
      placed.value = shownAt(700);
      const request = await open({ band: "footer", page: 2 });
      // the context menu's levels, as src/ui/ContextMenu.vue renders them
      const menus = document.createElement("div");
      menus.className = "context-menus";
      const menu = document.createElement("div");
      menu.id = "context-menu";
      const submenu = document.createElement("div");
      submenu.className = "context-menu submenu";
      menus.append(menu, submenu);
      document.body.append(menus);

      for (const target of [slot("left"), card(), menu, submenu]) {
        target.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true }),
        );
        await settle();
      }

      expect(request.apply).not.toHaveBeenCalled();
    });

    it("removes the band from every page, and says so", async () => {
      const request = await open({
        bands: {
          header: { left: "a", center: "b", right: "c" },
          firstPage: { header: { ...NO_SLOTS, left: "d" }, footer: NO_SLOTS },
          evenPages: { header: { ...NO_SLOTS, left: "e" }, footer: NO_SLOTS },
        },
      });
      expect(button("Remove").dataset.tip).toBe(
        "Remove the header from every page",
      );

      await click(button("Remove"));

      expect(applied(request)).toMatchObject({
        header: NO_SLOTS,
        firstPage: "plain",
        evenPages: NO_BANDS,
      });
      expect(announcement.value?.text).toBe("Header removed");
    });

    it("moves between the slots and controls with Tab, in the order they show", async () => {
      // above a footer, the strip comes first
      placed.value = shownAt(700);
      await open({ band: "footer", page: 2 });
      slot("right").focus();
      key(slot("right"), "Tab");
      await settle();
      expect(document.activeElement).toBe(button("Remove"));
      key(button("Remove"), "Tab", true);
      expect(document.activeElement).toBe(slot("right"));
      await click(button("Done"));

      // below a header, the slots come first
      placed.value = shownAt(200);
      await open({ page: 1 });
      slot("right").focus();
      key(slot("right"), "Tab");
      await settle();
      expect(document.activeElement).toBe(button("Remove"));
      key(button("Remove"), "Tab", true);
      expect(document.activeElement).toBe(slot("right"));
      button("Done").focus();
      key(button("Done"), "Tab");
      expect(document.activeElement).toBe(button("Page number"));
    });

    it("leaves the tabs not selected out of Tab's way around", async () => {
      await open({ bands: { evenPages: NO_BANDS } });
      evenPages().focus();
      key(evenPages(), "Tab");
      // Mirror, then the selected tab only
      expect(document.activeElement).toBe(button("Mirror the odd pages"));
      key(button("Mirror the odd pages"), "Tab");
      expect(document.activeElement).toBe(tabs()[0]);
      key(tabs()[0], "Tab");
      expect(document.activeElement).toBe(slot("left"));
    });

    it("is done with Esc on a button too", async () => {
      const request = await open({
        bands: { header: { ...NO_SLOTS, left: "x" } },
      });
      button("Title").focus();

      key(button("Title"), "Escape");
      await settle();

      expect(strip()).toBeNull();
      expect(applied(request).header).toEqual({ ...NO_SLOTS, left: "x" });
    });
  });

  describe("names, tooltips and focus", () => {
    it("names the strip and its slots, and has no titles", async () => {
      await open({ band: "footer" });
      expect(strip()!.getAttribute("role")).toBe("group");
      expect(strip()!.getAttribute("aria-label")).toBe("Footer");
      expect(
        [...strip()!.querySelectorAll<HTMLElement>(".slot")].map(
          (place) => place.dataset.placeholder,
        ),
      ).toEqual(["Left", "Center", "Right"]);
      expect(
        [...strip()!.querySelectorAll(".ProseMirror")].map((editor) => [
          editor.getAttribute("role"),
          editor.getAttribute("aria-label"),
        ]),
      ).toEqual([
        ["textbox", "Footer, left"],
        ["textbox", "Footer, center"],
        ["textbox", "Footer, right"],
      ]);
      expect(strip()!.querySelector("[title]")).toBeNull();
      expect(strip()!.textContent).not.toMatch(/▾/);
    });

    it("reads a chip in a slot as its name", async () => {
      await open({
        band: "footer",
        bands: { footer: { ...NO_SLOTS, center: "{page}" } },
      });
      const chip = slot("center").querySelector(".chip")!;
      expect(chip.textContent).toBe("Page");
      expect(chip.getAttribute("aria-label")).toBe("Page number");
    });

    it("keeps focus mode's controls while it's open", async () => {
      expect(controlsStay.value).toBe(false);
      await open();
      expect(controlsStay.value).toBe(true);
      await click(button("Done"));
      expect(controlsStay.value).toBe(false);
    });

    it("gives Done its key in its tooltip", async () => {
      await open();
      expect(button("Done").dataset.tip).toBe("Done");
      expect(button("Done").dataset.tipKey).toBe("Esc");
    });

    it("opens a new strip for another request while one is open", async () => {
      await open();
      await open({ band: "footer" });
      expect(strip()!.classList).toContain("footer");
      expect(strip()!.classList).not.toContain("header");
    });

    it("destroys the slot editors it replaces", async () => {
      await open();
      const place = slot("center").parentElement!;
      await click(evenPages());
      expect(place.isConnected).toBe(false);
      expect(place.querySelector(".ProseMirror")).toBeNull();
    });

    it("keeps what was typed only once", async () => {
      const opened = await open();
      key(slot("center"), "Escape");
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
      await settle();
      expect(opened.apply).toHaveBeenCalledTimes(1);
    });

    it("opens the menus for the keyboard when their button has the focus", async () => {
      await open({ band: "footer" });
      await click(button("Page number"));
      expect(contextMenu.value!.keyboard).toBe(false);
      contextMenu.value = null;

      firstPage().focus();
      await click(firstPage());
      expect(contextMenu.value!.keyboard).toBe(true);
    });

    it("gives the slot the focus back when a menu a click opened closes", async () => {
      await open({ band: "footer" });
      await click(button("Page number"));
      const { close } = contextMenu.value!;

      close();
      expect(contextMenu.value).toBeNull();
      expect(document.activeElement).toBe(slot("center"));
    });

    it("keeps the focus on a control the keys changed the strip with", async () => {
      await open();
      evenPages().focus();
      key(evenPages(), " ");
      await click(evenPages());
      expect(document.activeElement).toBe(evenPages());
    });
  });
});

describe("band strips in the app", () => {
  it("go with the app: the strip, its editor and the body's classes", async () => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = "";
    const dispose = bootApp(createTestHandle());
    const request = await open();
    expect(document.body.classList).toContain("band-editing");

    dispose();

    expect(document.querySelector("#band-editor")).toBeNull();
    expect([...document.body.classList]).toEqual([]);
    // the strip is closed, so the editor takes the focus again
    expect(bandEditor.value).toBeNull();
    // nor does the closed strip listen for clicks outside of it
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(request.apply).not.toHaveBeenCalled();
  });
});

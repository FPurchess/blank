import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bootBandStrips } from "./bandStrips";
import {
  type BandSettings,
  bandSettings,
  DEFAULT_PAGE,
  NO_BANDS,
  NO_SLOTS,
  type Slots,
} from "./layout/settings";
import {
  bandEditor,
  type BandEditorRequest,
  contextMenu,
  type MenuItem,
  transaction,
} from "./state";
import type { EditorHandle } from "./editor/handle";
import {
  createState,
  createTestHandle,
  docWithFrontmatter,
  h,
} from "./test/editor";

const fields = { title: "Report", author: "Ada", date: "1 May", file: "" };

const publish = (frontmatter: string) => {
  transaction.value = createState(
    docWithFrontmatter(frontmatter, h(1, "Report")),
  ).tr;
};

const edge = (band: string) =>
  document.querySelector<HTMLElement>(`#band-${band}`)!;
const strip = () => document.querySelector<HTMLElement>("#band-editor");
const button = (label: string) =>
  [...(strip()?.querySelectorAll("button") ?? [])].find(
    (b) => b.textContent === label,
  )!;
const slot = (name: string) =>
  strip()!.querySelector<HTMLElement>(`.slot.${name} .ProseMirror`)!;

const open = ({
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
  return request;
};

// what the strip kept when it closed
const applied = (request: BandEditorRequest) =>
  vi.mocked(request.apply).mock.calls[0][0];

// runs the item of the open menu that reads `label`
const choose = (label: string) => {
  const item = contextMenu.value!.items.find(
    (item): item is Exclude<MenuItem, "separator"> =>
      item !== "separator" && item.label === label,
  )!;
  if (item.edit) item.edit.submit(item.edit.value);
  else item.run?.();
  return item;
};

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
    dispose = bootBandStrips(editor);
  });

  afterEach(() => {
    dispose();
    bandEditor.value = null;
    contextMenu.value = null;
  });

  describe("at rest", () => {
    it("offers to add a header and a footer with page numbers", () => {
      expect(edge("header").classList).toContain("empty");
      expect(edge("header").textContent).toBe("+ Header");
      expect(edge("footer").textContent).toBe("+ Footer# Page numbers");
      expect(document.body.classList).not.toContain("has-header");
    });

    it("shows the header as it reads, and makes room for it", () => {
      publish('page:\n  header: { left: "{title}", right: "Page {page}" }');

      const line = edge("header").querySelector(".band-line")!;
      expect([...line.children].map((part) => part.textContent)).toEqual([
        "Report",
        "",
        "Page page",
      ]);
      expect(edge("header").classList).not.toContain("empty");
      expect(document.body.classList).toContain("has-header");
      expect(document.body.classList).not.toContain("has-footer");
    });

    it("shows a band only the first or even pages have", () => {
      publish('page:\n  first-page:\n    header: { left: "ACME" }');

      expect(edge("header").classList).not.toContain("empty");
      expect(edge("header").textContent).toBe("ACME");
      expect(document.body.classList).toContain("has-header");
    });

    it("opens the strip of a band when its line or hint is clicked", () => {
      publish('page:\n  footer: { center: "{page}" }');

      edge("footer").querySelector<HTMLElement>(".band-line")!.click();
      expect(bandEditor.value).toMatchObject({ band: "footer" });
      expect(strip()?.classList).toContain("footer");
      button("Done").click();

      [...edge("header").querySelectorAll("button")][0].click();
      expect(bandEditor.value).toMatchObject({ band: "header" });
    });

    it("shows the hints while the mouse is near an edge", () => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientY: 10 }));
      expect(document.body.classList).toContain("near-top");

      window.dispatchEvent(
        new MouseEvent("mousemove", { clientY: window.innerHeight - 10 }),
      );
      expect(document.body.classList).toContain("near-bottom");
      expect(document.body.classList).not.toContain("near-top");

      // out of the window: onto nothing of the page
      window.dispatchEvent(new MouseEvent("mouseout", { relatedTarget: null }));
      expect(document.body.classList).not.toContain("near-bottom");

      // within the page, the hint stays
      window.dispatchEvent(
        new MouseEvent("mousemove", { clientY: window.innerHeight - 10 }),
      );
      window.dispatchEvent(
        new MouseEvent("mouseout", { relatedTarget: document.body }),
      );
      expect(document.body.classList).toContain("near-bottom");
    });

    it("only renders again when what it shows changes", () => {
      publish('page:\n  header: { left: "x" }');
      const line = edge("header").querySelector(".band-line");

      publish('page:\n  header: { left: "x" }');

      expect(edge("header").querySelector(".band-line")).toBe(line);
    });
  });

  describe("editing", () => {
    it("opens the strip with the band's slots, and fades the text", () => {
      open({
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

    it("opens on the pages whose band the edge shows", () => {
      open({
        bands: {
          firstPage: { ...NO_BANDS, header: { ...NO_SLOTS, left: "ACME" } },
        },
      });

      expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
      expect(slot("left").textContent).toBe("ACME");
    });

    it("says when the first page has none", () => {
      open({ bands: { firstPage: "plain" } });

      expect(strip()!.querySelector(".band-label")!.textContent).toBe(
        "Header · every page but the first",
      );
    });

    it("keeps what was edited with Done", () => {
      const request = open({ band: "footer" });

      button("Title").click();
      button("Done").click();

      expect(applied(request)).toEqual({
        ...bandSettings(DEFAULT_PAGE),
        footer: { ...NO_SLOTS, center: "{title}" } satisfies Slots,
      });
      expect(strip()).toBeNull();
      expect(bandEditor.value).toBeNull();
      expect(document.body.classList).not.toContain("band-editing");
    });

    it("inserts into the slot last in use", () => {
      const request = open();

      slot("left").focus();
      slot("left").dispatchEvent(new FocusEvent("focus"));
      button("Chapter").click();
      button("Done").click();

      expect(applied(request).header).toEqual({
        ...NO_SLOTS,
        left: "{chapter}",
      });
    });

    it.each([
      ["Author", "{author}"],
      ["Date", "{date}"],
      ["File", "{file}"],
    ])("inserts the %s", (label, placeholder) => {
      const request = open();

      button(label).click();
      button("Done").click();

      expect(applied(request).header.center).toBe(placeholder);
    });

    it("offers the page numbers as they read, and inserts the chosen one", () => {
      const request = open({ band: "footer" });

      button("# Page number ▾").click();
      const menu = contextMenu.value!;
      expect(
        menu.items.map((item) => (item === "separator" ? "-" : item.label)),
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
      choose("Page 3 of 12");
      menu.close();
      expect(contextMenu.value).toBeNull();
      button("Done").click();

      expect(applied(request).footer).toEqual({
        ...NO_SLOTS,
        center: "Page {page} of {pages}",
      });
    });

    it("sets the numbering and the first number in the page number menu", () => {
      const request = open({ band: "footer" });

      button("# Page number ▾").click();
      expect(choose("1, 2, 3").checked).toBe(true);
      choose("i, ii, iii");
      button("# Page number ▾").click();
      expect(contextMenu.value!.items[0]).toMatchObject({ label: "iii" });
      const start = choose("Start At 1…");
      start.edit!.submit(" 5 ");
      button("# Page number ▾").click();
      choose("Start At 5…").edit!.submit("-1");
      button("Done").click();

      expect(applied(request)).toMatchObject({
        numberStyle: "i",
        startNumber: 5,
      });
    });

    describe("the first page", () => {
      it("leaves it without a header and footer", () => {
        const request = open();

        button("First Page ▾").click();
        expect(choose("Like the Other Pages").checked).toBe(true);
        button("First Page ▾").click();
        choose("None");
        button("Done").click();

        expect(applied(request).firstPage).toBe("plain");
      });

      it("gives it its own, on a tab of its own", () => {
        const request = open({
          bands: { header: { ...NO_SLOTS, right: "{page}" } },
        });

        button("First Page ▾").click();
        choose("Its Own");
        expect(tabs().map((tab) => tab.textContent)).toEqual([
          "First Page",
          "Other Pages",
        ]);
        expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
        expect(strip()!.querySelector(".band-label")!.textContent).toBe(
          "Header",
        );
        button("Title").click();
        // the other pages keep theirs
        tabs()[1].click();
        expect(slot("right").textContent).toBe("page");
        button("Done").click();

        expect(applied(request)).toMatchObject({
          header: { ...NO_SLOTS, right: "{page}" },
          firstPage: {
            header: { ...NO_SLOTS, center: "{title}" },
            footer: NO_SLOTS,
          },
        });
      });

      it("keeps the other band of its own, and is plain without text", () => {
        const letterhead = {
          ...NO_BANDS,
          footer: { ...NO_SLOTS, left: "ACME" },
        };
        const kept = open({ bands: { firstPage: letterhead } });
        button("Done").click();
        expect(applied(kept).firstPage).toEqual(letterhead);

        const empty = open({ bands: { firstPage: "same" } });
        button("First Page ▾").click();
        choose("Its Own");
        button("Done").click();
        expect(applied(empty).firstPage).toBe("plain");
      });

      it("goes back to the other pages when it has none of its own", () => {
        open({
          bands: {
            firstPage: { ...NO_BANDS, header: { ...NO_SLOTS, left: "x" } },
          },
        });
        tabs()[0].click();

        button("First Page ▾").click();
        choose("None");

        expect(tabs()).toEqual([]);
        expect(slot("left").textContent).toBe("");
      });
    });

    describe("even pages", () => {
      it("start as the odd pages mirrored, on a tab of their own", () => {
        const request = open({
          bands: { header: { ...NO_SLOTS, left: "{title}", right: "{page}" } },
        });

        button("Odd & Even Pages").click();

        expect(button("Odd & Even Pages").getAttribute("aria-pressed")).toBe(
          "true",
        );
        expect(tabs().map((tab) => tab.textContent)).toEqual([
          "Odd Pages",
          "Even Pages",
        ]);
        expect(slot("left").textContent).toBe("page");
        expect(slot("right").textContent).toBe("Report");
        button("Done").click();

        expect(applied(request).evenPages).toEqual({
          header: { ...NO_SLOTS, left: "{page}", right: "{title}" },
          footer: NO_SLOTS,
        });
      });

      it("mirror the odd pages again on request", () => {
        const even = { ...NO_BANDS, header: { ...NO_SLOTS, center: "x" } };
        const request = open({
          bands: {
            header: { ...NO_SLOTS, left: "a" },
            evenPages: even,
          },
        });
        expect(button("Mirror Odd Pages").hidden).toBe(true);

        tabs()[1].click();
        expect(button("Mirror Odd Pages").hidden).toBe(false);
        button("Mirror Odd Pages").click();
        button("Done").click();

        expect(applied(request).evenPages!.header).toEqual({
          ...NO_SLOTS,
          right: "a",
        });
      });

      it("are the same as the others once turned off", () => {
        const request = open({ bands: { evenPages: NO_BANDS } });
        tabs()[1].click();

        button("Odd & Even Pages").click();

        expect(tabs()).toEqual([]);
        button("Done").click();
        expect(applied(request).evenPages).toBeNull();
      });

      it("share the tabs with a first page of its own", () => {
        open({ bands: { firstPage: NO_BANDS, evenPages: NO_BANDS } });

        button("First Page ▾").click();
        choose("Its Own");

        expect(tabs().map((tab) => tab.textContent)).toEqual([
          "First Page",
          "Odd Pages",
          "Even Pages",
        ]);
      });
    });

    it("stops listening for clicks outside once it is closed", () => {
      const add = vi.spyOn(window, "addEventListener");
      const remove = vi.spyOn(window, "removeEventListener");
      const mousedown = (spy: typeof add) =>
        spy.mock.calls.filter(([type]) => type === "mousedown");

      open();
      button("Done").click();
      open({ band: "footer" });
      button("Done").click();

      expect(mousedown(add)).toHaveLength(2);
      expect(mousedown(remove)).toEqual(mousedown(add));
      add.mockRestore();
      remove.mockRestore();
    });

    it("keeps what was edited when the text is clicked", () => {
      const request = open({ bands: { header: { ...NO_SLOTS, left: "x" } } });

      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );

      expect(applied(request).header).toEqual({ ...NO_SLOTS, left: "x" });
      expect(strip()).toBeNull();
    });

    it("stays open for clicks on itself and its menu", () => {
      const request = open();
      const menu = document.createElement("div");
      menu.id = "context-menu";
      document.body.append(menu);

      slot("left").dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
      menu.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

      expect(request.apply).not.toHaveBeenCalled();
    });

    it("removes the band from every page", () => {
      const request = open({
        bands: {
          header: { left: "a", center: "b", right: "c" },
          firstPage: { header: { ...NO_SLOTS, left: "d" }, footer: NO_SLOTS },
          evenPages: { header: { ...NO_SLOTS, left: "e" }, footer: NO_SLOTS },
        },
      });

      button("Remove").click();

      expect(applied(request)).toMatchObject({
        header: NO_SLOTS,
        firstPage: "plain",
        evenPages: NO_BANDS,
      });
    });

    it("moves between the slots and buttons with Tab", () => {
      open();
      slot("right").focus();

      slot("right").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
      );

      expect(document.activeElement).toBe(button("# Page number ▾"));
    });

    it("goes around from the last button to the first, and back", () => {
      open();
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

    it("is done with Esc on a button too", () => {
      const request = open({ bands: { header: { ...NO_SLOTS, left: "x" } } });
      button("Title").focus();

      button("Title").dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );

      expect(strip()).toBeNull();
      expect(applied(request).header).toEqual({ ...NO_SLOTS, left: "x" });
    });

    it("numbers the pages from the footer hint, through the editor", () => {
      [...edge("footer").querySelectorAll("button")][1].click();
      expect(bandEditor.value).toMatchObject({
        band: "footer",
        insert: "{page}",
      });

      button("Done").click();

      expect(editor.view.state.doc.attrs.frontmatter).toBe(
        'page:\n  footer: {center: "{page}"}',
      );
    });
  });
});

describe("bootBandStrips", () => {
  it("replaces the strips of an earlier boot", () => {
    document.body.innerHTML = "";
    bootBandStrips(createTestHandle());
    const dispose = bootBandStrips(createTestHandle());

    expect(document.querySelectorAll("#band-header")).toHaveLength(1);
    dispose();
    expect(document.querySelector(".band-edge")).toBeNull();
  });

  it("takes the strips, their editor and the body's classes away again", () => {
    document.elementFromPoint = () => null;
    document.body.innerHTML = "";
    transaction.value = null;
    const dispose = bootBandStrips(createTestHandle());
    publish('page:\n  header: { left: "x" }');
    const request = open();
    document.body.classList.add("near-top");

    dispose();

    expect(document.querySelector(".band-edge, #band-editor")).toBeNull();
    expect([...document.body.classList]).toEqual([]);
    // the strip is closed, so the editor takes the focus again
    expect(bandEditor.value).toBeNull();
    // nor does the closed strip listen for clicks outside of it
    document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    expect(request.apply).not.toHaveBeenCalled();
    // the strips no longer follow the document
    publish('page:\n  footer: { left: "y" }');
    expect(document.querySelector(".band-edge")).toBeNull();
    bandEditor.value = null;
  });
});

import { exists } from "@tauri-apps/plugin-fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { readBlocks } from "../editor/commands/contentBlocks";
import type { EditorHandle } from "../editor/handle";
import {
  announcement,
  blockChoices,
  blocksPaneFocused,
  blocksPaneOpen,
  focusBlocksSearch,
  uiTakesFocus,
} from "../state";
import { flushPromises } from "../test/async";
import { createState, createTestHandle, doc, p } from "../test/editor";
import { mockTauriPath } from "../test/tauri";
import { bootApp } from "./mount";

const pane = () => document.getElementById("blocks-pane");
const search = () =>
  pane()!.querySelector<HTMLInputElement>('input[type="search"]')!;
const tiles = () => [...pane()!.querySelectorAll<HTMLButtonElement>(".tile")];
const tile = (id: string) =>
  pane()!.querySelector<HTMLButtonElement>(`.tile[data-block="${id}"]`)!;
const key = (target: Element, key: string, init: KeyboardEventInit = {}) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
  );

// jsdom's window is 1024 px wide; a test that narrows it gets it back
const WIDTH = window.innerWidth;
const resize = async (width: number) => {
  window.innerWidth = width;
  window.dispatchEvent(new Event("resize"));
  await nextTick();
};

describe("the blocks pane", () => {
  let dispose = () => {};
  let editor: EditorHandle;

  beforeEach(async () => {
    mockTauriPath();
    vi.mocked(exists).mockResolvedValue(false);
    await readBlocks();
    blockChoices.value = [
      ...blockChoices.value,
      {
        id: "user/broken",
        group: "forms",
        label: "broken",
        description: "Can't be used: it needs fields",
        disabled: true,
      },
    ];
    editor = createTestHandle(createState(doc(p("a"), p())));
    dispose = bootApp(editor);
    blocksPaneOpen.value = true;
    await nextTick();
  });

  afterEach(async () => {
    blocksPaneOpen.value = false;
    blockChoices.value = [];
    announcement.value = null;
    dispose();
    await resize(WIDTH);
  });

  it("is a region with a heading, the tiles in their groups", () => {
    expect(pane()!.getAttribute("aria-labelledby")).toBe("blocks-pane-title");
    expect(document.getElementById("blocks-pane-title")!.textContent).toBe(
      "Blocks",
    );
    expect(
      [...pane()!.querySelectorAll(".blocks-group")].map((label) =>
        label.textContent!.trim(),
      ),
    ).toEqual(["Contents", "Forms", "Drawings"]);
    expect(tiles().map((tile) => tile.textContent!.trim())).toEqual([
      "Table of contents",
      "Recipe",
      "broken",
      "Diagram",
    ]);
    // the description is the tooltip, and screen readers get it too
    expect(tile("toc").dataset.tip).toBe(
      "The headings, with the pages they start on",
    );
    expect(tile("user/broken").getAttribute("aria-disabled")).toBe("true");
    expect(tile("user/broken").getAttribute("aria-description")).toMatch(
      /^Can't be used/,
    );
  });

  it("docks at a wide window, the pages making room", () => {
    // jsdom's window is 1024 px wide
    expect(document.body.classList.contains("blocks-docked")).toBe(true);
    expect(pane()!.classList.contains("docked")).toBe(true);
    // docked, a press elsewhere leaves it open
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(blocksPaneOpen.value).toBe(true);
  });

  it("floats over the pages at a narrow window, and goes on a press elsewhere", async () => {
    await resize(800);
    expect(pane()!.classList.contains("floating")).toBe(true);
    expect(document.body.classList.contains("blocks-docked")).toBe(false);
    tile("toc").dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(blocksPaneOpen.value).toBe(true);
    // going while it has the focus, it leaves the focus to the text
    const focus = vi.spyOn(editor, "focus");
    search().focus();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(blocksPaneOpen.value).toBe(false);
    await nextTick();
    expect(focus).toHaveBeenCalled();
  });

  it("inserts a block where the cursor is on a click, and says so", () => {
    tile("toc").click();
    expect(editor.view.state.doc.child(1).type.name).toBe("toc");
    expect(announcement.value?.text).toBe("Table of contents inserted");
  });

  it("inserts nothing for a form it can't use", () => {
    tile("user/broken").click();
    expect(editor.view.state.doc.childCount).toBe(2);
  });

  it("finds blocks as the search is typed", async () => {
    search().value = "reci";
    search().dispatchEvent(new Event("input"));
    await nextTick();
    expect(tiles().map((tile) => tile.dataset.block)).toEqual(["blank/recipe"]);
    search().value = "zzz";
    search().dispatchEvent(new Event("input"));
    await nextTick();
    expect(pane()!.querySelector(".blocks-none")!.textContent).toContain("zzz");
  });

  it("puts the focus into its search when asked, and holds it", async () => {
    focusBlocksSearch();
    await flushPromises();
    expect(document.activeElement).toBe(search());
    expect(blocksPaneFocused.value).toBe(true);
    expect(uiTakesFocus.value).toBe(true);
  });

  it("goes from the search to the tiles and between them with the keys", async () => {
    search().focus();
    key(search(), "ArrowDown");
    expect(document.activeElement).toBe(tile("toc"));
    // down into the group below, though the table of contents is alone
    key(tile("toc"), "ArrowDown");
    expect(document.activeElement).toBe(tile("blank/recipe"));
    key(tile("blank/recipe"), "ArrowRight");
    expect(document.activeElement).toBe(tile("user/broken"));
    await nextTick();
    // one tile in the tab order: the current one
    expect(tiles().map((tile) => tile.tabIndex)).toEqual([-1, -1, 0, -1]);
    key(tile("user/broken"), "ArrowUp");
    expect(document.activeElement).toBe(tile("toc"));
    key(tile("toc"), "ArrowUp");
    expect(document.activeElement).toBe(search());
  });

  it("starts a new search at its first tile", async () => {
    search().focus();
    key(search(), "ArrowDown");
    key(tile("toc"), "End");
    await nextTick();
    expect(tile("diagram").tabIndex).toBe(0);
    search().value = "reci";
    search().dispatchEvent(new Event("input"));
    await nextTick();
    expect(tile("blank/recipe").tabIndex).toBe(0);
    key(search(), "ArrowDown");
    expect(document.activeElement).toBe(tile("blank/recipe"));
  });

  it("inserts on a click after a drag that went nowhere", async () => {
    // a drag that ended without the click that would have come after it
    const drag = (type: string, x: number, buttons = 1) =>
      tile("toc").dispatchEvent(
        Object.assign(new Event(type, { bubbles: true }), {
          clientX: x,
          clientY: 10,
          button: 0,
          buttons,
          pointerId: 1,
        }),
      );
    // off the pages: jsdom has no elementFromPoint
    document.elementFromPoint = () => document.body;
    drag("pointerdown", 10);
    drag("pointermove", 60);
    drag("pointerup", 60, 0);
    await new Promise((done) => setTimeout(done));
    tile("toc").click();
    expect(editor.view.state.doc.child(1).type.name).toBe("toc");
    delete (document as Partial<Document>).elementFromPoint;
  });

  it("inserts the first block found on Enter in the search", () => {
    search().focus();
    key(search(), "Enter");
    expect(editor.view.state.doc.child(1).type.name).toBe("toc");
  });

  it("gives the text the focus on Esc, and stays open", () => {
    const focus = vi.spyOn(editor, "focus");
    search().focus();
    key(search(), "Escape");
    expect(focus).toHaveBeenCalled();
    expect(blocksPaneOpen.value).toBe(true);
  });

  it("closes on its shortcut, and with its button", async () => {
    search().focus();
    key(search(), "b", { ctrlKey: true, altKey: true });
    expect(blocksPaneOpen.value).toBe(false);
    blocksPaneOpen.value = true;
    await nextTick();
    pane()!
      .querySelector<HTMLButtonElement>('[aria-label="Hide pane"]')!
      .click();
    expect(blocksPaneOpen.value).toBe(false);
  });

  it("keeps the focus where it is on a press, except in the search", () => {
    const press = (target: Element) => {
      const event = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    expect(press(tile("toc"))).toBe(true);
    expect(press(search())).toBe(false);
  });
});

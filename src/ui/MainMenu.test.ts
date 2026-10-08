import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { CommandIdentifier as C } from "../config";
import {
  announcement,
  contextMenu,
  mainMenuWanted,
  pageView,
  recentCommands,
  recentFiles,
  theme,
} from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

// The main menu behind the logo: its search, its rows and its keys, through
// the app as the user meets them

// whether the main menu is open: the menu with a search
const isOpen = () => !!contextMenu.value?.search;

const settle = async () => {
  await nextTick();
  await nextTick();
};

const logo = () => document.querySelector<HTMLButtonElement>(".logo-button")!;
const search = () =>
  document.querySelector<HTMLInputElement>("#main-menu input")!;
const list = () => document.querySelector<HTMLElement>("#context-menu")!;
const line = (id: string) =>
  list().querySelector<HTMLElement>(`[data-id="${id}"]`);
const options = () =>
  [...list().querySelectorAll<HTMLElement>('[role="option"]')].map(
    (option) => option.dataset.id,
  );
const focusedId = () => (document.activeElement as HTMLElement)?.dataset.id;

const press = async (
  key: string,
  init: KeyboardEventInit = {},
  target: Element = document.activeElement ?? document.body,
) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  await settle();
  return event;
};

const type = async (text: string) => {
  const input = search();
  input.value += text;
  input.dispatchEvent(new Event("input"));
  await settle();
};

describe("the main menu", () => {
  let dispose = () => {};
  let handle: ReturnType<typeof createTestHandle>;

  beforeEach(async () => {
    document.body.replaceChildren();
    contextMenu.value = null;
    handle = createTestHandle();
    vi.spyOn(handle, "focus");
    dispose = bootApp(handle);
    await settle();
  });

  afterEach(() => {
    contextMenu.value = null;
    dispose();
    theme.value = "light";
    pageView.value = "page-ends";
    recentCommands.value = [];
    recentFiles.value = [];
  });

  it("opens from the logo, with the focus in its search", async () => {
    expect(logo().getAttribute("aria-label")).toBe("Main menu");
    expect(logo().getAttribute("aria-haspopup")).toBe("dialog");
    expect(logo().dataset.tip).toBe("Main menu");

    logo().click();
    await settle();

    expect(isOpen()).toBe(true);
    expect(logo().getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(search());
    expect(search().getAttribute("role")).toBe("combobox");
    // a click on the logo again closes it
    logo().click();
    await settle();
    expect(isOpen()).toBe(false);
  });

  it("opens with its key, from anywhere", async () => {
    mainMenuWanted.value = {};
    await settle();
    expect(document.activeElement).toBe(search());
  });

  it("lists File, the rows and Blank's own, without Recent at first", async () => {
    logo().click();
    await settle();
    expect(list().querySelector(".menu-head:not(.visually-hidden)")).toBeNull();
    for (const id of [C.FILE_NEW, C.FILE_OPEN, "file.recent", "file.export"])
      expect(line(id)).not.toBeNull();
    expect(
      [...list().querySelectorAll(".menu-row")].map((row) =>
        row.getAttribute("aria-label"),
      ),
    ).toEqual(["Edit", "View", "Zoom", "Theme"]);
    expect(line(C.APP_ABOUT)!.textContent).toContain("About Blank");
  });

  it("finds commands as it's typed into, ranked, and runs the first", async () => {
    logo().click();
    await settle();
    await type("pages");

    expect(list().getAttribute("role")).toBe("listbox");
    expect(options()[0]).toBe(C.VIEW_PAGES);
    expect(search().getAttribute("aria-activedescendant")).toBe("menu-0-0");
    expect(list().querySelector("mark")!.textContent).toBe("Pages");

    await press("Enter", {}, search());
    expect(pageView.value).toBe("pages");
    expect(isOpen()).toBe(false);
  });

  it("moves through what it found with the arrows, the focus staying", async () => {
    logo().click();
    await settle();
    await type("zoom");
    await press("ArrowDown", {}, search());
    expect(search().getAttribute("aria-activedescendant")).toBe("menu-0-1");
    expect(document.activeElement).toBe(search());
    // the pointer over an option makes it active, still in the search
    line(options()[0]!)!.dispatchEvent(new MouseEvent("mouseenter"));
    await settle();
    expect(search().getAttribute("aria-activedescendant")).toBe("menu-0-0");
    expect(document.activeElement).toBe(search());
  });

  it("shows what can't run now disabled", async () => {
    logo().click();
    await settle();
    // there are no pages to export without the layout engine here
    await type("export");
    expect(line(C.EXPORT_PDF)!.getAttribute("aria-disabled")).toBe("true");
    expect(search().getAttribute("aria-activedescendant")).toBeNull();
  });

  it("says when it finds nothing", async () => {
    vi.useFakeTimers();
    logo().click();
    await settle();
    await type("xyz");
    expect(
      list().parentElement!.querySelector(".menu-foot")!.textContent,
    ).toContain("No command for “xyz”");
    vi.advanceTimersByTime(600);
    expect(announcement.value?.text).toContain("No command for");
    vi.useRealTimers();
  });

  it("clears the search with Esc first, then closes, back to the text", async () => {
    logo().click();
    await settle();
    await type("save");
    await press("Escape", {}, search());
    expect(search().value).toBe("");
    expect(isOpen()).toBe(true);
    await press("Escape", {}, search());
    expect(isOpen()).toBe(false);
    expect(handle.focus).toHaveBeenCalled();
  });

  it("goes into the menu with ↓, and back to the search with a letter", async () => {
    logo().click();
    await settle();
    await press("ArrowDown", {}, search());
    expect(focusedId()).toBe(C.FILE_NEW);

    await press("s");
    expect(document.activeElement).toBe(search());
    expect(search().value).toBe("s");
  });

  it("moves along a row with ← and →, past what's disabled", async () => {
    logo().click();
    await settle();
    // to the View row: past File's items and the Edit row
    line(C.VIEW_BLOCKS)!.dispatchEvent(new MouseEvent("mouseenter"));
    await settle();
    expect(focusedId()).toBe(C.VIEW_BLOCKS);
    await press("ArrowRight");
    expect(focusedId()).toBe(C.VIEW_OUTLINE);
    await press("ArrowLeft");
    expect(focusedId()).toBe(C.VIEW_BLOCKS);
  });

  it("switches the view and the theme, staying open to show it", async () => {
    logo().click();
    await settle();
    line(C.VIEW_PAGES)!.click();
    await settle();
    expect(pageView.value).toBe("pages");
    expect(isOpen()).toBe(true);
    expect(line(C.VIEW_PAGES)!.getAttribute("aria-checked")).toBe("true");

    const dark = line("theme:dark")!;
    expect(dark.getAttribute("role")).toBe("menuitemradio");
    expect(dark.dataset.theme).toBe("dark");
    dark.click();
    await settle();
    expect(theme.value).toBe("dark");
    expect(line("theme:dark")!.getAttribute("aria-checked")).toBe("true");
    expect(isOpen()).toBe(true);
  });

  it("takes the focus back to its search on its key while it's open", async () => {
    logo().click();
    await settle();
    await press("ArrowDown", {}, search());
    await press("k", { ctrlKey: true });
    expect(document.activeElement).toBe(search());
  });

  it("lists the recent files, and says when there are none", async () => {
    logo().click();
    await settle();
    line("file.recent")!.click();
    await settle();
    const submenu = document.querySelector<HTMLElement>(".submenu")!;
    expect(submenu.textContent).toContain("No recent files");
    await press("Escape");
    await press("Escape");

    recentFiles.value = ["/docs/notes.md"];
    logo().click();
    await settle();
    line("file.recent")!.click();
    await settle();
    const files = document.querySelector<HTMLElement>(".submenu")!;
    expect(files.textContent).toContain("notes.md");
    expect(files.textContent).toContain("/docs");
    expect(files.textContent).toContain("Clear list");
  });

  it("lists the commands used last under Recent", async () => {
    recentCommands.value = [
      { id: C.PAGE_SETUP, byKey: true },
      { id: C.FORMAT_BOLD, byKey: true },
      { id: C.FILE_SAVE, byKey: false },
    ];
    logo().click();
    await settle();
    const head = list().querySelector(".menu-head:not(.visually-hidden)")!;
    expect(head.textContent?.trim()).toBe("Recent");
    expect(head.closest('[role="group"]')!.getAttribute("aria-label")).toBe(
      "Recent",
    );
    // not Bold, typed by its key, nor Save, which File shows
    expect(line(C.PAGE_SETUP)).not.toBeNull();
    expect(line(C.FORMAT_BOLD)).toBeNull();
  });

  it("goes into the menu at its end with ↑, and back to the search above it", async () => {
    logo().click();
    await settle();
    await press("ArrowUp", {}, search());
    expect(focusedId()).toBe(C.APP_ABOUT);
    await press("ArrowDown", {}, search());
    expect(focusedId()).toBe(C.FILE_NEW);
    await press("ArrowUp");
    expect(document.activeElement).toBe(search());
  });

  it("takes its key back to the search from a submenu too", async () => {
    recentFiles.value = ["/docs/a.md"];
    logo().click();
    await settle();
    line("file.recent")!.click();
    await settle();
    expect(focusedId()).toBe("recent:/docs/a.md");
    await press("k", { ctrlKey: true });
    expect(document.activeElement).toBe(search());
    // and the submenu closes
    expect(document.querySelectorAll(".context-menu")).toHaveLength(1);
  });

  it("keeps an open submenu when what it lists changes", async () => {
    recentFiles.value = ["/docs/a.md"];
    logo().click();
    await settle();
    line("file.recent")!.click();
    await settle();
    recentFiles.value = ["/docs/b.md", "/docs/a.md"];
    await settle();
    const submenu = document.querySelector<HTMLElement>(".submenu")!;
    expect(submenu.textContent).toContain("b.md");
  });

  it("closes for the blocks pane, which takes the focus to its search", async () => {
    logo().click();
    await settle();
    line(C.VIEW_BLOCKS)!.click();
    await settle();
    expect(isOpen()).toBe(false);
  });

  it("opens from the logo with ↓", async () => {
    logo().focus();
    await press("ArrowDown", {}, logo());
    expect(document.activeElement).toBe(search());
  });
});

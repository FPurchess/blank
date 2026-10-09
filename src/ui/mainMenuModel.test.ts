import { describe, expect, it, vi } from "vitest";

import { CommandIdentifier as C } from "../config";
import { PRINT_UNAVAILABLE_SHORT } from "../print/printModel";
import { type MenuLine, ZOOM_NEEDS_PAGES } from "../state";
import {
  FILE_COMMANDS,
  type MainMenuDeps,
  mainMenuItems,
  mainMenuSearch,
  recentForMenu,
} from "./mainMenuModel";
import { isEntry, isRow, type MenuEntry } from "./menuModel";

const deps = (over: Partial<MainMenuDeps> = {}): MainMenuDeps => ({
  can: () => true,
  run: vi.fn(),
  recent: [],
  files: [],
  openFile: vi.fn(),
  zoom: { text: "Fit", tip: "Fit to window (87%)" },
  pages: true,
  theme: "light",
  chooseTheme: vi.fn(),
  on: {},
  ...over,
});

const entry = (lines: MenuLine[], id: string) =>
  lines
    .flatMap((line) => (isRow(line) ? line.items : [line]))
    .find((line): line is MenuEntry => isEntry(line) && line.id === id)!;
const row = (lines: MenuLine[], label: string) =>
  lines.find((line) => isRow(line) && line.label === label) as Extract<
    MenuLine,
    { kind: "row" }
  >;

describe("recentForMenu", () => {
  it("lists the last three that run, not what the menu shows or typing by key", () => {
    expect(
      recentForMenu(
        [
          { id: C.FORMAT_BOLD, byKey: true },
          { id: C.FILE_SAVE, byKey: false },
          { id: C.PAGE_SETUP, byKey: false },
          { id: C.FORMAT_BOLD, byKey: false },
          { id: C.INSERT_TABLE, byKey: true },
          { id: C.TOOLS_STATS, byKey: true },
          { id: C.SPELLCHECK_TOGGLE, byKey: false },
        ],
        (id) => id !== C.INSERT_TABLE,
      ),
    ).toEqual([C.PAGE_SETUP, C.FORMAT_BOLD, C.TOOLS_STATS]);
  });
});

describe("mainMenuItems", () => {
  it("has File in its order, with Open recent and Export as submenus", () => {
    const lines = mainMenuItems(deps());
    const ids = lines.filter(isEntry).map((line) => line.id);
    expect(ids.slice(0, FILE_COMMANDS.length)).toEqual([
      C.FILE_NEW,
      C.FILE_OPEN,
      "file.recent",
      C.FILE_SAVE,
      C.FILE_SAVE_AS,
      "file.export",
      C.FILE_PRINT,
    ]);
    expect(
      entry(lines, "file.export")
        .children!.filter(isEntry)
        .map(({ id }) => id),
    ).toEqual([C.EXPORT_PDF, C.EXPORT_DOCX]);
  });

  it("lists the recent files with their folders, or that there are none", () => {
    const none = entry(mainMenuItems(deps()), "file.recent").children!;
    expect(none).toEqual([
      { id: "recent:none", label: "No recent files", disabled: true },
    ]);
    const openFile = vi.fn();
    const files = entry(
      mainMenuItems(deps({ files: ["/docs/a.md"], openFile })),
      "file.recent",
    ).children!;
    const [file] = files.filter(isEntry);
    expect(file).toMatchObject({ label: "a.md", detail: "/docs" });
    file.run!();
    expect(openFile).toHaveBeenCalledWith("/docs/a.md");
    expect(files[files.length - 1]).toMatchObject({
      id: C.FILE_CLEAR_RECENT,
      label: "Clear list",
    });
  });

  it("switches the view in place, and shows which switch is on", () => {
    const run = vi.fn();
    const lines = mainMenuItems(deps({ run, on: { [C.VIEW_PAGES]: true } }));
    const pages = entry(lines, C.VIEW_PAGES);
    expect(pages).toMatchObject({ checked: true, stays: true });
    expect(entry(lines, C.VIEW_OUTLINE).checked).toBe(false);
    pages.run!();
    expect(run).toHaveBeenCalledWith(C.VIEW_PAGES, true);
    // Undo closes it
    entry(lines, C.UNDO).run!();
    expect(run).toHaveBeenCalledWith(C.UNDO, false);
  });

  it("shows the zoom between − and +, disabled without pages", () => {
    const zoom = row(
      mainMenuItems(deps({ zoom: { text: "125%", tip: "Fit to window" } })),
      "Zoom",
    );
    expect(zoom.items.map(({ label }) => label)).toEqual([
      "Zoom out",
      "125%",
      "Zoom in",
    ]);
    expect(zoom.items[1].tip).toBe("Fit to window");
    const without = row(mainMenuItems(deps({ pages: false })), "Zoom");
    expect(without.items.every((item) => item.disabled)).toBe(true);
    expect(without.items[0].tip).toBe(ZOOM_NEEDS_PAGES);
  });

  it("turns Print off without pages, saying why as the tab's menu does", () => {
    const print = entry(mainMenuItems(deps()), C.FILE_PRINT);
    expect(print).toMatchObject({ label: "Print…", disabled: false });
    expect(print.detail).toBeUndefined();
    const without = deps({ pages: false });
    expect(entry(mainMenuItems(without), C.FILE_PRINT)).toMatchObject({
      disabled: true,
      detail: PRINT_UNAVAILABLE_SHORT,
    });
    // and so does the search
    expect(
      mainMenuSearch(without)
        .results("print")
        .find(({ id }) => id === C.FILE_PRINT),
    ).toMatchObject({ disabled: true, detail: PRINT_UNAVAILABLE_SHORT });
  });

  it("offers every theme as a swatch, the chosen one checked", () => {
    const chooseTheme = vi.fn();
    const themes = row(
      mainMenuItems(deps({ theme: "dark", chooseTheme })),
      "Theme",
    );
    expect(themes.items.map(({ swatch }) => swatch)).toEqual([
      "light",
      "dark",
      "black",
      "red",
      "green",
      "blue",
    ]);
    expect(themes.items[1]).toMatchObject({ label: "Dark", checked: true });
    themes.items[2].run!();
    expect(chooseTheme).toHaveBeenCalledWith("black");
  });

  it("ends with Blank's settings, shortcuts, guide and About", () => {
    const ids = mainMenuItems(deps())
      .filter(isEntry)
      .map(({ id }) => id);
    expect(ids.slice(-4)).toEqual([
      C.APP_SETTINGS,
      C.APP_SHORTCUTS,
      C.APP_GUIDE,
      C.APP_ABOUT,
    ]);
  });
});

describe("mainMenuSearch", () => {
  it("finds commands with their group, and never itself", () => {
    const search = mainMenuSearch(deps());
    const [first] = search.results("theme");
    expect(first).toMatchObject({ id: C.THEME_CYCLE, detail: "View" });
    expect(search.results("main menu").map(({ id }) => id)).not.toContain(
      C.MENU_MAIN,
    );
    // nor what only moves the focus, which the closing menu takes back
    expect(search.results("focus").map(({ id }) => id)).not.toContain(
      C.VIEW_FOCUS_NEXT,
    );
    expect(search.empty(" xyz ")).toBe(
      "No command for “xyz”. Try “pdf”, “table” or “theme”.",
    );
  });
});

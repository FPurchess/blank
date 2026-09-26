import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { bootContextMenu, formatShortcut } from "./contextMenu";
import {
  type ContextMenuRequest,
  contextMenu,
  language,
  type MenuItem,
  spellcheck,
} from "./state";

const menu = () => document.querySelector<HTMLElement>("#context-menu");
const submenu = () => document.querySelector<HTMLElement>(".submenu");
const rows = (element = menu()) => [
  ...element!.querySelectorAll<HTMLElement>('[role="menuitem"]'),
];
const row = (id: string) =>
  document.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
const focusedId = () => (document.activeElement as HTMLElement)?.dataset.id;

const press = (key: string, init: KeyboardEventInit = {}) => {
  const target = document.activeElement ?? document.body;
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  target.dispatchEvent(event);
  return event;
};

let runs: string[];
let close: ReturnType<typeof vi.fn<() => void>>;

const items = (): MenuItem[] => [
  { id: "wrong", label: "wrong", run: () => runs.push("wrong") },
  {
    id: "all",
    label: "Change All",
    children: [
      { id: "all:wrong", label: "wrong", run: () => runs.push("all:wrong") },
      { id: "all:wring", label: "wring", run: () => runs.push("all:wring") },
    ],
  },
  "separator",
  { id: "loading", label: "Loading…", disabled: true },
  { id: "add", label: "Add to Dictionary", run: () => runs.push("add") },
  {
    id: "edit",
    label: "Edit in Dictionary…",
    edit: { value: "blank", submit: (value) => runs.push(`edit:${value}`) },
  },
  {
    id: "undo",
    label: "Undo",
    shortcut: "Mod-z",
    run: () => runs.push("undo"),
  },
];

const open = (keyboard = true, list = items()): ContextMenuRequest => {
  const request: ContextMenuRequest = {
    items: list,
    anchor: { left: 10, top: 20, bottom: 40 },
    keyboard,
    close,
  };
  contextMenu.value = request;
  return request;
};

describe("contextMenu", () => {
  beforeEach(() => {
    runs = [];
    close = vi.fn<() => void>(() => {
      contextMenu.value = null;
    });
    document.body.replaceChildren();
    contextMenu.value = null;
    bootContextMenu();
  });

  afterEach(() => {
    contextMenu.value = null;
  });

  it("renders a menu with items, separators and shortcuts", () => {
    open();

    expect(menu()!.getAttribute("role")).toBe("menu");
    expect(rows().map((r) => r.dataset.id)).toEqual([
      "wrong",
      "all",
      "loading",
      "add",
      "edit",
      "undo",
    ]);
    expect(menu()!.querySelectorAll('[role="separator"]')).toHaveLength(1);
    expect(row("loading").getAttribute("aria-disabled")).toBe("true");
    expect(row("all").getAttribute("aria-haspopup")).toBe("menu");
    expect(row("undo").querySelector("kbd")!.textContent).toBe("Ctrl+Z");
    expect(menu()!.style.left).toBe("10px");
    expect(menu()!.style.top).toBe("42px");
  });

  it("focuses the first item when opened with the keyboard", () => {
    open(true);

    expect(focusedId()).toBe("wrong");
  });

  it("focuses no item when opened with the mouse", () => {
    open(false);

    expect(document.activeElement).toBe(menu());
    // like the system menus: up starts at the bottom, down at the top
    press("ArrowUp");
    expect(focusedId()).toBe("undo");
    open(false);
    press("ArrowDown");
    expect(focusedId()).toBe("wrong");
  });

  it("moves with the arrow keys, skipping disabled items and wrapping", () => {
    open();

    press("ArrowDown");
    expect(focusedId()).toBe("all");
    press("ArrowDown");
    expect(focusedId()).toBe("add");
    press("ArrowUp");
    expect(focusedId()).toBe("all");
    press("End");
    expect(focusedId()).toBe("undo");
    press("ArrowDown");
    expect(focusedId()).toBe("wrong");
    press("ArrowUp");
    expect(focusedId()).toBe("undo");
    press("Home");
    expect(focusedId()).toBe("wrong");
  });

  it("jumps to the next item starting with a typed letter", () => {
    open();

    press("u");
    expect(focusedId()).toBe("undo");
    press("A");
    expect(focusedId()).toBe("add");
    press("x");
    expect(focusedId()).toBe("add");
    // shortcuts aren't letters to jump to
    press("a", { ctrlKey: true });
    expect(focusedId()).toBe("add");
  });

  it("runs an item with Enter or Space after closing", () => {
    open();

    press("Enter");
    expect(close).toHaveBeenCalled();
    expect(runs).toEqual(["wrong"]);

    open();
    press("u");
    press(" ");
    expect(runs).toEqual(["wrong", "undo"]);
    expect(menu()).toBeNull();
  });

  it("does nothing on Enter without a focused item", () => {
    open(false);

    press("Enter");
    press("ArrowRight");

    expect(runs).toEqual([]);
    expect(menu()).not.toBeNull();
  });

  it("opens and closes submenus with the arrow keys", () => {
    open();
    press("ArrowDown");

    press("ArrowRight");
    expect(submenu()).not.toBeNull();
    expect(row("all").getAttribute("aria-expanded")).toBe("true");
    expect(focusedId()).toBe("all:wrong");
    press("ArrowDown");
    expect(focusedId()).toBe("all:wring");

    press("ArrowLeft");
    expect(submenu()).toBeNull();
    expect(row("all").getAttribute("aria-expanded")).toBe("false");
    expect(focusedId()).toBe("all");

    press("Enter");
    press("Escape");
    expect(submenu()).toBeNull();
    expect(menu()).not.toBeNull();

    press("ArrowRight");
    press("Enter");
    expect(runs).toEqual(["all:wrong"]);
  });

  it("ignores ArrowRight on items without a submenu", () => {
    open();

    press("ArrowRight");

    expect(submenu()).toBeNull();
  });

  it("closes with Escape or Tab", () => {
    open();
    press("Escape");
    expect(close).toHaveBeenCalledTimes(1);

    open();
    press("Tab");
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("follows the mouse", () => {
    open(false);

    row("loading").dispatchEvent(new MouseEvent("mouseenter"));
    expect(document.activeElement).toBe(menu());

    row("all").dispatchEvent(new MouseEvent("mouseenter"));
    expect(focusedId()).toBe("all");
    expect(submenu()).not.toBeNull();

    row("add").dispatchEvent(new MouseEvent("mouseenter"));
    expect(submenu()).toBeNull();

    row("loading").click();
    expect(runs).toEqual([]);

    row("add").click();
    expect(runs).toEqual(["add"]);
  });

  it("opens a submenu on click", () => {
    open(false);

    row("all").click();

    expect(focusedId()).toBe("all:wrong");
    row("all:wrong").click();
    expect(runs).toEqual(["all:wrong"]);
  });

  it("keeps the focus in the menu on mouse down", () => {
    open(false);
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });

    row("add").dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    expect(close).not.toHaveBeenCalled();
  });

  describe("editing", () => {
    const input = () => row("edit").querySelector("input")!;
    const type = (key: string) => {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      input().dispatchEvent(event);
      return event;
    };

    it("edits the word in place", () => {
      open();
      press("e");
      press("Enter");

      expect(input().value).toBe("blank");
      expect(document.activeElement).toBe(input());
      input().value = "blanker";
      type("x");
      expect(input()).not.toBeNull();
      type("Enter");

      expect(close).toHaveBeenCalled();
      expect(runs).toEqual(["edit:blanker"]);
    });

    it("cancels with Escape and closes with Tab", () => {
      open();
      press("e");
      press("Enter");

      type("Escape");
      expect(row("edit").querySelector("input")).toBeNull();
      expect(focusedId()).toBe("edit");
      expect(close).not.toHaveBeenCalled();

      press("Enter");
      input().click();
      type("Tab");
      expect(close).toHaveBeenCalled();
      expect(runs).toEqual([]);
    });
  });

  describe("updates", () => {
    it("keeps the item the user moved to", () => {
      const request = open();
      press("ArrowDown");
      press("ArrowDown");

      contextMenu.value = { ...request, items: [...items()].reverse() };

      expect(focusedId()).toBe("add");
    });

    it("focuses the first item until the user moves", () => {
      const request = open();
      const loading: MenuItem[] = [
        { id: "loading", label: "Loading…", disabled: true },
        { id: "add", label: "Add", run: () => {} },
      ];
      contextMenu.value = { ...request, items: loading };
      expect(focusedId()).toBe("add");

      contextMenu.value = { ...request, items: items() };
      expect(focusedId()).toBe("wrong");
    });

    it("replaces the menu for another request", () => {
      open();
      press("ArrowDown");

      close = vi.fn<() => void>(() => {
        contextMenu.value = null;
      });
      open(false);

      expect(document.activeElement).toBe(menu());
      expect(document.querySelectorAll(".context-menu")).toHaveLength(1);
    });
  });

  describe("closing", () => {
    it("closes on a mouse down outside", () => {
      open();

      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );

      expect(close).toHaveBeenCalled();
    });

    it("closes when the page scrolls, but not right after opening", () => {
      vi.useFakeTimers();
      open();

      window.dispatchEvent(new Event("scroll"));
      expect(close).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      window.dispatchEvent(new Event("scroll"));
      expect(close).toHaveBeenCalled();
    });

    it.each([
      ["the window resizes", () => window.dispatchEvent(new Event("resize"))],
      [
        "the window loses the focus",
        () => window.dispatchEvent(new Event("blur")),
      ],
      [
        "spell check is turned off",
        () => (spellcheck.value = !spellcheck.value),
      ],
      ["the language changes", () => (language.value = "tr")],
    ])("closes when %s", (_, change) => {
      open();

      change();

      expect(close).toHaveBeenCalled();
    });

    it("doesn't close what isn't open", () => {
      window.dispatchEvent(new Event("resize"));
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );

      expect(close).not.toHaveBeenCalled();
    });
  });

  describe("native menu", () => {
    const contextmenu = (target: Element, init: MouseEventInit = {}) => {
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };

    it("hides the webview's menu outside text fields", () => {
      const input = document.body.appendChild(document.createElement("input"));

      expect(contextmenu(document.body)).toBe(true);
      expect(contextmenu(input)).toBe(false);
      expect(contextmenu(document.body, { shiftKey: true })).toBe(false);
    });

    it("hides it on the menu itself", () => {
      open();

      expect(contextmenu(row("add"))).toBe(true);
    });
  });

  describe("position", () => {
    it("opens above the anchor where there is no room below", () => {
      vi.spyOn(window, "innerHeight", "get").mockReturnValue(100);
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 70 }),
      );

      open();

      expect(menu()!.style.top).toBe("4px");
    });

    it("opens a submenu to the left where there is no room to the right", () => {
      vi.spyOn(window, "innerWidth", "get").mockReturnValue(300);
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 50, y: 10, width: 200, height: 20 }),
      );
      open();

      press("ArrowDown");
      press("ArrowRight");

      expect(submenu()!.style.left).toBe("4px");
    });
  });

  describe("formatShortcut", () => {
    const setPlatform = (platform: string) =>
      vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);

    it.each([
      ["Mod-z", "Ctrl+Z"],
      ["Mod-Shift-z", "Ctrl+Shift+Z"],
      ["Mod-Alt-s", "Ctrl+Alt+S"],
      ["Shift-F10", "Shift+F10"],
      ["Mod--", "Ctrl+-"],
    ])("shows %j as %j elsewhere", (binding, expected) => {
      setPlatform("Linux x86_64");

      expect(formatShortcut(binding)).toBe(expected);
    });

    it.each([
      ["Mod-z", "⌘Z"],
      ["Mod-Shift-z", "⇧⌘Z"],
      ["Mod-Alt-Shift-n", "⌥⇧⌘N"],
      ["Ctrl-a", "⌃A"],
    ])("shows %j as %j on macOS", (binding, expected) => {
      setPlatform("MacIntel");

      expect(formatShortcut(binding)).toBe(expected);
    });
  });
});

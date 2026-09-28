import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import {
  type ContextMenuRequest,
  contextMenu,
  language,
  type MenuItem,
  spellcheck,
} from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

/**
 * settle waits until Vue has rendered a change and the menu has focused what
 * it focuses after rendering: the menu queues its focus while it renders, so
 * one tick later than the render itself
 */
const settle = async () => {
  await nextTick();
  await nextTick();
};

const menu = () => document.querySelector<HTMLElement>("#context-menu");
const submenu = () => document.querySelector<HTMLElement>(".submenu");
const rows = (element = menu()) => [
  ...element!.querySelectorAll<HTMLElement>(
    '[role="menuitem"], [role="menuitemradio"]',
  ),
];
const row = (id: string) =>
  document.querySelector<HTMLElement>(`[data-id="${id}"]`)!;
const focusedId = () => (document.activeElement as HTMLElement)?.dataset.id;

const press = async (key: string, init: KeyboardEventInit = {}) => {
  const target = document.activeElement ?? document.body;
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

const open = async (
  keyboard = true,
  list = items(),
): Promise<ContextMenuRequest> => {
  const request: ContextMenuRequest = {
    items: list,
    anchor: { left: 10, top: 20, bottom: 40 },
    keyboard,
    close,
  };
  contextMenu.value = request;
  await settle();
  return request;
};

describe("contextMenu", () => {
  let dispose = () => {};
  beforeEach(() => {
    runs = [];
    close = vi.fn<() => void>(() => {
      contextMenu.value = null;
    });
    document.body.replaceChildren();
    contextMenu.value = null;
    dispose = bootApp(createTestHandle());
  });

  afterEach(() => {
    contextMenu.value = null;
    dispose();
  });

  it("removes the menu and stops listening when disposed", async () => {
    await open();
    dispose();
    dispose = () => {};

    expect(menu()).toBeNull();
    await open();
    expect(menu()).toBeNull();
  });

  it("renders a menu with items, separators and shortcuts", async () => {
    await open();

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

  it("marks the chosen one of a set of choices as a radio item", async () => {
    await open(true, [
      { id: "one", label: "1, 2, 3", checked: true, radio: true },
      { id: "roman", label: "i, ii, iii", checked: false, radio: true },
    ]);

    expect(rows().map((r) => r.getAttribute("role"))).toEqual([
      "menuitemradio",
      "menuitemradio",
    ]);
    expect(row("one").getAttribute("aria-checked")).toBe("true");
    expect(row("one").querySelector(".check")!.textContent).toBe("✓");
    expect(row("roman").getAttribute("aria-checked")).toBe("false");
  });

  it("focuses the first item when opened with the keyboard", async () => {
    await open(true);

    expect(focusedId()).toBe("wrong");
  });

  it("focuses no item when opened with the mouse", async () => {
    await open(false);

    expect(document.activeElement).toBe(menu());
    // like the system menus: up starts at the bottom, down at the top
    await press("ArrowUp");
    expect(focusedId()).toBe("undo");
    await open(false);
    await press("ArrowDown");
    expect(focusedId()).toBe("wrong");
  });

  it("moves with the arrow keys, skipping disabled items and wrapping", async () => {
    await open();

    await press("ArrowDown");
    expect(focusedId()).toBe("all");
    await press("ArrowDown");
    expect(focusedId()).toBe("add");
    await press("ArrowUp");
    expect(focusedId()).toBe("all");
    await press("End");
    expect(focusedId()).toBe("undo");
    await press("ArrowDown");
    expect(focusedId()).toBe("wrong");
    await press("ArrowUp");
    expect(focusedId()).toBe("undo");
    await press("Home");
    expect(focusedId()).toBe("wrong");
  });

  it("jumps to the next item starting with a typed letter", async () => {
    await open();

    await press("u");
    expect(focusedId()).toBe("undo");
    await press("A");
    expect(focusedId()).toBe("add");
    await press("x");
    expect(focusedId()).toBe("add");
    // shortcuts aren't letters to jump to: "u" would move to Undo
    await press("u", { ctrlKey: true });
    expect(focusedId()).toBe("add");
  });

  it("runs an item with Enter or Space after closing", async () => {
    await open();

    await press("Enter");
    expect(close).toHaveBeenCalled();
    expect(runs).toEqual(["wrong"]);

    await open();
    await press("u");
    await press(" ");
    expect(runs).toEqual(["wrong", "undo"]);
    expect(menu()).toBeNull();
  });

  it("does nothing on Enter without a focused item", async () => {
    await open(false);

    await press("Enter");
    await press("ArrowRight");

    expect(runs).toEqual([]);
    expect(menu()).not.toBeNull();
  });

  it("opens and closes submenus with the arrow keys", async () => {
    await open();
    await press("ArrowDown");

    await press("ArrowRight");
    expect(submenu()).not.toBeNull();
    expect(row("all").getAttribute("aria-expanded")).toBe("true");
    expect(focusedId()).toBe("all:wrong");
    await press("ArrowDown");
    expect(focusedId()).toBe("all:wring");

    await press("ArrowLeft");
    expect(submenu()).toBeNull();
    expect(row("all").getAttribute("aria-expanded")).toBe("false");
    expect(focusedId()).toBe("all");

    await press("Enter");
    await press("Escape");
    expect(submenu()).toBeNull();
    expect(menu()).not.toBeNull();

    await press("ArrowRight");
    await press("Enter");
    expect(runs).toEqual(["all:wrong"]);
  });

  it("closes a submenu opened by the mouse when the keys move on", async () => {
    await open(false);
    row("all").dispatchEvent(new MouseEvent("mouseenter"));
    await settle();
    expect(submenu()).not.toBeNull();

    await press("ArrowDown");

    expect(focusedId()).toBe("add");
    expect(submenu()).toBeNull();
    expect(row("all").getAttribute("aria-expanded")).toBe("false");
  });

  it("ignores ArrowRight on items without a submenu", async () => {
    await open();

    await press("ArrowRight");

    expect(submenu()).toBeNull();
  });

  it("closes with Escape or Tab", async () => {
    await open();
    await press("Escape");
    expect(close).toHaveBeenCalledTimes(1);

    await open();
    await press("Tab");
    expect(close).toHaveBeenCalledTimes(2);
  });

  it("follows the mouse", async () => {
    await open(false);

    row("loading").dispatchEvent(new MouseEvent("mouseenter"));

    await settle();
    expect(document.activeElement).toBe(menu());

    row("all").dispatchEvent(new MouseEvent("mouseenter"));

    await settle();
    expect(focusedId()).toBe("all");
    expect(submenu()).not.toBeNull();

    row("add").dispatchEvent(new MouseEvent("mouseenter"));

    await settle();
    expect(submenu()).toBeNull();

    row("loading").click();

    await settle();
    expect(runs).toEqual([]);

    row("add").click();

    await settle();
    expect(runs).toEqual(["add"]);
  });

  it("opens a submenu on click", async () => {
    await open(false);

    row("all").click();

    await settle();

    expect(focusedId()).toBe("all:wrong");
    row("all:wrong").click();
    await settle();
    expect(runs).toEqual(["all:wrong"]);
  });

  it("keeps the focus in the menu on mouse down", async () => {
    await open(false);
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });

    row("add").dispatchEvent(event);

    await settle();

    expect(event.defaultPrevented).toBe(true);
    expect(close).not.toHaveBeenCalled();
  });

  it("focuses the hovered item of a submenu", async () => {
    await open(false);
    row("all").dispatchEvent(new MouseEvent("mouseenter"));
    await settle();

    row("all:wring").dispatchEvent(new MouseEvent("mouseenter"));
    await settle();

    expect(focusedId()).toBe("all:wring");
    expect(submenu()).not.toBeNull();
  });

  // C13
  it("ignores ArrowLeft in the menu itself", async () => {
    await open();

    await press("ArrowLeft");

    expect(close).not.toHaveBeenCalled();
    expect(focusedId()).toBe("wrong");
  });

  // C14, C15, C16
  it.each(["ctrlKey", "altKey", "metaKey"])(
    "doesn't jump to a letter pressed with %s",
    async (modifier) => {
      await open();

      const event = await press("u", { [modifier]: true });

      expect(focusedId()).toBe("wrong");
      expect(event.defaultPrevented).toBe(false);
    },
  );

  // C18
  it("keeps the hovered item on an update", async () => {
    const request = await open();
    row("add").dispatchEvent(new MouseEvent("mouseenter"));
    await settle();

    contextMenu.value = { ...request, items: items() };
    await settle();

    expect(focusedId()).toBe("add");
  });

  // C19
  it("keeps the keys it handles away from the rest of the app", async () => {
    await open();
    const outside = vi.fn();
    window.addEventListener("keydown", outside);

    await press("ArrowDown");
    window.removeEventListener("keydown", outside);

    expect(outside).not.toHaveBeenCalled();
  });

  // C20
  it("closes the text field on an update", async () => {
    const request = await open();
    await press("e");
    await press("Enter");
    expect(row("edit").querySelector("input")).not.toBeNull();

    contextMenu.value = { ...request, items: items() };
    await settle();

    expect(row("edit").querySelector("input")).toBeNull();
    expect(focusedId()).toBe("edit");
  });

  // C21
  it("focuses the first item on an update that drops the focused one", async () => {
    const request = await open(false);
    await press("ArrowDown");
    expect(focusedId()).toBe("wrong");

    contextMenu.value = { ...request, items: items().slice(1) };
    await settle();

    expect(focusedId()).toBe("all");
  });

  // C22
  it("focuses the menu when the item the user moved to becomes disabled", async () => {
    const request = await open();
    await press("a");
    expect(focusedId()).toBe("add");

    contextMenu.value = {
      ...request,
      items: items().map((item) =>
        item !== "separator" && item.id === "add"
          ? { ...item, disabled: true }
          : item,
      ),
    };
    await settle();

    expect(document.activeElement).toBe(menu());
  });

  // C24
  it("doesn't close when the menu itself scrolls", async () => {
    vi.useFakeTimers();
    await open();
    vi.advanceTimersByTime(1000);

    menu()!.dispatchEvent(new Event("scroll"));
    await settle();

    expect(close).not.toHaveBeenCalled();
  });

  // C31
  it("closes the menu before it runs an item", async () => {
    let closedFirst = false;
    await open(true, [
      {
        id: "x",
        label: "X",
        run: () => (closedFirst = close.mock.calls.length === 1),
      },
    ]);

    await press("Enter");

    expect(closedFirst).toBe(true);
  });

  // L2, L13
  it("sets aria-expanded and aria-disabled only where they apply", async () => {
    await open();

    expect(row("wrong").hasAttribute("aria-expanded")).toBe(false);
    expect(row("wrong").hasAttribute("aria-disabled")).toBe(false);
    expect(row("all").getAttribute("aria-expanded")).toBe("false");
  });

  // L5, L6
  it("gives only the focused item a tab stop", async () => {
    await open();
    await press("ArrowDown");

    expect(row("all").getAttribute("tabindex")).toBe("0");
    expect(row("wrong").getAttribute("tabindex")).toBe("-1");
    expect(row("add").getAttribute("tabindex")).toBe("-1");
  });

  // L8
  it("moves when an update makes it higher", async () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return { width: 200, height: this.children.length * 10 } as DOMRect;
      },
    );
    const two: MenuItem[] = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
    ];
    const request = await open(true, two);
    // 20 high: below the anchor's bottom at 40
    expect(menu()!.style.top).toBe("42px");

    contextMenu.value = { ...request, items: items() };
    await settle();

    // 70 high: fits neither below nor above, so as far up as needed
    expect(menu()!.style.top).toBe(`${100 - 4 - 70}px`);
  });

  // L9
  it("lets a press in the text field place the cursor", async () => {
    await open();
    await press("e");
    await press("Enter");
    const event = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });

    row("edit").querySelector("input")!.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
  });

  // L14
  it("keeps the rows of an update", async () => {
    const request = await open();
    const add = row("add");

    contextMenu.value = { ...request, items: [...items()].reverse() };
    await settle();

    expect(row("add")).toBe(add);
  });

  // E5, E6
  it("selects the word to edit, and keeps Enter to itself", async () => {
    await open();
    await press("e");
    await press("Enter");
    const input = row("edit").querySelector("input")!;

    expect([input.selectionStart, input.selectionEnd]).toEqual([0, 5]);
    const event = new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  // E1 (probe: re-render while editing)
  it("keeps what was typed while the menu renders again", async () => {
    await open();
    await press("e");
    await press("Enter");
    const input = row("edit").querySelector("input")!;
    input.value = "typed";

    row("add").dispatchEvent(new MouseEvent("mouseenter"));
    await settle();

    expect(row("edit").querySelector("input")!.value).toBe("typed");
  });

  describe("editing", () => {
    const input = () => row("edit").querySelector("input")!;
    const type = async (key: string) => {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      input().dispatchEvent(event);
      await settle();
      return event;
    };

    it("edits the word in place", async () => {
      await open();
      await press("e");
      await press("Enter");

      expect(input().value).toBe("blank");
      expect(document.activeElement).toBe(input());
      input().value = "blanker";
      await type("x");
      expect(input()).not.toBeNull();
      await type("Enter");

      expect(close).toHaveBeenCalled();
      expect(runs).toEqual(["edit:blanker"]);
    });

    it("cancels with Escape and closes with Tab", async () => {
      await open();
      await press("e");
      await press("Enter");

      await type("Escape");
      expect(row("edit").querySelector("input")).toBeNull();
      expect(focusedId()).toBe("edit");
      expect(close).not.toHaveBeenCalled();

      await press("Enter");
      input().click();
      await settle();
      await type("Tab");
      expect(close).toHaveBeenCalled();
      expect(runs).toEqual([]);
    });
    it("lets the mouse move the focus while editing, and Esc give it back", async () => {
      await open();
      await press("e");
      await press("Enter");

      row("add").dispatchEvent(new MouseEvent("mouseenter"));
      await settle();
      expect(focusedId()).toBe("add");
      // the field stays until it's cancelled or submitted
      expect(input()).not.toBeNull();

      input().focus();
      await type("Escape");
      expect(row("edit").querySelector("input")).toBeNull();
      expect(focusedId()).toBe("edit");
    });

    it("closes a field in a submenu with the submenu", async () => {
      await open(true, [
        {
          id: "sub",
          label: "Sub",
          children: [
            {
              id: "word",
              label: "Word",
              edit: { value: "x", submit: vi.fn() },
            },
          ],
        },
        { id: "other", label: "Other", run: () => {} },
      ]);
      await press("ArrowRight");
      await press("Enter");
      expect(document.querySelector(".submenu input")).not.toBeNull();

      row("other").dispatchEvent(new MouseEvent("mouseenter"));
      await settle();
      expect(submenu()).toBeNull();
      expect(focusedId()).toBe("other");

      await press("ArrowUp");
      expect(focusedId()).toBe("sub");
      await press("ArrowRight");
      expect(document.querySelector(".submenu input")).toBeNull();
    });

    it("closes only once, even when the window blurs right after", async () => {
      await open();
      await press("e");
      await press("Enter");

      input().dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", cancelable: true }),
      );
      // before Vue has unmounted the menu and removed its listeners
      window.dispatchEvent(new Event("blur"));
      await settle();

      expect(close).toHaveBeenCalledTimes(1);
      expect(runs).toEqual(["edit:blank"]);
    });
  });

  describe("updates", () => {
    it("keeps the item the user moved to", async () => {
      const request = await open();
      await press("ArrowDown");
      await press("ArrowDown");

      contextMenu.value = { ...request, items: [...items()].reverse() };

      await settle();

      expect(focusedId()).toBe("add");
    });

    it("focuses the first item until the user moves", async () => {
      const request = await open();
      const loading: MenuItem[] = [
        { id: "loading", label: "Loading…", disabled: true },
        { id: "add", label: "Add", run: () => {} },
      ];
      contextMenu.value = { ...request, items: loading };
      await settle();
      expect(focusedId()).toBe("add");

      contextMenu.value = { ...request, items: items() };

      await settle();
      expect(focusedId()).toBe("wrong");
    });

    it("replaces the menu for another request", async () => {
      await open();
      await press("ArrowDown");

      close = vi.fn<() => void>(() => {
        contextMenu.value = null;
      });
      await open(false);

      expect(document.activeElement).toBe(menu());
      expect(document.querySelectorAll(".context-menu")).toHaveLength(1);
    });
  });

  describe("closing", () => {
    const before = { spellcheck: spellcheck.value, language: language.value };
    afterEach(() => {
      spellcheck.value = before.spellcheck;
      language.value = before.language;
    });

    it("closes on a mouse down outside", async () => {
      await open();

      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );

      await settle();

      expect(close).toHaveBeenCalled();
    });

    it("closes when the page scrolls, but not right after opening", async () => {
      vi.useFakeTimers();
      await open();

      window.dispatchEvent(new Event("scroll"));

      await settle();
      expect(close).not.toHaveBeenCalled();

      vi.advanceTimersByTime(1000);
      window.dispatchEvent(new Event("scroll"));
      await settle();
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
    ])("closes when %s", async (_, change) => {
      await open();

      change();

      await settle();

      expect(close).toHaveBeenCalled();
    });

    it("doesn't close what isn't open", async () => {
      window.dispatchEvent(new Event("resize"));
      await settle();
      document.body.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true }),
      );
      await settle();

      expect(close).not.toHaveBeenCalled();
    });
  });

  describe("the webview's menu", () => {
    const contextmenu = (target: Element, init: MouseEventInit = {}) => {
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };

    it("hides it on the menu itself", async () => {
      await open();

      expect(contextmenu(row("add"))).toBe(true);
    });
  });

  describe("position", () => {
    it("opens above the anchor where only there is room", async () => {
      vi.spyOn(window, "innerHeight", "get").mockReturnValue(50);
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 14 }),
      );

      await open();

      // above the anchor's top at 20
      expect(menu()!.style.top).toBe("4px");
    });

    it("moves up as far as needed where it fits neither below nor above", async () => {
      vi.spyOn(window, "innerHeight", "get").mockReturnValue(100);
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 0, y: 0, width: 200, height: 70 }),
      );

      await open();

      expect(menu()!.style.top).toBe("26px");
    });

    it("opens a submenu to the left where there is no room to the right", async () => {
      vi.spyOn(window, "innerWidth", "get").mockReturnValue(300);
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue(
        DOMRect.fromRect({ x: 50, y: 10, width: 200, height: 20 }),
      );
      await open();

      await press("ArrowDown");
      await press("ArrowRight");

      expect(submenu()!.style.left).toBe("4px");
    });
  });
});

describe("context menu check marks", () => {
  let dispose = () => {};

  beforeEach(() => {
    dispose = bootApp(createTestHandle());
  });

  afterEach(() => {
    contextMenu.value = null;
    dispose();
  });

  it("shows items that switch something on and off as checkboxes", async () => {
    contextMenu.value = {
      items: [
        { id: "on", label: "On", checked: true, run: () => {} },
        { id: "off", label: "Off", checked: false, run: () => {} },
        { id: "plain", label: "Plain", run: () => {} },
      ],
      anchor: { left: 0, top: 0, bottom: 0 },
      keyboard: true,
      close: () => {},
    };
    await settle();

    expect(row("on").getAttribute("role")).toBe("menuitemcheckbox");
    expect(row("on").getAttribute("aria-checked")).toBe("true");
    expect(row("on").querySelector(".check")!.textContent).toBe("✓");
    expect(row("off").getAttribute("aria-checked")).toBe("false");
    expect(row("off").querySelector(".check")!.textContent).toBe("");
    // the labels line up, so plain items get the column too
    expect(row("plain").getAttribute("role")).toBe("menuitem");
    expect(row("plain").querySelector(".check")).not.toBeNull();
  });
});

describe("context menu listeners", () => {
  it("removes every window listener it adds once it's closed", async () => {
    const dispose = bootApp(createTestHandle());
    const added = vi.spyOn(window, "addEventListener");
    const removed = vi.spyOn(window, "removeEventListener");
    contextMenu.value = {
      items: [{ id: "a", label: "A", run: () => {} }],
      anchor: { left: 0, top: 0, bottom: 0 },
      keyboard: true,
      close: () => (contextMenu.value = null),
    };
    await settle();
    const listeners = added.mock.calls.map(([type, listener]) => [
      type,
      listener,
    ]);
    expect(listeners.map(([type]) => type).sort()).toEqual([
      "blur",
      "mousedown",
      "resize",
      "scroll",
    ]);

    await press("Escape");

    for (const [type, listener] of listeners) {
      expect(removed).toHaveBeenCalledWith(type, listener, expect.anything());
    }
    dispose();
  });
});

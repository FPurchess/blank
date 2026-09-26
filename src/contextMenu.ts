import {
  type ContextMenuRequest,
  contextMenu,
  language,
  type MenuItem,
  spellcheck,
} from "./state";
import { isMac } from "./editor/plugins/openLink";

const MENU_ID = "context-menu";
// space between the menu and the edges of the window
const MARGIN = 4;

type Item = Exclude<MenuItem, "separator">;

interface Level {
  element: HTMLElement;
  items: MenuItem[];
  rows: HTMLElement[];
  // the index of the focused item, or -1 if none is
  index: number;
}

let request: ContextMenuRequest | null = null;
let levels: Level[] = [];
// the user moved the focus, so an update keeps it where it is
let moved = false;
let unsubscribers: (() => void)[] = [];
// opening the menu for the next misspelling scrolls to it, which mustn't
// close the menu right away
let openedAt = -Infinity;
const SCROLL_GRACE = 500;

/**
 * formatShortcut returns a key binding like "Mod-Shift-z" as the platform
 * shows it: "⇧⌘Z" on macOS, "Ctrl+Shift+Z" elsewhere
 */
export const formatShortcut = (binding: string) => {
  const parts = binding.split(/-(?!$)/);
  const key = parts.pop()!;
  const mac = isMac();
  const names: Record<string, [string, string]> = {
    Mod: ["⌘", "Ctrl"],
    Ctrl: ["⌃", "Ctrl"],
    Alt: ["⌥", "Alt"],
    Shift: ["⇧", "Shift"],
    Meta: ["⌘", "Meta"],
  };
  const order = ["Ctrl", "Alt", "Shift", "Mod", "Meta"];
  const modifiers = parts
    .sort((a, b) => (mac ? order.indexOf(a) - order.indexOf(b) : 0))
    .map((part) => names[part]?.[mac ? 0 : 1] ?? part);
  const name = key.length === 1 ? key.toUpperCase() : key;
  return mac ? modifiers.join("") + name : [...modifiers, name].join("+");
};

const isItem = (item: MenuItem): item is Item => item !== "separator";

const enabled = (level: Level, index: number) => {
  const item = level.items[index];
  return isItem(item) && !item.disabled;
};

const close = () => request?.close();

/**
 * focusRow focuses the item at `index` of `level`
 */
const focusRow = (level: Level, index: number) => {
  level.index = index;
  level.rows.forEach((row, i) => (row.tabIndex = i === index ? 0 : -1));
  if (index >= 0) level.rows[index].focus();
  else level.element.focus();
};

/**
 * step returns the next enabled item from `index` in `direction`, wrapping
 * around
 */
const step = (level: Level, index: number, direction: 1 | -1) => {
  const count = level.items.length;
  for (let i = 1; i <= count; i++) {
    const next = (((index + direction * i) % count) + count) % count;
    if (enabled(level, next)) return next;
  }
  return index;
};

const first = (level: Level) => step(level, -1, 1);

/**
 * place moves `element` below `anchor`, or above it if it only fits there,
 * or else as far up as it needs to fit, like the system menus. A submenu opens
 * next to the item `side`.
 */
const place = (
  element: HTMLElement,
  anchor: { left: number; top: number; bottom: number },
  side?: DOMRect,
) => {
  const { width, height } = element.getBoundingClientRect();
  const bottom = window.innerHeight - MARGIN;
  let left = side ? side.right : anchor.left;
  let top = side ? side.top : anchor.bottom + 2;
  if (side && left + width > window.innerWidth - MARGIN) {
    left = side.left - width;
  }
  if (top + height > bottom) {
    const above = anchor.top - height - 2;
    top = !side && above >= MARGIN ? above : bottom - height;
  }
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - MARGIN - width));
  top = Math.max(MARGIN, top);
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
};

const closeSubmenus = (depth: number) => {
  for (const level of levels.splice(depth + 1)) {
    level.element.remove();
    const parent = levels[depth];
    parent?.rows[parent.index]?.setAttribute("aria-expanded", "false");
  }
};

/**
 * edit turns the row of `item` into a text field
 */
const edit = (level: Level, index: number, item: Item) => {
  const row = level.rows[index];
  const input = document.createElement("input");
  input.type = "text";
  input.value = item.edit!.value;
  input.spellcheck = false;
  input.autocomplete = "off";
  input.setAttribute("aria-label", item.label);
  row.replaceChildren(input);
  input.addEventListener("keydown", (event) => {
    event.stopPropagation();
    if (event.key === "Enter") {
      event.preventDefault();
      const value = input.value;
      close();
      item.edit!.submit(value);
    } else if (event.key === "Escape") {
      event.preventDefault();
      row.replaceChildren(...rowContent(item));
      focusRow(level, index);
    } else if (event.key === "Tab") {
      event.preventDefault();
      close();
    }
  });
  input.addEventListener("click", (event) => event.stopPropagation());
  input.focus();
  input.select();
};

/**
 * activate runs the item at `index` of the level at `depth`
 */
const activate = (depth: number, index: number) => {
  const level = levels[depth];
  const item = level.items[index];
  if (!isItem(item) || item.disabled) return;
  if (item.children) {
    openSubmenu(depth, index);
    focusRow(levels[depth + 1], first(levels[depth + 1]));
  } else if (item.edit) {
    edit(level, index, item);
  } else {
    close();
    item.run?.();
  }
};

const rowContent = (item: Item) => {
  const label = document.createElement("span");
  label.className = "label";
  label.textContent = item.label;
  const nodes: Node[] = [label];
  if (item.shortcut) {
    const kbd = document.createElement("kbd");
    kbd.textContent = formatShortcut(item.shortcut);
    nodes.push(kbd);
  }
  if (item.children) {
    const more = document.createElement("span");
    more.className = "more";
    more.textContent = "›";
    more.setAttribute("aria-hidden", "true");
    nodes.push(more);
  }
  return nodes;
};

/**
 * renderLevel renders a menu of `items` at `depth`
 */
const renderLevel = (items: MenuItem[], depth: number): Level => {
  const element = document.createElement("div");
  element.className = depth ? "context-menu submenu" : "context-menu";
  if (!depth) element.id = MENU_ID;
  element.setAttribute("role", "menu");
  element.tabIndex = -1;
  const level: Level = { element, items, rows: [], index: -1 };

  items.forEach((item, index) => {
    const row = document.createElement("div");
    if (!isItem(item)) {
      row.setAttribute("role", "separator");
      level.rows.push(row);
      element.append(row);
      return;
    }
    row.setAttribute("role", "menuitem");
    row.dataset.id = item.id;
    row.tabIndex = -1;
    if (item.disabled) row.setAttribute("aria-disabled", "true");
    if (item.children) {
      row.setAttribute("aria-haspopup", "menu");
      row.setAttribute("aria-expanded", "false");
    }
    row.replaceChildren(...rowContent(item));
    row.addEventListener("mouseenter", () => {
      if (!enabled(level, index)) return;
      moved = true;
      closeSubmenus(depth);
      focusRow(level, index);
      if (item.children) openSubmenu(depth, index);
    });
    row.addEventListener("click", (event) => {
      event.stopPropagation();
      activate(depth, index);
    });
    level.rows.push(row);
    element.append(row);
  });

  element.addEventListener("keydown", (event) => onKeyDown(event, depth));
  // keep the focus in the menu, which a click would otherwise move
  element.addEventListener("mousedown", (event) => {
    if (!(event.target instanceof HTMLInputElement)) event.preventDefault();
  });
  element.addEventListener("contextmenu", (event) => event.preventDefault());
  return level;
};

/**
 * openSubmenu opens the submenu of the item at `index` of the level at `depth`
 */
const openSubmenu = (depth: number, index: number) => {
  closeSubmenus(depth);
  const parent = levels[depth];
  const item = parent.items[index] as Item;
  const level = renderLevel(item.children!, depth + 1);
  document.body.append(level.element);
  place(
    level.element,
    request!.anchor,
    parent.rows[index].getBoundingClientRect(),
  );
  parent.rows[index].setAttribute("aria-expanded", "true");
  levels.push(level);
};

const onKeyDown = (event: KeyboardEvent, depth: number) => {
  const level = levels[depth];
  if (!level) return;
  const { key } = event;
  const handled = () => {
    event.preventDefault();
    event.stopPropagation();
  };

  if (key === "ArrowDown" || key === "ArrowUp") {
    handled();
    moved = true;
    const direction = key === "ArrowDown" ? 1 : -1;
    const from = level.index < 0 && direction === -1 ? 0 : level.index;
    focusRow(level, step(level, from, direction));
  } else if (key === "Home" || key === "End") {
    handled();
    moved = true;
    focusRow(level, key === "Home" ? first(level) : step(level, 0, -1));
  } else if (key === "ArrowRight") {
    handled();
    const item = level.items[level.index];
    if (level.index >= 0 && isItem(item) && item.children) {
      activate(depth, level.index);
    }
  } else if (key === "ArrowLeft" || key === "Escape") {
    handled();
    if (depth > 0) {
      closeSubmenus(depth - 1);
      const parent = levels[depth - 1];
      focusRow(parent, parent.index);
    } else if (key === "Escape") {
      close();
    }
  } else if (key === "Enter" || key === " ") {
    handled();
    if (level.index >= 0) activate(depth, level.index);
  } else if (key === "Tab") {
    handled();
    close();
  } else if (
    key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    handled();
    // jump to the next item starting with the typed letter
    const letter = key.toLowerCase();
    const count = level.items.length;
    for (let i = 1; i <= count; i++) {
      const next = (level.index + i + count) % count;
      const item = level.items[next];
      if (
        enabled(level, next) &&
        isItem(item) &&
        item.label.toLowerCase().startsWith(letter)
      ) {
        moved = true;
        focusRow(level, next);
        break;
      }
    }
  }
};

const remove = () => {
  levels.forEach((level) => level.element.remove());
  levels = [];
  document.getElementById(MENU_ID)?.remove();
};

/**
 * render shows `next`, or updates the open menu if `next` belongs to it,
 * keeping the focused item
 */
const render = (next: ContextMenuRequest | null) => {
  const update =
    next !== null && request !== null && next.close === request.close;
  const focused = update ? levels[0]?.items[levels[0].index] : undefined;
  const focusedId = focused && isItem(focused) ? focused.id : undefined;
  const hadFocus = update && levels[0]?.index >= 0;
  remove();
  request = next;
  if (!next) return;
  if (!update) {
    moved = false;
    openedAt = Date.now();
  }

  const level = renderLevel(next.items, 0);
  document.body.append(level.element);
  place(level.element, next.anchor);
  levels = [level];

  let index = -1;
  if (focusedId !== undefined && moved) {
    index = next.items.findIndex(
      (item) => isItem(item) && item.id === focusedId,
    );
  }
  if (index < 0 && (next.keyboard || hadFocus)) index = first(level);
  focusRow(level, index >= 0 && enabled(level, index) ? index : -1);
};

const outside = (event: Event) =>
  !levels.some(
    (level) =>
      event.target instanceof Node && level.element.contains(event.target),
  );

/**
 * bootContextMenu renders the context menu whenever `contextMenu` holds a
 * request, and keeps the webview's own menu from showing up elsewhere
 */
export const bootContextMenu = () => {
  unsubscribers.forEach((unsubscribe) => unsubscribe());
  const listen = <K extends keyof WindowEventMap>(
    type: K,
    listener: (event: WindowEventMap[K]) => void,
    capture = true,
  ) => {
    window.addEventListener(type, listener, capture);
    return () => window.removeEventListener(type, listener, capture);
  };
  const closeOnChange = () => {
    if (request) close();
  };

  unsubscribers = [
    contextMenu.subscribe(render, { immediate: true }),
    spellcheck.subscribe(closeOnChange),
    language.subscribe(closeOnChange),
    listen("mousedown", (event) => {
      if (request && outside(event)) close();
    }),
    listen("scroll", (event) => {
      const settled = Date.now() - openedAt > SCROLL_GRACE;
      if (request && settled && outside(event)) close();
    }),
    listen("resize", closeOnChange),
    listen("blur", closeOnChange, false),
    // the menus of the webview offer reload and back, which lose the text.
    // Text fields keep theirs, and Shift + right click shows it anyway.
    // in the bubble phase, since the editor ignores prevented events
    listen(
      "contextmenu",
      (event) => {
        const target = event.target instanceof Element ? event.target : null;
        if (event.shiftKey || target?.closest("input, textarea")) return;
        event.preventDefault();
      },
      false,
    ),
  ];
};

import { nextTick, shallowRef, watch } from "vue";

import type { ContextMenuRequest, MenuLine } from "../../state";
import {
  activeItem,
  enabledAt,
  firstColumn,
  firstEnabled,
  indexAfterUpdate,
  isEntry,
  isRow,
  lastEnabled,
  rowStep,
  step,
  typeahead,
} from "../menuModel";

// A level of an open menu: the menu itself, or a submenu
export interface MenuLevel {
  items: readonly MenuLine[];
  // the focused line, or -1 while the menu itself has the focus
  index: number;
  // the focused item of a row
  column: number;
  // the row a submenu opens next to
  side: DOMRect | null;
}

// what a level's list (MenuList.vue) lets the levels do with it
export interface MenuListHandle {
  depth: number;
  focus(index: number, column: number): void;
  rowRect(index: number): DOMRect;
}

export interface MenuLevelOptions {
  // the lines of the menu itself, e.g. what a search found, its items else
  levelZero?: () => readonly MenuLine[];
  // whether the focus stays in a search above the menu while its lines show
  // which is focused (aria-activedescendant), and what gives it the focus
  searching?: () => boolean;
  focusSearch?: () => void;
  // a letter typed in the menu, which a search takes, instead of jumping to
  // an item starting with it
  onPrintable?: (key: string) => void;
}

/**
 * useMenuLevels holds the levels of an open menu (ContextMenu.vue) and which
 * one has the focus: the arrows move it, through rows too, Enter or Space
 * run an item, → and ← open and close submenus, a letter jumps to an item,
 * Esc and Tab close it, and an item can turn into a text field. A request
 * of the open menu updates it, keeping the item the user moved to.
 * @param lists the rendered levels, to focus and measure them
 */
export const useMenuLevels = (
  request: () => ContextMenuRequest,
  lists: () => readonly MenuListHandle[] | null | undefined,
  options: MenuLevelOptions = {},
) => {
  const levelZero = () => options.levelZero?.() ?? request().items;
  const searchFirst = () => !!options.focusSearch;
  // the user moved the focus, so an update keeps it where it is
  let moved = false;

  const initial = request();
  const levels = shallowRef<MenuLevel[]>([
    {
      items: levelZero(),
      index:
        initial.keyboard && !searchFirst() ? firstEnabled(initial.items) : -1,
      column: 0,
      side: null,
    },
  ]);
  const focusDepth = shallowRef(0);
  const editing = shallowRef<{ depth: number; index: number } | null>(null);

  // closes the menu once: the listeners stay until Vue has unmounted it, so
  // a blur right after an item ran mustn't close it again
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    request().close();
  };

  const listAt = (depth: number) => lists()?.find((l) => l.depth === depth);

  /**
   * focusCurrent focuses the focused item of the level that has the focus,
   * once Vue has rendered it; the search, while it keeps the focus
   */
  const focusCurrent = () =>
    nextTick(() => {
      const depth = focusDepth.value;
      const level = levels.value[depth];
      if (
        depth === 0 &&
        options.focusSearch &&
        (options.searching?.() || level.index < 0)
      )
        return options.focusSearch();
      listAt(depth)?.focus(level.index, level.column);
    });

  /**
   * show replaces the levels, gives `depth` the focus and focuses it
   */
  const show = (next: MenuLevel[], depth: number) => {
    // a field in a submenu that closes goes with it
    if (editing.value && editing.value.depth >= next.length)
      editing.value = null;
    levels.value = next;
    focusDepth.value = depth;
    void focusCurrent();
  };

  const withIndex = (depth: number, index: number, column: number) =>
    levels.value
      .slice(0, depth + 1)
      .map((level, d) => (d === depth ? { ...level, index, column } : level));

  /**
   * focusItem focuses the line at `index` of `depth`, at `column` of a row,
   * closing its submenus
   */
  const focusItem = (
    depth: number,
    index: number,
    column = firstColumn(levels.value[depth].items[index]),
  ) => show(withIndex(depth, index, column), depth);

  /**
   * openSubmenu opens the submenu of the item at `index` of `depth`, and
   * gives it the focus if `enter` is set
   */
  const openSubmenu = (depth: number, index: number, enter: boolean) => {
    const item = levels.value[depth].items[index];
    if (!isEntry(item) || !item.children) return;
    const submenu: MenuLevel = {
      items: item.children,
      index: enter ? firstEnabled(item.children) : -1,
      column: 0,
      side: listAt(depth)!.rowRect(index),
    };
    show([...withIndex(depth, index, 0), submenu], enter ? depth + 1 : depth);
  };

  /**
   * activate runs the item at `index` of `depth` (at `column` of a row):
   * opens its submenu, turns it into a text field, or runs it, closing the
   * menu unless the item stays
   */
  const activate = (
    depth: number,
    index: number,
    column = levels.value[depth].column,
  ) => {
    const item = activeItem(levels.value[depth].items, index, column);
    if (!item || item.disabled) return;
    if (item.children) {
      openSubmenu(depth, index, true);
    } else if (item.edit) {
      // the field focuses itself; the mouse and Esc move the focus away
      editing.value = { depth, index };
      levels.value = withIndex(depth, index, column);
      focusDepth.value = depth;
    } else if (item.stays) {
      moved = true;
      focusItem(depth, index, column);
      item.run?.();
    } else {
      close();
      item.run?.();
    }
  };

  const hover = (depth: number, index: number, column = 0) => {
    const items = levels.value[depth].items;
    const item = activeItem(items, index, column);
    if (!item || item.disabled || !enabledAt(items, index)) return;
    moved = true;
    if (item.children) openSubmenu(depth, index, false);
    else focusItem(depth, index, column);
  };

  /**
   * moveBy moves the focus of `depth` to the next enabled line in
   * `direction`, wrapping around
   */
  const moveBy = (depth: number, direction: 1 | -1) => {
    const { items, index } = levels.value[depth];
    moved = true;
    const from = index < 0 && direction === -1 ? 0 : index;
    focusItem(depth, step(items, from, direction));
  };

  const onKey = (depth: number, event: KeyboardEvent) => {
    const level = levels.value[depth];
    if (!level) return;
    const { key } = event;
    const handled = () => {
      event.preventDefault();
      event.stopPropagation();
    };
    const { items, index, column } = level;
    const line = items[index];

    if (key === "ArrowDown" || key === "ArrowUp") {
      handled();
      moveBy(depth, key === "ArrowDown" ? 1 : -1);
    } else if (key === "Home" || key === "End") {
      handled();
      moved = true;
      focusItem(
        depth,
        key === "Home" ? firstEnabled(items) : lastEnabled(items),
      );
    } else if (
      isRow(line) &&
      (key === "ArrowRight" || key === "ArrowLeft") &&
      rowStep(line, column, key === "ArrowRight" ? 1 : -1) !== column
    ) {
      handled();
      moved = true;
      focusItem(
        depth,
        index,
        rowStep(line, column, key === "ArrowRight" ? 1 : -1),
      );
    } else if (key === "ArrowRight") {
      handled();
      if (index >= 0 && isEntry(line) && line.children) activate(depth, index);
    } else if (key === "ArrowLeft" || key === "Escape") {
      handled();
      if (depth > 0) {
        const parent = levels.value[depth - 1];
        focusItem(depth - 1, parent.index, parent.column);
      } else if (key === "Escape") close();
    } else if (key === "Enter" || key === " ") {
      handled();
      if (index >= 0) activate(depth, index);
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
      if (depth === 0 && options.onPrintable) return options.onPrintable(key);
      const next = typeahead(items, index, key);
      if (next !== null) {
        moved = true;
        focusItem(depth, next);
      }
    }
  };

  const submitEdit = (depth: number, value: string) => {
    const item = levels.value[depth].items[editing.value!.index];
    close();
    if (isEntry(item)) item.edit?.submit(value);
  };

  const cancelEdit = () => {
    const { depth, index } = editing.value!;
    editing.value = null;
    focusItem(depth, index);
  };

  /**
   * showLevelZero shows the menu's own lines anew, e.g. what a new search
   * found, the first one focused if `first`
   */
  const showLevelZero = (first: boolean) => {
    const items = levelZero();
    const index = first ? firstEnabled(items) : -1;
    show([{ items, index, column: firstColumn(items[index]), side: null }], 0);
  };

  // a request of the open menu, e.g. once the suggestions for a misspelling
  // are known or a switch of the main menu changed, updates it: the item the
  // user moved to keeps the focus, submenus and a text field close
  watch(request, (next) => {
    const { items, index, column } = levels.value[0];
    editing.value = null;
    const lines = levelZero();
    const kept = indexAfterUpdate(
      items,
      index,
      moved,
      { items: lines, keyboard: next.keyboard && !searchFirst() },
      column,
    );
    show([{ items: lines, ...kept, side: null }], 0);
  });

  return {
    levels,
    focusDepth,
    editing,
    close,
    focusCurrent,
    focusItem,
    moveBy,
    activate,
    hover,
    onKey,
    submitEdit,
    cancelEdit,
    showLevelZero,
  };
};

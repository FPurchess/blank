import { CommandIdentifier, getKeyBinding } from "../config";
import { commandLabel } from "../commandList";
import type { MenuItem, Tab } from "../state";
import { dropAt, movedBy } from "./dragModel";
import { scrollFor } from "./pageViewModel";
import { stepTo } from "./rovingModel";

// The tab row (TabRow.vue): what a key, a click and a drag on a tab do, its
// menu, and how the row fits the window.

// what a key on a focused tab does: move the focus to another tab, or act on
// this one
export type TabKey =
  { move: number } | "activate" | "close" | "menu" | "leave" | null;

/**
 * tabKey returns what `key` does on the tab at `index` of `count`: the
 * arrows, Home and End move the focus, Enter and Space show the tab, Delete
 * closes it, Shift+F10 opens its menu and Esc goes back to the text
 */
export const tabKey = (
  key: string,
  shift: boolean,
  index: number,
  count: number,
): TabKey => {
  const to = stepTo(key, index, count);
  if (to !== undefined) return { move: to };
  if (key === "Enter" || key === " ") return "activate";
  if (key === "Delete") return "close";
  if (key === "ContextMenu" || (shift && key === "F10")) return "menu";
  if (key === "Escape") return "leave";
  return null;
};

/**
 * middleCloses is whether a middle click closes a tab: let go over the tab
 * it was pressed on
 */
export const middleCloses = (pressed: string | null, released: string | null) =>
  pressed !== null && pressed === released;

// the room the Blocks button's name takes, with some to spare, so the name
// doesn't come and go while the window is resized around the limit
const LABEL_ROOM = 72;

/**
 * compactBlocks is whether the Blocks button shows only its icon: once the
 * tabs need the room, until there is room for its name again
 * @param overflow whether the tabs don't fit their list
 * @param spare the empty room the row has left
 */
export const compactBlocks = (
  compact: boolean,
  overflow: boolean,
  spare: number,
) => overflow || (compact && spare < LABEL_ROOM);

/**
 * scrollLeftFor returns where to scroll the list of tabs so that the tab
 * `left` px from its start and `width` wide shows, or null if it does
 */
export const scrollLeftFor = (
  left: number,
  width: number,
  scrollLeft: number,
  listWidth: number,
) =>
  scrollFor({ top: left, height: width }, scrollLeft, listWidth, {
    above: 8,
    below: 8,
  });

/**
 * dragBy returns by how many places the tab at `index` moves when dragged
 * to `x`: to the nearest of the lines between the tabs
 * @param edges the left edge of each tab, and the right edge of the last
 */
export const dragBy = (edges: readonly number[], index: number, x: number) =>
  movedBy([index, index + 1], dropAt(edges, [index, index + 1], x, 0));

// what the menu of a tab does, by the tab's id
export interface TabActions {
  close(id: string): void;
  closeOthers(id: string): void;
  closeRight(id: string): void;
  save(id: string, force: boolean): void;
  copyPath(path: string): void;
}

/**
 * tabMenu returns the menu of `tab`, the tab at `index` of `count`
 */
export const tabMenu = (
  tab: Tab,
  index: number,
  count: number,
  actions: TabActions,
): MenuItem[] => {
  const C = CommandIdentifier;
  return [
    {
      id: "close",
      label: "Close",
      icon: "x",
      shortcut: getKeyBinding(C.TAB_CLOSE),
      run: () => actions.close(tab.id),
    },
    {
      id: "close-others",
      label: "Close others",
      disabled: count < 2,
      run: () => actions.closeOthers(tab.id),
    },
    {
      id: "close-right",
      label: "Close to the right",
      disabled: index === count - 1,
      run: () => actions.closeRight(tab.id),
    },
    "separator",
    {
      id: "save",
      label: commandLabel(C.FILE_SAVE),
      icon: "save",
      shortcut: getKeyBinding(C.FILE_SAVE),
      run: () => actions.save(tab.id, false),
    },
    {
      id: "save-as",
      label: commandLabel(C.FILE_SAVE_AS),
      shortcut: getKeyBinding(C.FILE_SAVE_AS),
      run: () => actions.save(tab.id, true),
    },
    ...(tab.path === null
      ? []
      : [
          "separator" as const,
          {
            id: "copy-path",
            label: "Copy path",
            icon: "copy",
            run: () => actions.copyPath(tab.path!),
          },
        ]),
  ];
};

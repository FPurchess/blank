import { CommandIdentifier, getKeyBinding } from "../config";
import { commandItem } from "../commandList";
import type { MenuItem, Tab } from "../state";
import { scrollFor } from "./scrollModel";
import { stepTo } from "./rovingModel";

// The tab row (TabRow.vue): what a key, a click and a drag on a tab do, its
// menu, and how the row fits the window.

// what a key on a focused tab does: move the focus to another tab, or act on
// this one
export type TabKey =
  { move: number } | "activate" | "close" | "menu" | "leave" | null;

/**
 * tabKey returns what the key of `event` does on the tab at `index` of
 * `count`: the arrows, Home and End move the focus, Enter and Space show the
 * tab, Delete closes it, Shift+F10 opens its menu and Esc goes back to the
 * text. With Ctrl, Alt or Meta it does none of these, so the window's
 * commands get it.
 */
export const tabKey = (
  event: Pick<
    KeyboardEvent,
    "key" | "shiftKey" | "ctrlKey" | "altKey" | "metaKey"
  >,
  index: number,
  count: number,
): TabKey => {
  const { key, shiftKey } = event;
  if (event.ctrlKey || event.altKey || event.metaKey) return null;
  if (shiftKey) return key === "F10" ? "menu" : null;
  const to = stepTo(key, index, count);
  if (to !== undefined) return { move: to };
  if (key === "Enter" || key === " ") return "activate";
  if (key === "Delete") return "close";
  if (key === "ContextMenu") return "menu";
  if (key === "Escape") return "leave";
  return null;
};

/**
 * middleCloses is whether a middle click closes a tab: let go over the tab
 * it was pressed on
 */
export const middleCloses = (pressed: string | null, released: string | null) =>
  pressed !== null && pressed === released;

// room to spare beyond the Blocks button's name, so the name doesn't come
// and go while the window is resized around the limit
const LABEL_SPARE = 16;

/**
 * compactBlocks is whether the Blocks button shows only its icon: once the
 * tabs need the room, until there is room for its name again
 * @param overflow whether the tabs don't fit their list
 * @param spare the empty room the row has left
 * @param label the width the name takes
 */
export const compactBlocks = (
  compact: boolean,
  overflow: boolean,
  spare: number,
  label: number,
) => overflow || (compact && spare < label + LABEL_SPARE);

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

// what the menu of a tab does, by the tab's id
export interface TabActions {
  close(id: string): void;
  closeOthers(id: string): void;
  closeRight(id: string): void;
  save(id: string, force: boolean): void;
  // shows the tab and opens its print dialog
  print(id: string): void;
  copyPath(path: string): void;
}

/**
 * tabMenu returns the menu of `tab`, the tab at `index` of `count`. Only the
 * shown tab's menu names the keys, which act on the shown tab.
 * @param printable whether Blank can print, which needs the page layout
 */
export const tabMenu = (
  tab: Tab,
  index: number,
  count: number,
  shown: boolean,
  actions: TabActions,
  printable: boolean,
): MenuItem[] => {
  const C = CommandIdentifier;
  const key = (command: CommandIdentifier) =>
    shown ? getKeyBinding(command) : undefined;
  // the keys act on the shown tab, so only its menu names them
  const keys = shown ? {} : { shortcut: undefined };
  return [
    {
      id: "close",
      label: "Close",
      icon: "x",
      shortcut: key(C.TAB_CLOSE),
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
    commandItem("save", C.FILE_SAVE, {
      icon: "save",
      ...keys,
      run: () => actions.save(tab.id, false),
    }),
    commandItem("save-as", C.FILE_SAVE_AS, {
      ...keys,
      run: () => actions.save(tab.id, true),
    }),
    commandItem("print", C.FILE_PRINT, {
      ...keys,
      disabled: !printable,
      run: () => actions.print(tab.id),
    }),
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

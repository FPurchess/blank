import { Plugin, TextSelection, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { config } from "../../config";
import {
  contextMenu,
  spellchecker,
  type ContextMenuRequest,
} from "../../state";
import { words } from "../../spellcheck/tokenize";
import { buildMenu, type MenuTarget } from "../contextMenu/model";
import { type Misspelling, misspellingAt } from "./spellcheck";

// how long after the keyboard opened the menu the browser's own contextmenu
// event is ignored, which some webviews send for the same key press
const KEYBOARD_EVENT_WINDOW = 500;

let openedByKeyboardAt = -Infinity;

/**
 * wordAt returns the word at `pos`, if any
 */
const wordAt = (state: EditorState, pos: number): Misspelling | undefined => {
  const $pos = state.doc.resolve(pos);
  if (!$pos.parent.isTextblock) return;
  const found = words(
    $pos.parent,
    $pos.start(),
    spellchecker.value?.tag ?? "en",
    config.value.spellcheck,
  ).find((word) => word.from <= pos && pos <= word.to);
  return found && { from: found.from, to: found.to, word: found.text };
};

/**
 * targetAt returns what the menu at `pos` acts on
 */
const targetAt = (state: EditorState, pos: number): MenuTarget => {
  const checker = spellchecker.value;
  if (!checker) return {};
  const misspelling = misspellingAt(state, pos);
  if (misspelling) return { misspelling };
  const word = wordAt(state, pos);
  const entry = word && checker.userEntry(word.word);
  return entry && word ? { userWord: { ...word, entry } } : {};
};

/**
 * prefetch starts looking up the suggestions for the misspelled word at `pos`,
 * so the menu shows them right away
 */
export const prefetch = (state: EditorState, pos: number) => {
  const misspelling = misspellingAt(state, pos);
  if (misspelling)
    spellchecker.value?.suggest(misspelling.word).catch(() => {});
};

/**
 * openContextMenu opens the context menu for the word at `pos`, below `anchor`
 * or below the word if there is no anchor
 */
export const openContextMenu = (
  view: EditorView,
  pos: number,
  {
    anchor,
    keyboard,
  }: { anchor?: ContextMenuRequest["anchor"]; keyboard: boolean },
) => {
  if (keyboard) openedByKeyboardAt = Date.now();
  const target = targetAt(view.state, pos);
  const at = target.misspelling?.from ?? pos;
  let where = anchor;
  if (!where) {
    try {
      const coords = view.coordsAtPos(at);
      where = { left: coords.left, top: coords.top, bottom: coords.bottom };
    } catch {
      where = { left: 0, top: 0, bottom: 0 };
    }
  }

  const close = () => {
    if (contextMenu.value?.close === close) contextMenu.value = null;
    view.focus();
  };
  const request = (target: MenuTarget): ContextMenuRequest => ({
    items: buildMenu(view, target),
    anchor: where,
    keyboard,
    close,
  });
  contextMenu.value = request(target);

  const { misspelling } = target;
  const checker = spellchecker.value;
  if (misspelling && checker) {
    const show = (suggestions: string[]) => {
      // unless the menu was closed or replaced meanwhile
      if (contextMenu.value?.close === close) {
        contextMenu.value = request({ misspelling, suggestions });
      }
    };
    checker.suggest(misspelling.word).then(show, () => show([]));
  }
};

/**
 * contextMenuPlugin shows Blank's context menu instead of the webview's. Shift
 * + right click still shows the webview's menu, e.g. for system services.
 */
export const contextMenuPlugin = () =>
  new Plugin({
    props: {
      handleDOMEvents: {
        mousedown: (view, event) => {
          if (event.button !== 2) return false;
          const found = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          if (found) prefetch(view.state, found.pos);
          return false;
        },
        contextmenu: (view, event) => {
          if (event.shiftKey) return false;
          event.preventDefault();
          // the keyboard shortcut already opened the menu
          if (Date.now() - openedByKeyboardAt < KEYBOARD_EVENT_WINDOW) {
            return true;
          }

          // the ContextMenu key: at the cursor, like the keyboard shortcut
          if (
            event.button !== 2 &&
            event.clientX === 0 &&
            event.clientY === 0
          ) {
            openContextMenu(view, view.state.selection.head, {
              keyboard: true,
            });
            return true;
          }

          const found = view.posAtCoords({
            left: event.clientX,
            top: event.clientY,
          });
          if (!found) return true;
          const { from, to } = view.state.selection;
          // keep a selection clicked into, as the menu may cut or copy it
          if (from === to || found.pos < from || found.pos > to) {
            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.create(view.state.doc, found.pos),
              ),
            );
          }
          openContextMenu(view, found.pos, {
            anchor: {
              left: event.clientX,
              top: event.clientY,
              bottom: event.clientY,
            },
            keyboard: false,
          });
          return true;
        },
      },
      handleKeyDown: (view, event) => {
        if (event.key !== "ContextMenu") return false;
        openContextMenu(view, view.state.selection.head, { keyboard: true });
        return true;
      },
    },
  });

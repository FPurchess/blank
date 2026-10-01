import { Plugin, TextSelection, type EditorState } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { config } from "../../config";
import {
  type Anchor,
  contextMenu,
  spellchecker,
  type ContextMenuRequest,
} from "../../state";
import { words } from "../../spellcheck/tokenize";
import { caretBox } from "../../engine/geometry";
import { headAfter } from "./pageView";
import { PAGE_MENU, PAGE_PRESS, type PagePointerEvent } from "../pagePointer";
import { buildMenu, type MenuTarget, tableMenu } from "../contextMenu/model";
import { type Misspelling, misspellingAt } from "./spellcheck";

// how long after the keyboard opened the menu the browser's own contextmenu
// event is ignored, which some webviews send for the same key press
const KEYBOARD_EVENT_WINDOW = 500;

// how long the menu waits for the suggestions before it shows them loading
export const SUGGESTION_WAIT = 250;

// the close function of the menu opened last, which stale suggestions mustn't
// replace
let latest: (() => void) | undefined;

// when the keyboard last opened the menu of each editor
const openedByKeyboardAt = new WeakMap<EditorView, number>();

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
 * closer returns the function that closes the menu about to open, unless
 * another one opened meanwhile, and returns the focus to the editor
 */
const closer = (view: EditorView) => {
  const close = () => {
    if (contextMenu.value?.close === close) contextMenu.value = null;
    view.focus();
  };
  latest = close;
  return close;
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
  if (keyboard) openedByKeyboardAt.set(view, Date.now());
  const target = targetAt(view.state, pos);
  const at = target.misspelling?.from ?? pos;
  let where = anchor;
  if (!where) {
    const caret = caretBox(
      at,
      at === view.state.selection.head && headAfter(view.state),
    );
    where = caret
      ? { left: caret.left, top: caret.top, bottom: caret.bottom }
      : { left: 0, top: 0, bottom: 0 };
  }

  const close = closer(view);
  const request = (target: MenuTarget): ContextMenuRequest => ({
    items: buildMenu(view, target),
    anchor: where,
    keyboard,
    close,
  });

  const { misspelling } = target;
  const checker = spellchecker.value;
  if (!misspelling || !checker) {
    contextMenu.value = request(target);
    return;
  }

  // the menu waits a moment for the suggestions, so its items don't move
  // while the user reaches for one
  let shown = false;
  const open = (suggestions?: string[]) => {
    shown = true;
    // unless another menu was opened meanwhile
    if (latest === close) {
      contextMenu.value = request({ misspelling, suggestions });
    }
  };
  const timer = window.setTimeout(open, SUGGESTION_WAIT);
  const show = (suggestions: string[]) => {
    window.clearTimeout(timer);
    // unless the menu was closed meanwhile
    if (!shown || contextMenu.value?.close === close) open(suggestions);
  };
  checker.suggest(misspelling.word).then(show, () => show([]));
};

/**
 * openTableMenu opens a menu of the actions on the table the selection is
 * in below `anchor`, e.g. for the handle of the selected rows
 */
export const openTableMenu = (view: EditorView, anchor: Anchor) => {
  contextMenu.value = {
    items: tableMenu(view),
    anchor,
    keyboard: false,
    close: closer(view),
  };
};

/**
 * contextMenuPlugin shows Blank's context menu instead of the webview's: on
 * a right click on the pages (see src/editor/pagePointer.ts), the ContextMenu
 * key and the shortcut. Shift + right click shows the webview's menu in the
 * editor without the pages, e.g. for the input methods and the emoji picker;
 * on the pages it opens Blank's menu, since the webview's has nothing to
 * offer there.
 */
export const contextMenuPlugin = () =>
  new Plugin({
    props: {
      handleDOMEvents: {
        // a right press on the pages starts looking up the suggestions
        [PAGE_PRESS]: (view, event: PagePointerEvent) => {
          const { button, pos } = event.detail;
          if (button === 2 && pos !== null) prefetch(view.state, pos);
          return false;
        },
        // a right click on the pages, which the page view hit
        [PAGE_MENU]: (view, event: PagePointerEvent) => {
          const { pos, x, y } = event.detail;
          event.preventDefault();
          if (pos === null) return true;
          const { from, to } = view.state.selection;
          // keep a selection clicked into, as the menu may cut or copy it
          if (from === to || pos < from || pos > to) {
            view.dispatch(
              view.state.tr.setSelection(
                TextSelection.create(view.state.doc, pos),
              ),
            );
          }
          openContextMenu(view, pos, {
            anchor: { left: x, top: y, bottom: y },
            keyboard: false,
          });
          return true;
        },
        // the ContextMenu key, which the webview sends to the focused editor
        contextmenu: (view, event) => {
          if (event.shiftKey) return false;
          event.preventDefault();
          // the keyboard shortcut already opened the menu
          const since =
            Date.now() - (openedByKeyboardAt.get(view) ?? -Infinity);
          if (since < KEYBOARD_EVENT_WINDOW) return true;
          openContextMenu(view, view.state.selection.head, {
            keyboard: true,
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

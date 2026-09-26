import { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { deleteSelection, selectAll } from "prosemirror-commands";
import { redo, redoDepth, undo, undoDepth } from "prosemirror-history";
import { readText, writeText } from "@tauri-apps/plugin-clipboard-manager";

import { CommandIdentifier, getKeyBinding } from "../../config";
import {
  type MenuItem,
  spellcheck,
  spellchecker,
  spellcheckStatus,
} from "../../state";
import { languageName, matchCase, update } from "../../spellcheck/service";
import type { Spellchecker } from "../../spellcheck/types";
import { dispatchCorrection } from "../plugins/autocomplete/history";
import {
  ignoreAll,
  type Misspelling,
  occurrences,
} from "../plugins/spellcheck";

// suggestions shown for a misspelled word at most
export const MAX_SUGGESTIONS = 5;

export interface MenuTarget {
  // the misspelled word at the menu
  misspelling?: Misspelling;
  // the suggestions for it, or undefined while they are loading
  suggestions?: string[];
  // the word at the menu if the personal dictionary accepts it, and the
  // accepting entry
  userWord?: Misspelling & { entry: string };
}

/**
 * replaceWord replaces `word` with `text` as an undo step of its own
 */
export const replaceWord = (
  view: EditorView,
  word: Misspelling,
  text: string,
) => {
  const tr = view.state.tr.insertText(text, word.from, word.to);
  tr.setSelection(TextSelection.create(tr.doc, word.from + text.length));
  dispatchCorrection(view, tr);
};

/**
 * changeAll replaces every occurrence of `word` with `text`, in the case of
 * each occurrence, as one undo step
 */
export const changeAll = (view: EditorView, word: string, text: string) => {
  const tr = view.state.tr;
  // from the end, so earlier positions stay valid
  for (const found of occurrences(view.state, word).reverse()) {
    tr.insertText(matchCase(found.text, text), found.from, found.to);
  }
  if (tr.docChanged) dispatchCorrection(view, tr);
};

/**
 * copy copies the selection like the keyboard shortcut does, falling back to
 * plain text where the webview doesn't allow it
 */
export const copy = async (view: EditorView, cut = false) => {
  view.focus();
  if (document.execCommand(cut ? "cut" : "copy")) return;
  const { from, to } = view.state.selection;
  await writeText(view.state.doc.textBetween(from, to, "\n\n"));
  if (cut) deleteSelection(view.state, view.dispatch);
};

/**
 * paste pastes the clipboard like the keyboard shortcut does: formatted if
 * the webview lets us read HTML, as plain text otherwise
 */
export const paste = async (view: EditorView, plain = false) => {
  view.focus();
  if (!plain) {
    try {
      for (const item of await navigator.clipboard.read()) {
        if (item.types.includes("text/html")) {
          const html = await (await item.getType("text/html")).text();
          view.pasteHTML(html);
          return;
        }
      }
    } catch {
      // not allowed or not supported, so paste plain text
    }
  }
  const text = await readText();
  if (text) view.pasteText(text);
};

const run = (view: EditorView, action: (view: EditorView) => unknown) => () =>
  Promise.resolve(action(view)).catch((error) =>
    console.warn("context menu action failed", error),
  );

const suggestionItems = (
  view: EditorView,
  checker: Spellchecker | null,
  target: MenuTarget,
): MenuItem[] => {
  const { misspelling, suggestions } = target;
  if (!misspelling || !checker) return [];
  const shown = suggestions?.slice(0, MAX_SUGGESTIONS);

  const items: MenuItem[] =
    shown === undefined
      ? [{ id: "loading", label: "Loading suggestions…", disabled: true }]
      : shown.length === 0
        ? [{ id: "none", label: "(No suggestions)", disabled: true }]
        : shown.map((suggestion) => ({
            id: `suggestion:${suggestion}`,
            label: suggestion,
            run: run(view, (view) =>
              replaceWord(view, misspelling, suggestion),
            ),
          }));

  if (shown?.length) {
    items.push({
      id: "change-all",
      label: "Change All",
      children: shown.map((suggestion) => ({
        id: `change-all:${suggestion}`,
        label: suggestion,
        run: run(view, (view) => changeAll(view, misspelling.word, suggestion)),
      })),
    });
  }

  items.push(
    "separator",
    {
      id: "ignore-all",
      label: "Ignore All",
      run: run(view, (view) =>
        view.dispatch(ignoreAll(view.state, misspelling.word)),
      ),
    },
    {
      id: "add",
      label: "Add to Dictionary",
      run: run(view, () => checker.addWord(misspelling.word)),
    },
  );
  return items;
};

const userWordItems = (
  checker: Spellchecker | null,
  target: MenuTarget,
): MenuItem[] => {
  const { userWord } = target;
  if (!userWord || !checker) return [];
  return [
    {
      id: "remove",
      label: "Remove from Dictionary",
      run: () => void checker.removeWord(userWord.entry).catch(console.warn),
    },
    {
      id: "edit",
      label: "Edit in Dictionary…",
      edit: {
        value: userWord.entry,
        submit: (word) => {
          const value = word.trim();
          if (!value || /\s/.test(value) || value === userWord.entry) return;
          void checker.replaceWord(userWord.entry, value).catch(console.warn);
        },
      },
    },
  ];
};

const editItems = (view: EditorView): MenuItem[] => {
  const { state } = view;
  const empty = state.selection.empty;
  return [
    {
      id: "undo",
      label: "Undo",
      shortcut: getKeyBinding(CommandIdentifier.UNDO),
      disabled: undoDepth(state) === 0,
      run: run(view, (view) => undo(view.state, view.dispatch)),
    },
    {
      id: "redo",
      label: "Redo",
      shortcut: getKeyBinding(CommandIdentifier.REDO),
      disabled: redoDepth(state) === 0,
      run: run(view, (view) => redo(view.state, view.dispatch)),
    },
    "separator",
    {
      id: "cut",
      label: "Cut",
      shortcut: "Mod-x",
      disabled: empty,
      run: run(view, (view) => copy(view, true)),
    },
    {
      id: "copy",
      label: "Copy",
      shortcut: "Mod-c",
      disabled: empty,
      run: run(view, (view) => copy(view)),
    },
    {
      id: "paste",
      label: "Paste",
      shortcut: "Mod-v",
      run: run(view, (view) => paste(view)),
    },
    {
      id: "paste-plain",
      label: "Paste as Plain Text",
      run: run(view, (view) => paste(view, true)),
    },
    {
      id: "delete",
      label: "Delete",
      disabled: empty,
      run: run(view, (view) => deleteSelection(view.state, view.dispatch)),
    },
    {
      id: "select-all",
      label: "Select All",
      shortcut: "Mod-a",
      run: run(view, (view) => selectAll(view.state, view.dispatch)),
    },
  ];
};

const spellcheckItems = (): MenuItem[] => {
  const shortcut = getKeyBinding(CommandIdentifier.SPELLCHECK_TOGGLE);
  if (!spellcheck.value) {
    return [
      {
        id: "enable",
        label: "Enable Spell Check",
        shortcut,
        run: () => (spellcheck.value = true),
      },
    ];
  }
  const { state, tag } = spellcheckStatus.value;
  const items: MenuItem[] = [];
  if (state === "unavailable") {
    items.push({
      id: "unavailable",
      label: `No spell check for ${languageName(tag)}`,
      disabled: true,
    });
  } else if (state === "error") {
    items.push({
      id: "retry",
      label: "Retry Download",
      run: () => void update(),
    });
  }
  items.push({
    id: "disable",
    label: "Disable Spell Check",
    shortcut,
    run: () => (spellcheck.value = false),
  });
  return items;
};

/**
 * buildMenu returns the context menu items for `target`: the spelling items,
 * the editing items the system menus have, then the spell check toggle
 */
export const buildMenu = (view: EditorView, target: MenuTarget): MenuItem[] => {
  const checker = spellchecker.value;
  const spelling = [
    ...suggestionItems(view, checker, target),
    ...userWordItems(checker, target),
  ];
  return [
    ...spelling,
    ...(spelling.length ? ["separator" as const] : []),
    ...editItems(view),
    "separator",
    ...spellcheckItems(),
  ];
};

import { keydownHandler } from "prosemirror-keymap";
import type { Node } from "prosemirror-model";
import {
  Plugin,
  PluginKey,
  type EditorState,
  type Transaction,
} from "prosemirror-state";
import { isInTable } from "prosemirror-tables";
import type { EditorView } from "prosemirror-view";

import { gfmBlocker, type GfmBlocker } from "../../../markdown/tables";
import {
  announcement,
  tableToolbar,
  type TableToolbarItem,
} from "../../../state";
import {
  matchesKey,
  tableActions,
  type TableAction,
} from "../../commands/table/actions";
import { setCaption } from "../../commands/table/format";
import { tableKeyBinding } from "../../keyBindings";
import { tableAround } from "./util";

// how a table is saved, for the announcement when that changes
type Format = GfmBlocker | "gfm";

interface ToolsState {
  // table mode: the toolbar shows its keys, which work until Esc
  keys: boolean;
  // the caption field is open
  caption: boolean;
  // how the table at the cursor is saved after the last change, when that
  // changed
  switched: Format | null;
}

export const toolsKey = new PluginKey<ToolsState>("tableTools");

const IDLE: ToolsState = { keys: false, caption: false, switched: null };

/**
 * setTools changes the state of the table tools with a transaction
 */
export const setTools = (view: EditorView, change: Partial<ToolsState>) =>
  view.dispatch(view.state.tr.setMeta(toolsKey, change));

/**
 * formatOf returns how `table` is saved: "gfm" as a pipe table, or what makes
 * it an HTML table
 */
const formatOf = (table: Node): Format => gfmBlocker(table) ?? "gfm";

/**
 * switchedFormat returns how the table at the cursor is saved after `tr`, if
 * that changed
 */
const switchedFormat = (tr: Transaction, state: EditorState) => {
  if (!tr.docChanged) return null;
  const table = tableAround(state.selection.$head);
  if (!table) return null;
  const before = tr.before.nodeAt(tr.mapping.invert().map(table.pos));
  if (before?.type !== table.node.type) return null;
  const format = formatOf(table.node);
  return formatOf(before) === format ? null : format;
};

// what makes a table an HTML table, as announced
const REASONS: Record<GfmBlocker, string> = {
  merged: "merged cells",
  headerColumn: "a header column",
  noHeader: "no header row",
  blocks: "lists or paragraphs in a cell",
  caption: "a caption",
  mixedAlign: "cells aligned differently within a column",
};

/**
 * formatMessage returns the announcement for a table that is now saved as
 * `to`
 */
export const formatMessage = (to: Format) =>
  to === "gfm"
    ? "This table is saved as a markdown table again."
    : `This table has ${REASONS[to]}, so it's saved as an HTML table.`;

// what the action that runs now leads to, e.g. a change of format, which is
// told after what the action did
let following: string[] | null = null;

/**
 * announce shows `message` in the status bar and reads it out
 */
export const announce = (message: string) => {
  if (following) following.push(message);
  else announcement.value = message;
};

/**
 * performAction runs `action` and announces what it did, or why it can't
 */
export const performAction = (view: EditorView, action: TableAction) => {
  if (!action.enabled(view.state)) {
    announce(`${action.label(view.state)} isn't possible here`);
    return;
  }
  const message = action.done(view.state);
  following = [];
  try {
    action.run(view);
  } finally {
    const messages = [message && `${message}.`, ...following].filter(Boolean);
    following = null;
    if (messages.length) {
      // a single message reads better without the period
      announce(messages.join(" ").replace(/^([^.]*)\.$/, "$1"));
    }
  }
};

const MODIFIERS = ["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"];

/**
 * tableTools shows the table toolbar while the cursor is in a table, and
 * handles table mode, in which the toolbar's actions run from the keyboard
 */
export const tableTools = () => {
  const actions = tableActions((view) => setTools(view, { caption: true }));
  // the format changes told so far: once each is enough per session
  const told = new Set<string>();
  const binding = tableKeyBinding();
  const toggle = keydownHandler(
    binding
      ? {
          [binding]: (state, dispatch) => {
            dispatch?.(state.tr.setMeta(toolsKey, { keys: false }));
            return true;
          },
        }
      : {},
  );

  /**
   * items returns the toolbar buttons for `view`
   */
  const items = (view: EditorView): TableToolbarItem[] =>
    actions
      .filter((action) => action.toolbar)
      .map((action) => ({
        id: action.id,
        label: action.label(view.state),
        icon: action.icon,
        key: action.key.label,
        group: action.group,
        enabled: action.enabled(view.state),
        checked: action.checked?.(view.state),
        run: () => {
          performAction(view, action);
          view.focus();
        },
      }));

  /**
   * publish shows the toolbar of the table at the cursor, or hides it
   */
  const publish = (view: EditorView) => {
    const table = tableAround(view.state.selection.$head);
    const dom = table && view.nodeDOM(table.pos);
    if (!table || !(dom instanceof HTMLElement)) {
      if (tableToolbar.value) tableToolbar.value = null;
      return;
    }
    const tools = toolsKey.getState(view.state) ?? IDLE;
    const { left, top, bottom, right } = dom.getBoundingClientRect();
    tableToolbar.value = {
      anchor: { left, top, bottom, right },
      items: items(view),
      keys: tools.keys,
      caption: tools.caption
        ? {
            value: (table.node.attrs.caption as string | null) ?? "",
            submit: (value) => {
              const had = !!table.node.attrs.caption;
              setCaption(value)(view.state, view.dispatch);
              setTools(view, { caption: false });
              const message = value.trim()
                ? "Caption set"
                : had
                  ? "Caption removed"
                  : null;
              if (message) announce(message);
              view.focus();
            },
            cancel: () => {
              setTools(view, { caption: false });
              view.focus();
            },
          }
        : null,
    };
  };

  return new Plugin<ToolsState>({
    key: toolsKey,
    state: {
      init: () => IDLE,
      apply: (tr, value, _old, state) => {
        if (!isInTable(state)) return IDLE;
        const change = tr.getMeta(toolsKey) as Partial<ToolsState> | undefined;
        return {
          ...value,
          ...change,
          switched: switchedFormat(tr, state),
        };
      },
    },
    props: {
      handleKeyDown: (view, event) => {
        const tools = toolsKey.getState(view.state);
        if (!tools?.keys) return false;
        if (MODIFIERS.includes(event.key) || event.isComposing) return false;
        if (toggle(view, event)) return true;
        const action = actions.find((a) => matchesKey(a, event));
        if (action) {
          performAction(view, action);
          return true;
        }
        setTools(view, { keys: false });
        // a shortcut like Mod+S still does its job; Esc and other keys end
        // table mode without typing
        return !(event.ctrlKey || event.metaKey || event.altKey);
      },
      handleTextInput: (view) => !!toolsKey.getState(view.state)?.keys,
      handleDOMEvents: {
        mousedown: (view) => {
          if (toolsKey.getState(view.state)?.keys) {
            setTools(view, { keys: false });
          }
          return false;
        },
      },
    },
    view(view) {
      const reposition = () => publish(view);
      window.addEventListener("scroll", reposition, true);
      window.addEventListener("resize", reposition);
      publish(view);
      return {
        update: (view) => {
          const switched = toolsKey.getState(view.state)?.switched;
          const message = switched && formatMessage(switched);
          if (message && !told.has(message)) {
            told.add(message);
            announce(message);
          }
          publish(view);
        },
        destroy: () => {
          window.removeEventListener("scroll", reposition, true);
          window.removeEventListener("resize", reposition);
          tableToolbar.value = null;
        },
      };
    },
  });
};

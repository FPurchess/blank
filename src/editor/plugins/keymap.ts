import { undo, redo } from "prosemirror-history";
import {
  baseKeymap,
  chainCommands,
  createParagraphNear,
  deleteSelection,
  joinBackward,
  liftEmptyBlock,
  newlineInCode,
  selectNodeBackward,
  splitBlockAs,
  toggleMark,
} from "prosemirror-commands";
import { splitListItem } from "prosemirror-schema-list";
import { alignOf, fieldAt, schema } from "../../markdown";
import { sendNotification } from "@tauri-apps/plugin-notification";

import {
  closeTab,
  cycleTabs,
  moveFocus,
  openSettings,
  toggleFocusMode,
  moveTab,
  newFile,
  openFile,
  reopenTab,
  saveFile,
  exportAs,
  cycleTheme,
  chooseLanguage,
  insertBlock,
  insertNode,
  editLink,
  editImage,
  goToMisspelling,
  openMenu,
  toggleSpellcheck,
  tableKey,
  pageSetup,
  print,
  editBand,
  showOutline,
  showWordCount,
  togglePageView,
} from "../commands";

import * as exporters from "../../exporters";
import { CommandIdentifier, getKeyBinding } from "../../config";
import type { MarkType, Node } from "prosemirror-model";
import { type Command, Plugin } from "prosemirror-state";
import { inCell } from "./tables/util";
import { normalizeBinding, sameBinding } from "../../keyNames";
import { liveKeys } from "../keyBindings";
import { PDF_FILTER, WORD_FILTER } from "../../formats";
import { PDF_EXPORT } from "../commands/exportAs";
import { indentCode, outdentCode } from "../commands/codeIndent";
import { toggleBlocksPane } from "../commands/contentBlocks";
import { alignText } from "../commands/align";
import { toggleList } from "../commands/lists";
import {
  backspaceInList,
  enterEmptyItem,
  joinAfterList,
} from "../commands/listKeys";
import {
  indentLines,
  inItems,
  insertTab,
  keepKey,
  liftItems,
  outdentLines,
  sinkItems,
} from "../commands/indent";
import { toggleQuote } from "../commands/quote";
import { focusStop } from "../../state";
import { setTextblock } from "../commands/setTextblock";

/**
 * outsideCells runs `command` only outside table cells, which can't hold
 * headings, rules or page breaks
 */
const outsideCells =
  (command: Command): Command =>
  (state, dispatch, view) =>
    !inCell(state.selection.$from) && command(state, dispatch, view);

/**
 * outsideForms runs `command` only outside forms, whose fields can't hold
 * page breaks
 */
const outsideForms =
  (command: Command): Command =>
  (state, dispatch, view) =>
    !fieldAt(state.selection.$from) && command(state, dispatch, view);

/**
 * markCommand toggles `type`, but adds it to a selection only partly marked,
 * as Word and Google Docs do
 */
const markCommand = (type: MarkType) =>
  toggleMark(type, null, { removeWhenPresent: false });

const heading = (level: number) =>
  outsideCells(setTextblock(schema.nodes.heading, { level }));

const commandMap: { [key in CommandIdentifier]: Command } = {
  [CommandIdentifier.UNDO]: undo,
  [CommandIdentifier.REDO]: redo,
  [CommandIdentifier.BLOCKTYPE_PARAGRAPH]: setTextblock(schema.nodes.paragraph),
  [CommandIdentifier.BLOCKTYPE_HEADING1]: heading(1),
  [CommandIdentifier.BLOCKTYPE_HEADING2]: heading(2),
  [CommandIdentifier.BLOCKTYPE_HEADING3]: heading(3),
  [CommandIdentifier.BLOCKTYPE_HEADING4]: heading(4),
  [CommandIdentifier.BLOCKTYPE_HEADING5]: heading(5),
  [CommandIdentifier.BLOCKTYPE_HEADING6]: heading(6),
  [CommandIdentifier.BLOCKTYPE_BULLET_LIST]: toggleList(
    schema.nodes.bullet_list,
  ),
  [CommandIdentifier.BLOCKTYPE_ORDERED_LIST]: toggleList(
    schema.nodes.ordered_list,
  ),
  [CommandIdentifier.BLOCKTYPE_CODE_BLOCK]: setTextblock(
    schema.nodes.code_block,
  ),
  [CommandIdentifier.INSERT_HORIZONTAL_RULE]: outsideCells(
    insertBlock(schema.nodes.horizontal_rule),
  ),
  [CommandIdentifier.INSERT_IMAGE]: editImage(),
  [CommandIdentifier.INSERT_TABLE]: tableKey(),
  [CommandIdentifier.INSERT_PAGE_BREAK]: outsideForms(
    outsideCells(insertBlock(schema.nodes.page_break)),
  ),
  [CommandIdentifier.INSERT_BLOCK]: toggleBlocksPane(),
  // the lines of a code block first, then list items, then lines of text;
  // their keys do a little more, see keyCommands
  [CommandIdentifier.FORMAT_INDENT]: chainCommands(
    indentCode,
    sinkItems,
    indentLines,
  ),
  [CommandIdentifier.FORMAT_UNINDENT]: chainCommands(
    outdentCode,
    liftItems,
    outdentLines,
  ),
  [CommandIdentifier.FORMAT_BOLD]: markCommand(schema.marks.strong),
  [CommandIdentifier.FORMAT_ITALIC]: markCommand(schema.marks.em),
  [CommandIdentifier.FORMAT_UNDERLINE]: markCommand(schema.marks.underline),
  [CommandIdentifier.FORMAT_CODE]: markCommand(schema.marks.code),
  [CommandIdentifier.FORMAT_LINK]: editLink(),
  [CommandIdentifier.FORMAT_BLOCKQUOTE]: toggleQuote,
  [CommandIdentifier.FORMAT_ALIGN_LEFT]: alignText("left"),
  [CommandIdentifier.FORMAT_ALIGN_CENTER]: alignText("center"),
  [CommandIdentifier.FORMAT_ALIGN_RIGHT]: alignText("right"),
  [CommandIdentifier.FORMAT_ALIGN_JUSTIFY]: alignText("justify"),
  [CommandIdentifier.FILE_NEW]: newFile(),
  [CommandIdentifier.FILE_SAVE]: saveFile(),
  [CommandIdentifier.FILE_SAVE_AS]: saveFile({ force: true }),
  [CommandIdentifier.FILE_OPEN]: openFile(),
  [CommandIdentifier.FILE_PRINT]: print(),
  [CommandIdentifier.TAB_CLOSE]: closeTab(),
  [CommandIdentifier.TAB_NEXT]: cycleTabs(1),
  [CommandIdentifier.TAB_PREVIOUS]: cycleTabs(-1),
  [CommandIdentifier.TAB_REOPEN]: reopenTab(),
  [CommandIdentifier.TAB_MOVE_LEFT]: moveTab(-1),
  [CommandIdentifier.TAB_MOVE_RIGHT]: moveTab(1),
  [CommandIdentifier.EXPORT_PDF]: exportAs(PDF_EXPORT, exporters.toPDF, [
    PDF_FILTER,
  ]),
  [CommandIdentifier.EXPORT_DOCX]: exportAs("Word-Export", exporters.toDOCX, [
    WORD_FILTER,
  ]),
  [CommandIdentifier.THEME_CYCLE]: cycleTheme(),
  [CommandIdentifier.LANGUAGE_CHOOSE]: chooseLanguage(),
  [CommandIdentifier.SPELLCHECK_TOGGLE]: toggleSpellcheck(),
  [CommandIdentifier.SPELLCHECK_NEXT]: goToMisspelling(1),
  [CommandIdentifier.SPELLCHECK_PREVIOUS]: goToMisspelling(-1),
  [CommandIdentifier.CONTEXT_MENU]: openMenu(),
  [CommandIdentifier.PAGE_SETUP]: pageSetup(),
  [CommandIdentifier.EDIT_HEADER]: editBand("header"),
  [CommandIdentifier.EDIT_FOOTER]: editBand("footer"),
  [CommandIdentifier.VIEW_PAGES]: togglePageView(),
  [CommandIdentifier.VIEW_OUTLINE]: showOutline(),
  [CommandIdentifier.VIEW_FOCUS_NEXT]: moveFocus(1),
  [CommandIdentifier.VIEW_FOCUS_PREVIOUS]: moveFocus(-1),
  [CommandIdentifier.VIEW_TOOLBAR_FOCUS]: (_state, dispatch) => {
    if (dispatch) focusStop("toolbar");
    return true;
  },
  [CommandIdentifier.VIEW_FOCUS_MODE]: toggleFocusMode(),
  [CommandIdentifier.TOOLS_STATS]: showWordCount(),
  [CommandIdentifier.APP_SETTINGS]: openSettings(),
};

// keys that run a command besides its own, which can't be changed in
// blank.json: they go to it unless another command has them
const FIXED_KEYS: Partial<Record<CommandIdentifier, string[]>> = {
  [CommandIdentifier.TAB_NEXT]: ["Ctrl-PageDown"],
  [CommandIdentifier.TAB_PREVIOUS]: ["Ctrl-PageUp"],
};

/**
 * commandFor returns the command bound to `id`, the one its key runs, e.g.
 * for the toolbar's buttons
 */
export const commandFor = (id: CommandIdentifier): Command => commandMap[id];

/**
 * keyCommands are what the keys of some commands run instead of what the
 * buttons run, which is enabled only where it does something: Tab puts a
 * tab at the cursor, and Tab and Shift-Tab never move the focus out of the
 * text, where a list item can't go further or a line has no tab to take
 */
const keyCommands: Partial<Record<CommandIdentifier, Command>> = {
  [CommandIdentifier.FORMAT_INDENT]: chainCommands(
    indentCode,
    // with the first item, the items after it go down
    inItems(chainCommands(sinkItems, indentLines)),
    insertTab,
    indentLines,
    keepKey,
  ),
  [CommandIdentifier.FORMAT_UNINDENT]: chainCommands(
    outdentCode,
    inItems(liftItems),
    outdentLines,
    keepKey,
  ),
};

// the command the key of `id` runs
const keyCommandFor = (id: CommandIdentifier): Command =>
  keyCommands[id] ?? commandMap[id];

/**
 * bindingsOf binds the commands `ids` to their configured keys, and then to
 * their fixed keys (see FIXED_KEYS). Bindings that can't be used are added
 * to `invalid`; a command without a key (an empty one) is left out.
 */
const bindingsOf = (
  ids: readonly CommandIdentifier[],
  invalid: string[] = [],
) => {
  const bindings: Record<string, Command> = {};
  for (const id of ids) {
    const binding = getKeyBinding(id);
    // a command without a key, e.g. the code block's by default
    if (binding === "") continue;
    const normalized = normalizeBinding(binding);
    if (normalized === undefined) {
      invalid.push(`${id}: ${binding}`);
      continue;
    }
    const command = keyCommandFor(id);
    bindings[normalized] = command;
    // with Shift, the key is a capital letter, e.g. "N" for Ctrl+Alt+Shift+N
    // on Windows, where the keymap can't fall back to the key code
    if (/(^|-)shift-/i.test(normalized) && /-[a-z]$/.test(normalized)) {
      bindings[normalized.slice(0, -1) + normalized.slice(-1).toUpperCase()] ??=
        command;
    }
  }
  // a fixed key yields to any command bound to it, not only to these
  const configured = Object.keys(commandMap).map((id) =>
    getKeyBinding(id as CommandIdentifier),
  );
  for (const id of ids) {
    for (const key of FIXED_KEYS[id] ?? []) {
      if (!configured.some((binding) => sameBinding(binding, key)))
        bindings[key] = keyCommandFor(id);
    }
  }
  return bindings;
};

/**
 * bindCommands binds every command to its configured key. Bindings that
 * can't be used are skipped and reported once.
 */
const bindCommands = () => {
  const invalid: string[] = [];
  const bindings = bindingsOf(
    Object.keys(commandMap) as CommandIdentifier[],
    invalid,
  );
  if (invalid.length > 0) {
    console.warn("ignored invalid key bindings", invalid);
    sendNotification(
      `Ignored invalid key bindings in blank.json: ${invalid.join(", ")}`,
    );
  }
  return bindings;
};

// the commands that work wherever the focus is in the window, not only in
// the editor: the files and printing, the tabs, moving between the parts
// (F6, and Alt-F10 to the toolbar), focus mode and the settings
export const WINDOW_COMMANDS: readonly CommandIdentifier[] = [
  CommandIdentifier.FILE_NEW,
  CommandIdentifier.FILE_OPEN,
  CommandIdentifier.FILE_SAVE,
  CommandIdentifier.FILE_SAVE_AS,
  CommandIdentifier.FILE_PRINT,
  CommandIdentifier.TAB_CLOSE,
  CommandIdentifier.TAB_NEXT,
  CommandIdentifier.TAB_PREVIOUS,
  CommandIdentifier.TAB_REOPEN,
  CommandIdentifier.TAB_MOVE_LEFT,
  CommandIdentifier.TAB_MOVE_RIGHT,
  CommandIdentifier.VIEW_FOCUS_NEXT,
  CommandIdentifier.VIEW_FOCUS_PREVIOUS,
  CommandIdentifier.VIEW_TOOLBAR_FOCUS,
  CommandIdentifier.VIEW_FOCUS_MODE,
  CommandIdentifier.APP_SETTINGS,
];

/**
 * commandKeys returns a keydown handler that runs the commands `ids` on
 * their keys, e.g. for keys pressed outside the editor
 */
export const commandKeys = (ids: readonly CommandIdentifier[]) =>
  liveKeys(() => bindingsOf(ids));

/**
 * keepAlignment makes the paragraph Enter starts at the end of an aligned
 * paragraph or heading aligned like it; splitting one in the middle keeps the
 * alignment on both halves anyway
 */
const keepAlignment = (node: Node, atEnd: boolean) => {
  const align = alignOf(node);
  return atEnd && align
    ? { type: schema.nodes.paragraph, attrs: { align } }
    : null;
};

// baseKeymap's Backspace, but at the start of a list item or of the
// paragraph after a list, as in Google Docs (see listKeys)
const backspace = chainCommands(
  deleteSelection,
  backspaceInList,
  joinAfterList,
  joinBackward,
  selectNodeBackward,
);

/**
 * keymap runs the commands on their keys, over prosemirror's base keymap. It
 * follows the keymap of the settings: a changed key works at once, in every
 * tab, since they all share this plugin.
 */
export const keymap = () => {
  // invalid bindings are reported once, at the start
  bindCommands();
  return new Plugin({
    props: {
      handleKeyDown: liveKeys(() => ({
        ...baseKeymap,

        ...bindingsOf(Object.keys(commandMap) as CommandIdentifier[]),

        // baseKeymap's Enter, but a paragraph after an aligned block, made at
        // its end, is aligned like it, as in Word
        Enter: chainCommands(
          enterEmptyItem,
          splitListItem(schema.nodes.list_item),
          newlineInCode,
          createParagraphNear,
          liftEmptyBlock,
          splitBlockAs(keepAlignment),
        ),
        "Shift-Enter": insertNode(schema.nodes.hard_break),
        Backspace: backspace,
        "Shift-Backspace": backspace,
      })),
    },
  });
};

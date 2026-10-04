import { keymap as _keymap, keydownHandler } from "prosemirror-keymap";
import { undo, redo } from "prosemirror-history";
import {
  baseKeymap,
  setBlockType,
  toggleMark,
  chainCommands,
  wrapIn,
} from "prosemirror-commands";
import {
  liftListItem,
  sinkListItem,
  wrapInList,
  splitListItem,
} from "prosemirror-schema-list";
import { fieldAt, schema } from "../../markdown";
import { sendNotification } from "@tauri-apps/plugin-notification";

import {
  closeTab,
  cycleTabs,
  moveFocus,
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
  editBand,
  showOutline,
  showWordCount,
  togglePageView,
} from "../commands";

import * as exporters from "../../exporters";
import { CommandIdentifier, getKeyBinding } from "../../config";
import { Command } from "prosemirror-state";
import { inCell } from "./tables/util";
import { normalizeBinding } from "../keyBindings";
import { PDF_FILTER, WORD_FILTER } from "../../formats";
import { indentCode, outdentCode } from "../commands/codeIndent";
import { toggleBlocksPane } from "../commands/contentBlocks";

export { normalizeBinding };

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

const heading = (level: number) =>
  outsideCells(setBlockType(schema.nodes.heading, { level }));

const commandMap: { [key in CommandIdentifier]: Command } = {
  [CommandIdentifier.UNDO]: undo,
  [CommandIdentifier.REDO]: redo,
  [CommandIdentifier.BLOCKTYPE_PARAGRAPH]: setBlockType(schema.nodes.paragraph),
  [CommandIdentifier.BLOCKTYPE_HEADING1]: heading(1),
  [CommandIdentifier.BLOCKTYPE_HEADING2]: heading(2),
  [CommandIdentifier.BLOCKTYPE_HEADING3]: heading(3),
  [CommandIdentifier.BLOCKTYPE_HEADING4]: heading(4),
  [CommandIdentifier.BLOCKTYPE_HEADING5]: heading(5),
  [CommandIdentifier.BLOCKTYPE_HEADING6]: heading(6),
  [CommandIdentifier.BLOCKTYPE_BULLET_LIST]: wrapInList(
    schema.nodes.bullet_list,
  ),
  [CommandIdentifier.BLOCKTYPE_ORDERED_LIST]: wrapInList(
    schema.nodes.ordered_list,
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
  // the lines of a code block first, then list items
  [CommandIdentifier.FORMAT_INDENT]: chainCommands(
    indentCode,
    sinkListItem(schema.nodes.list_item),
  ),
  [CommandIdentifier.FORMAT_UNINDENT]: chainCommands(
    outdentCode,
    liftListItem(schema.nodes.list_item),
  ),
  [CommandIdentifier.FORMAT_BOLD]: toggleMark(schema.marks.strong),
  [CommandIdentifier.FORMAT_ITALIC]: toggleMark(schema.marks.em),
  [CommandIdentifier.FORMAT_CODE]: toggleMark(schema.marks.code),
  [CommandIdentifier.FORMAT_LINK]: editLink(),
  [CommandIdentifier.FORMAT_BLOCKQUOTE]: wrapIn(schema.nodes.blockquote),
  [CommandIdentifier.FILE_NEW]: newFile(),
  [CommandIdentifier.FILE_SAVE]: saveFile(),
  [CommandIdentifier.FILE_SAVE_AS]: saveFile({ force: true }),
  [CommandIdentifier.FILE_OPEN]: openFile(),
  [CommandIdentifier.TAB_CLOSE]: closeTab(),
  [CommandIdentifier.TAB_NEXT]: cycleTabs(1),
  [CommandIdentifier.TAB_PREVIOUS]: cycleTabs(-1),
  [CommandIdentifier.TAB_REOPEN]: reopenTab(),
  [CommandIdentifier.TAB_MOVE_LEFT]: moveTab(-1),
  [CommandIdentifier.TAB_MOVE_RIGHT]: moveTab(1),
  [CommandIdentifier.EXPORT_PDF]: exportAs("PDF-Export", exporters.toPDF, [
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
  [CommandIdentifier.TOOLS_STATS]: showWordCount(),
};

// keys that run a command besides its own, which can't be changed in
// blank.json: they go to it unless another command has them
const FIXED_KEYS: Partial<Record<CommandIdentifier, string[]>> = {
  [CommandIdentifier.TAB_NEXT]: ["Ctrl-PageDown"],
  [CommandIdentifier.TAB_PREVIOUS]: ["Ctrl-PageUp"],
};

/**
 * bindingsOf binds the commands `ids` to their configured keys, and then to
 * their fixed keys (see FIXED_KEYS). Bindings that can't be used are added
 * to `invalid`.
 */
const bindingsOf = (
  ids: readonly CommandIdentifier[],
  invalid: string[] = [],
) => {
  const bindings: Record<string, Command> = {};
  for (const id of ids) {
    const binding = getKeyBinding(id);
    const normalized = normalizeBinding(binding);
    if (normalized === undefined) {
      invalid.push(`${id}: ${binding}`);
      continue;
    }
    const command = commandMap[id];
    bindings[normalized] = command;
    // with Shift, the key is a capital letter, e.g. "N" for Ctrl+Alt+Shift+N
    // on Windows, where the keymap can't fall back to the key code
    if (/(^|-)shift-/i.test(normalized) && /-[a-z]$/.test(normalized)) {
      bindings[normalized.slice(0, -1) + normalized.slice(-1).toUpperCase()] ??=
        command;
    }
  }
  for (const id of ids) {
    for (const key of FIXED_KEYS[id] ?? []) {
      bindings[normalizeBinding(key)!] ??= commandMap[id];
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
// the editor: the files, the tabs, and moving between the parts
export const WINDOW_COMMANDS: readonly CommandIdentifier[] = [
  CommandIdentifier.FILE_NEW,
  CommandIdentifier.FILE_OPEN,
  CommandIdentifier.FILE_SAVE,
  CommandIdentifier.FILE_SAVE_AS,
  CommandIdentifier.TAB_CLOSE,
  CommandIdentifier.TAB_NEXT,
  CommandIdentifier.TAB_PREVIOUS,
  CommandIdentifier.TAB_REOPEN,
  CommandIdentifier.TAB_MOVE_LEFT,
  CommandIdentifier.TAB_MOVE_RIGHT,
  CommandIdentifier.VIEW_FOCUS_NEXT,
  CommandIdentifier.VIEW_FOCUS_PREVIOUS,
];

/**
 * commandKeys returns a keydown handler that runs the commands `ids` on
 * their keys, e.g. for keys pressed outside the editor
 */
export const commandKeys = (ids: readonly CommandIdentifier[]) =>
  keydownHandler(bindingsOf(ids));

export const keymap = () =>
  _keymap({
    ...baseKeymap,

    ...bindCommands(),

    Enter: chainCommands(
      splitListItem(schema.nodes.list_item),
      baseKeymap.Enter,
    ),
    "Shift-Enter": insertNode(schema.nodes.hard_break),
  });

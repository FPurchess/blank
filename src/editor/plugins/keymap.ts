import { keymap as _keymap } from "prosemirror-keymap";
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
import { schema } from "prosemirror-markdown";

import {
  newFile,
  openFile,
  saveFile,
  exportAs,
  cycleTheme,
  insertNode,
} from "../commands";

import * as exporters from "../../exporters";
import { CommandIdentifier, getKeyBinding } from "../../config";
import { Command } from "prosemirror-state";

const commandMap: { [key in CommandIdentifier]: Command } = {
  [CommandIdentifier.UNDO]: undo,
  [CommandIdentifier.REDO]: redo,
  [CommandIdentifier.BLOCKTYPE_PARAGRAPH]: setBlockType(schema.nodes.paragraph),
  [CommandIdentifier.BLOCKTYPE_HEADING1]: setBlockType(schema.nodes.heading, {
    level: 1,
  }),
  [CommandIdentifier.BLOCKTYPE_HEADING2]: setBlockType(schema.nodes.heading, {
    level: 2,
  }),
  [CommandIdentifier.BLOCKTYPE_HEADING3]: setBlockType(schema.nodes.heading, {
    level: 3,
  }),
  [CommandIdentifier.BLOCKTYPE_HEADING4]: setBlockType(schema.nodes.heading, {
    level: 4,
  }),
  [CommandIdentifier.BLOCKTYPE_HEADING5]: setBlockType(schema.nodes.heading, {
    level: 5,
  }),
  [CommandIdentifier.BLOCKTYPE_HEADING6]: setBlockType(schema.nodes.heading, {
    level: 6,
  }),
  [CommandIdentifier.BLOCKTYPE_BULLET_LIST]: wrapInList(
    schema.nodes.bullet_list,
  ),
  [CommandIdentifier.BLOCKTYPE_ORDERED_LIST]: wrapInList(
    schema.nodes.ordered_list,
  ),
  [CommandIdentifier.INSERT_HORIZONTAL_RULE]: insertNode(
    schema.nodes.horizontal_rule,
  ),
  [CommandIdentifier.FORMAT_INDENT]: sinkListItem(schema.nodes.list_item),
  [CommandIdentifier.FORMAT_UNINDENT]: liftListItem(schema.nodes.list_item),
  [CommandIdentifier.FORMAT_BOLD]: toggleMark(schema.marks.strong),
  [CommandIdentifier.FORMAT_ITALIC]: toggleMark(schema.marks.em),
  [CommandIdentifier.FORMAT_CODE]: toggleMark(schema.marks.code),
  [CommandIdentifier.FORMAT_BLOCKQUOTE]: wrapIn(schema.nodes.blockquote),
  [CommandIdentifier.FILE_NEW]: newFile(),
  [CommandIdentifier.FILE_SAVE]: saveFile(),
  [CommandIdentifier.FILE_SAVE_AS]: saveFile({ force: true }),
  [CommandIdentifier.FILE_OPEN]: openFile(),
  [CommandIdentifier.EXPORT_PDF]: exportAs("PDF-Export", exporters.toPDF, [
    { name: "PDF-File", extensions: ["pdf"] },
  ]),
  [CommandIdentifier.THEME_CYCLE]: cycleTheme(),
};

export const keymap = () =>
  _keymap({
    ...baseKeymap,

    ...Object.keys(commandMap).reduce(
      (acc: { [key: string]: Command }, key: string) => {
        acc[getKeyBinding(key as CommandIdentifier)] =
          commandMap[key as CommandIdentifier];
        return acc;
      },
      {},
    ),

    Enter: chainCommands(
      splitListItem(schema.nodes.list_item),
      baseKeymap.Enter,
    ),
    "Mod-Enter": insertNode(schema.nodes.hard_break),
    "Shift-Enter": insertNode(schema.nodes.hard_break),
  });

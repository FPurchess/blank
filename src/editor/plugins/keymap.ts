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
import { sendNotification } from "@tauri-apps/plugin-notification";

import {
  newFile,
  openFile,
  saveFile,
  exportAs,
  cycleTheme,
  chooseLanguage,
  insertNode,
  editLink,
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
  [CommandIdentifier.FORMAT_LINK]: editLink(),
  [CommandIdentifier.FORMAT_BLOCKQUOTE]: wrapIn(schema.nodes.blockquote),
  [CommandIdentifier.FILE_NEW]: newFile(),
  [CommandIdentifier.FILE_SAVE]: saveFile(),
  [CommandIdentifier.FILE_SAVE_AS]: saveFile({ force: true }),
  [CommandIdentifier.FILE_OPEN]: openFile(),
  [CommandIdentifier.EXPORT_PDF]: exportAs("PDF-Export", exporters.toPDF, [
    { name: "PDF-File", extensions: ["pdf"] },
  ]),
  [CommandIdentifier.THEME_CYCLE]: cycleTheme(),
  [CommandIdentifier.LANGUAGE_CHOOSE]: chooseLanguage(),
};

// modifier names people know from their OS, mapped to the ones
// prosemirror-keymap understands
const modifierAliases: { [alias: string]: string } = {
  option: "Alt",
  command: "Meta",
  cmd: "Meta",
  super: "Meta",
};

// the modifiers prosemirror-keymap accepts, see normalizeKeyName there
const knownModifier = /^(mod|s|shift|a|alt|c|ctrl|control|m|meta|cmd)$/i;

/**
 * normalizeBinding maps modifier aliases such as `Option` or `Command` to the
 * names prosemirror-keymap understands
 * @param binding key binding like "Command-Shift-s"
 * @returns the normalized binding, or undefined if it can't be used
 */
export const normalizeBinding = (binding: string): string | undefined => {
  if (typeof binding !== "string" || binding === "") return;
  // split like prosemirror-keymap does, so "Mod--" binds the minus key
  const parts = binding.split(/-(?!$)/);
  const key = parts.pop() as string;
  const modifiers: string[] = [];
  for (const part of parts) {
    const modifier = modifierAliases[part.toLowerCase()] ?? part;
    if (!knownModifier.test(modifier)) return;
    modifiers.push(modifier);
  }
  return [...modifiers, key].join("-");
};

/**
 * bindCommands binds every command to its configured key. Bindings that
 * can't be used are skipped and reported once.
 */
const bindCommands = () => {
  const invalid: string[] = [];
  const bindings = Object.keys(commandMap).reduce(
    (acc: { [key: string]: Command }, key: string) => {
      const binding = getKeyBinding(key as CommandIdentifier);
      const normalized = normalizeBinding(binding);
      if (normalized === undefined) {
        invalid.push(`${key}: ${binding}`);
        return acc;
      }
      acc[normalized] = commandMap[key as CommandIdentifier];
      return acc;
    },
    {},
  );
  if (invalid.length > 0) {
    console.warn("ignored invalid key bindings", invalid);
    sendNotification(
      `Ignored invalid key bindings in blank.json: ${invalid.join(", ")}`,
    );
  }
  return bindings;
};

export const keymap = () =>
  _keymap({
    ...baseKeymap,

    ...bindCommands(),

    Enter: chainCommands(
      splitListItem(schema.nodes.list_item),
      baseKeymap.Enter,
    ),
    "Mod-Enter": insertNode(schema.nodes.hard_break),
    "Shift-Enter": insertNode(schema.nodes.hard_break),
  });

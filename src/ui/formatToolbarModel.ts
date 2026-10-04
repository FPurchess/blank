import type { Command, EditorState } from "prosemirror-state";

import { commandInfo, commandItem, commandLabel } from "../commandList";
import { CommandIdentifier as C } from "../config";
import { openTablePicker } from "../editor/commands/table/tableKey";
import {
  alignmentAt,
  type BlockStyle,
  blockStyleAt,
  inQuote,
  listTypeAt,
  markActive,
} from "../editor/formatState";
import { commandFor } from "../editor/plugins/keymap";
import { schema } from "../markdown";
import { separated } from "../separated";
import type { Anchor, MenuItem, ToolbarItem } from "../state";

// What the formatting toolbar (FormatToolbar.vue) shows: its groups of
// buttons and menus, which of them are pressed and enabled, and what goes
// into its More menu when the window is too narrow for the row.

// the parts the row is made of, in its order, which a narrow window moves
// into the More menu by OVERFLOW_ORDER; `group` puts a separator between
// parts of different groups, and `keep` parts always stay
export type PartId =
  "history" | "style" | "marks" | "lists" | "indent" | "align" | "insert";

interface Part {
  id: PartId;
  group: string;
  keep?: boolean;
  commands?: C[];
  menu?: "style" | "insert";
}

export const PARTS: readonly Part[] = [
  { id: "history", group: "history", keep: true, commands: [C.UNDO, C.REDO] },
  { id: "style", group: "style", keep: true, menu: "style" },
  {
    id: "marks",
    group: "marks",
    keep: true,
    commands: [
      C.FORMAT_BOLD,
      C.FORMAT_ITALIC,
      C.FORMAT_UNDERLINE,
      C.FORMAT_CODE,
      C.FORMAT_LINK,
    ],
  },
  {
    id: "lists",
    group: "blocks",
    commands: [C.BLOCKTYPE_BULLET_LIST, C.BLOCKTYPE_ORDERED_LIST],
  },
  {
    id: "indent",
    group: "blocks",
    commands: [C.FORMAT_BLOCKQUOTE, C.FORMAT_UNINDENT, C.FORMAT_INDENT],
  },
  {
    id: "align",
    group: "align",
    commands: [
      C.FORMAT_ALIGN_LEFT,
      C.FORMAT_ALIGN_CENTER,
      C.FORMAT_ALIGN_RIGHT,
      C.FORMAT_ALIGN_JUSTIFY,
    ],
  },
  { id: "insert", group: "insert", menu: "insert" },
];

// what a narrow window moves into the More menu first
export const OVERFLOW_ORDER: readonly PartId[] = [
  "insert",
  "align",
  "indent",
  "lists",
];

// a button of the row, with the part it is in and the command it runs
export interface FormatItem extends ToolbarItem {
  command: C;
  part: PartId;
}

// what the row shows: a button, a menu's button, the More button or a
// separator between groups; `part` tells which part it belongs to
export type Entry =
  | { kind: "button"; key: string; part: PartId; item: FormatItem }
  | { kind: "menu"; key: string; part: PartId; menu: "style" | "insert" }
  | { kind: "more"; key: string }
  | { kind: "separator"; key: string };

const ALIGNS: Partial<Record<C, string>> = {
  [C.FORMAT_ALIGN_LEFT]: "left",
  [C.FORMAT_ALIGN_CENTER]: "center",
  [C.FORMAT_ALIGN_RIGHT]: "right",
  [C.FORMAT_ALIGN_JUSTIFY]: "justify",
};

/**
 * pressedOf tells whether the button of `id` shows pressed: a mark the caret
 * or the whole selection has, the list or quote it is in, its alignment;
 * undefined for a button that isn't a toggle
 */
export const pressedOf = (id: C, state: EditorState): boolean | undefined => {
  switch (id) {
    case C.FORMAT_BOLD:
      return markActive(state, schema.marks.strong);
    case C.FORMAT_ITALIC:
      return markActive(state, schema.marks.em);
    case C.FORMAT_UNDERLINE:
      return markActive(state, schema.marks.underline);
    case C.FORMAT_CODE:
      return markActive(state, schema.marks.code);
    case C.FORMAT_LINK:
      return markActive(state, schema.marks.link);
    case C.BLOCKTYPE_BULLET_LIST:
      return listTypeAt(state) === "bullet_list";
    case C.BLOCKTYPE_ORDERED_LIST:
      return listTypeAt(state) === "ordered_list";
    case C.FORMAT_BLOCKQUOTE:
      return inQuote(state);
    default:
      return id in ALIGNS ? alignmentAt(state) === ALIGNS[id] : undefined;
  }
};

/**
 * formatItems returns the buttons of the row for `state`: enabled where
 * their command applies, pressed by pressedOf. A button whose state didn't
 * change keeps the object it had in `previous`, so Vue leaves it alone while
 * the user types.
 * @param can whether a command applies (EditorHandle.can)
 * @param run runs the command of `id`
 */
export const formatItems = (
  state: EditorState,
  can: (command: Command) => boolean,
  run: (id: C) => void,
  previous: readonly FormatItem[] = [],
): FormatItem[] => {
  const before = new Map(previous.map((item) => [item.id, item]));
  return PARTS.flatMap((part) =>
    (part.commands ?? []).map((command) => {
      const enabled = can(commandFor(command));
      const checked = pressedOf(command, state);
      const old = before.get(command);
      if (old && old.enabled === enabled && old.checked === checked) {
        return old;
      }
      const { label, icon } = commandInfo(command);
      return {
        id: command,
        label,
        icon,
        command,
        part: part.id,
        enabled,
        checked,
        run: () => run(command),
      };
    }),
  );
};

/**
 * entries returns what the row shows, without the parts in `cut`, which the
 * More button at its end then holds
 */
export const entries = (
  items: readonly FormatItem[],
  cut: ReadonlySet<PartId>,
): Entry[] => {
  const shown = PARTS.filter((part) => !cut.has(part.id));
  const row = separated(shown, null).flatMap((part, index): Entry[] => {
    if (!part) return [{ kind: "separator", key: `separator-${index}` }];
    if (part.menu) {
      return [{ kind: "menu", key: part.menu, part: part.id, menu: part.menu }];
    }
    return items
      .filter((item) => item.part === part.id)
      .map((item) => ({
        kind: "button" as const,
        key: item.id,
        part: part.id,
        item,
      }));
  });
  return cut.size > 0 ? [...row, { kind: "more", key: "more" }] : row;
};

/**
 * overflowCut returns the parts to move into the More menu, in
 * OVERFLOW_ORDER, until the rest and the More button fit `available`; none
 * if everything fits
 * @param widths how wide each part is with its separator
 */
export const overflowCut = (
  widths: Readonly<Record<PartId, number>>,
  moreWidth: number,
  available: number,
): Set<PartId> => {
  const cut = new Set<PartId>();
  let width = PARTS.reduce((sum, part) => sum + widths[part.id], 0);
  if (width <= available) return cut;
  width += moreWidth;
  for (const id of OVERFLOW_ORDER) {
    if (width <= available) break;
    cut.add(id);
    width -= widths[id];
  }
  return cut;
};

const STYLE_COMMANDS: Record<Exclude<BlockStyle, "quote">, C> = {
  paragraph: C.BLOCKTYPE_PARAGRAPH,
  heading1: C.BLOCKTYPE_HEADING1,
  heading2: C.BLOCKTYPE_HEADING2,
  heading3: C.BLOCKTYPE_HEADING3,
  heading4: C.BLOCKTYPE_HEADING4,
  heading5: C.BLOCKTYPE_HEADING5,
  heading6: C.BLOCKTYPE_HEADING6,
  code_block: C.BLOCKTYPE_CODE_BLOCK,
};

const commandOfStyle = (style: BlockStyle) =>
  style === "quote" ? C.FORMAT_BLOCKQUOTE : STYLE_COMMANDS[style];

/**
 * styleLabel names the style of the selected blocks on the style menu's
 * button: "Text", "Heading 2", "Quote", "Code block"; nothing where they
 * differ
 */
export const styleLabel = (style: BlockStyle | null) =>
  style ? commandLabel(commandOfStyle(style)) : "";

const MENU_STYLES: (BlockStyle | "separator")[] = [
  "paragraph",
  "heading1",
  "heading2",
  "heading3",
  "heading4",
  "heading5",
  "heading6",
  "separator",
  "quote",
  "code_block",
];

/**
 * styleMenuItems returns the style menu: Text, the headings, Quote and Code
 * block, each drawn in its style (`look`), the selection's checked. Choosing
 * Text in a quote takes it out of the quote.
 */
export const styleMenuItems = (
  state: EditorState,
  can: (command: Command) => boolean,
  run: (id: C) => void,
): MenuItem[] => {
  const current = blockStyleAt(state);
  return MENU_STYLES.map((style) => {
    if (style === "separator") return style;
    const checked = style === current;
    const command =
      style === "paragraph" && current === "quote"
        ? C.FORMAT_BLOCKQUOTE
        : commandOfStyle(style);
    return commandItem(`style-${style}`, commandOfStyle(style), {
      radio: true,
      checked,
      look: `style-${style}`,
      disabled: !checked && !can(commandFor(command)),
      run: () => {
        if (!checked) run(command);
      },
    });
  });
};

/**
 * insertMenuItems returns the Insert menu: an image, a table (whose picker
 * opens at `anchor`, below the menu's button), a horizontal line and a page
 * break; content blocks come from the blocks pane
 * @param runCommand runs a command, as EditorHandle.run
 */
export const insertMenuItems = (
  can: (command: Command) => boolean,
  run: (id: C) => void,
  runCommand: (command: Command) => void,
  anchor: Anchor,
): MenuItem[] => {
  const item = (id: C) =>
    commandItem(id, id, {
      icon: commandInfo(id).icon,
      disabled: !can(commandFor(id)),
      run: () => run(id),
    });
  const table = openTablePicker(anchor);
  return [
    item(C.INSERT_IMAGE),
    commandItem(C.INSERT_TABLE, C.INSERT_TABLE, {
      icon: commandInfo(C.INSERT_TABLE).icon,
      disabled: !can(table),
      run: () => runCommand(table),
    }),
    item(C.INSERT_HORIZONTAL_RULE),
    item(C.INSERT_PAGE_BREAK),
  ];
};

/**
 * moreMenuItems returns the More menu: the buttons of the parts in `cut`,
 * each with its icon and label, and the Insert menu as a submenu
 */
export const moreMenuItems = (
  items: readonly FormatItem[],
  cut: ReadonlySet<PartId>,
  insert: () => MenuItem[],
): MenuItem[] => {
  const parts = PARTS.filter((part) => cut.has(part.id));
  return separated(parts, null).flatMap((part): MenuItem[] => {
    if (!part) return ["separator"];
    if (part.menu === "insert") {
      return [
        {
          id: "more-insert",
          label: "Insert",
          icon: "plus",
          children: insert(),
        },
      ];
    }
    return items
      .filter((item) => item.part === part.id)
      .map((item) =>
        commandItem(`more-${item.id}`, item.command, {
          icon: item.icon,
          checked: item.checked,
          disabled: !item.enabled,
          run: item.run,
        }),
      );
  });
};

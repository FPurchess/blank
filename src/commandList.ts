import { CommandIdentifier, CommandIdentifier as C } from "./config";

// One list of Blank's commands: what they're called, where they're grouped,
// their icon and the other words a search finds them by. Whatever names a
// command takes its words from here (so far the context menu and tooltips,
// later the menu, its search and the toolbar); the keys
// stay in the keymap (config.ts). Every CommandIdentifier needs an entry,
// which the type below makes sure of. See .claude/rules/design.md.

// the groups, in the order menus and the list of shortcuts show them
export const commandGroups = [
  "File",
  "Export",
  "Edit",
  "Insert",
  "Format",
  "Page",
  "View",
  "Tools",
] as const;

export type CommandGroup = (typeof commandGroups)[number];

export interface CommandInfo {
  id: CommandIdentifier;
  group: CommandGroup;
  // what it's called, in sentence case, ending in "…" when it opens a dialog
  label: string;
  // a shorter label for small buttons, e.g. "H1"
  short?: string;
  // an icon of src/icons.ts
  icon: string;
  // more words a search finds it by, in lower case
  aliases: string[];
}

const COMMANDS: { [K in CommandIdentifier]: Omit<CommandInfo, "id"> } = {
  [C.FILE_NEW]: {
    group: "File",
    label: "New document",
    icon: "file-plus",
    aliases: ["create", "blank", "template", "start"],
  },
  [C.FILE_OPEN]: {
    group: "File",
    label: "Open…",
    icon: "folder-open",
    aliases: ["load", "docx", "word", "import"],
  },
  [C.FILE_SAVE]: {
    group: "File",
    label: "Save",
    icon: "save",
    aliases: ["store", "write"],
  },
  [C.FILE_SAVE_AS]: {
    group: "File",
    label: "Save as…",
    icon: "save",
    aliases: ["rename", "copy"],
  },
  [C.EXPORT_PDF]: {
    group: "Export",
    label: "Export as PDF…",
    icon: "pdf",
    aliases: ["export", "print", "portable"],
  },
  [C.EXPORT_DOCX]: {
    group: "Export",
    label: "Export as Word…",
    icon: "doc",
    aliases: ["export", "docx", "office"],
  },
  [C.UNDO]: { group: "Edit", label: "Undo", icon: "undo", aliases: [] },
  [C.REDO]: { group: "Edit", label: "Redo", icon: "redo", aliases: [] },
  [C.CONTEXT_MENU]: {
    group: "Edit",
    label: "Context menu",
    icon: "more",
    aliases: [],
  },
  [C.INSERT_IMAGE]: {
    group: "Insert",
    label: "Image…",
    icon: "image",
    aliases: ["picture", "photo", "figure"],
  },
  [C.INSERT_TABLE]: {
    group: "Insert",
    label: "Table",
    icon: "table",
    aliases: ["grid", "rows", "columns"],
  },
  [C.INSERT_HORIZONTAL_RULE]: {
    group: "Insert",
    label: "Horizontal line",
    icon: "rule",
    aliases: ["rule", "divider", "separator", "hr"],
  },
  [C.INSERT_PAGE_BREAK]: {
    group: "Insert",
    label: "Page break",
    icon: "page-break",
    aliases: ["new", "page"],
  },
  [C.BLOCKTYPE_PARAGRAPH]: {
    group: "Format",
    label: "Text",
    short: "T",
    icon: "type",
    aliases: ["paragraph", "normal", "body"],
  },
  [C.BLOCKTYPE_HEADING1]: {
    group: "Format",
    label: "Heading 1",
    short: "H1",
    icon: "heading",
    aliases: ["title", "h1"],
  },
  [C.BLOCKTYPE_HEADING2]: {
    group: "Format",
    label: "Heading 2",
    short: "H2",
    icon: "heading",
    aliases: ["h2", "chapter"],
  },
  [C.BLOCKTYPE_HEADING3]: {
    group: "Format",
    label: "Heading 3",
    short: "H3",
    icon: "heading",
    aliases: ["h3", "section"],
  },
  [C.BLOCKTYPE_HEADING4]: {
    group: "Format",
    label: "Heading 4",
    short: "H4",
    icon: "heading",
    aliases: ["h4"],
  },
  [C.BLOCKTYPE_HEADING5]: {
    group: "Format",
    label: "Heading 5",
    short: "H5",
    icon: "heading",
    aliases: ["h5"],
  },
  [C.BLOCKTYPE_HEADING6]: {
    group: "Format",
    label: "Heading 6",
    short: "H6",
    icon: "heading",
    aliases: ["h6"],
  },
  [C.FORMAT_BOLD]: {
    group: "Format",
    label: "Bold",
    icon: "bold",
    aliases: ["strong"],
  },
  [C.FORMAT_ITALIC]: {
    group: "Format",
    label: "Italic",
    icon: "italic",
    aliases: ["emphasis", "em"],
  },
  [C.FORMAT_CODE]: {
    group: "Format",
    label: "Code",
    icon: "code",
    aliases: ["monospace", "inline"],
  },
  [C.FORMAT_LINK]: {
    group: "Format",
    label: "Link…",
    icon: "link",
    aliases: ["url", "hyperlink"],
  },
  [C.BLOCKTYPE_BULLET_LIST]: {
    group: "Format",
    label: "Bulleted list",
    icon: "list",
    aliases: ["ul", "bullets"],
  },
  [C.BLOCKTYPE_ORDERED_LIST]: {
    group: "Format",
    label: "Numbered list",
    icon: "list-ordered",
    aliases: ["ol", "numbers"],
  },
  [C.FORMAT_BLOCKQUOTE]: {
    group: "Format",
    label: "Quote",
    icon: "quote",
    aliases: ["blockquote", "citation"],
  },
  [C.FORMAT_INDENT]: {
    group: "Format",
    label: "Indent",
    icon: "indent",
    aliases: ["sink", "nest"],
  },
  [C.FORMAT_UNINDENT]: {
    group: "Format",
    label: "Outdent",
    icon: "outdent",
    aliases: ["lift", "unindent"],
  },
  [C.PAGE_SETUP]: {
    group: "Page",
    label: "Page setup…",
    icon: "page",
    aliases: ["paper", "margins", "orientation", "a4", "letter"],
  },
  [C.EDIT_HEADER]: {
    group: "Page",
    label: "Header",
    icon: "header",
    aliases: ["running", "head"],
  },
  [C.EDIT_FOOTER]: {
    group: "Page",
    label: "Footer and page numbers",
    icon: "footer",
    aliases: ["page", "numbers"],
  },
  [C.VIEW_OUTLINE]: {
    group: "View",
    label: "Outline",
    icon: "outline",
    aliases: ["headings", "toc", "navigation"],
  },
  [C.VIEW_PAGES]: {
    group: "View",
    label: "Pages / page ends",
    icon: "pages",
    aliases: ["sheets", "desk", "view", "mode"],
  },
  [C.THEME_CYCLE]: {
    group: "View",
    label: "Next theme",
    icon: "palette",
    aliases: ["dark", "light", "color", "appearance"],
  },
  [C.SPELLCHECK_TOGGLE]: {
    group: "Tools",
    label: "Spell check",
    icon: "spell",
    aliases: ["spelling", "dictionary"],
  },
  [C.LANGUAGE_CHOOSE]: {
    group: "Tools",
    label: "Language",
    icon: "globe",
    aliases: ["dictionary", "locale", "autocorrect"],
  },
  [C.SPELLCHECK_NEXT]: {
    group: "Tools",
    label: "Next misspelling",
    icon: "chevron-right",
    aliases: ["spelling", "error"],
  },
  [C.SPELLCHECK_PREVIOUS]: {
    group: "Tools",
    label: "Previous misspelling",
    icon: "chevron-left",
    aliases: ["spelling", "error"],
  },
};

const byId = Object.fromEntries(
  Object.entries(COMMANDS).map(([id, info]) => [id, { id, ...info }]),
) as Record<CommandIdentifier, CommandInfo>;

// every command, by group, in the order of the list above within a group
export const commands: readonly CommandInfo[] = commandGroups.flatMap((group) =>
  Object.values(byId).filter((info) => info.group === group),
);

/**
 * commandInfo returns what the list says about `command`
 */
export const commandInfo = (command: CommandIdentifier) => byId[command];

/**
 * commandLabel returns what `command` is called
 */
export const commandLabel = (command: CommandIdentifier) => byId[command].label;

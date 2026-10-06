import {
  CommandIdentifier,
  CommandIdentifier as C,
  getKeyBinding,
} from "./config";
import type { MenuItem } from "./state";

// One list of Blank's commands: what they're called, where they're grouped,
// their icon and the other words a search finds them by. Whatever names a
// command takes its words from here (the context menu, tooltips, the
// toolbar, the main menu and its search); the keys
// stay in the keymap (config.ts). Every CommandIdentifier needs an entry,
// which the type below makes sure of. See .claude/rules/design.md.

// the groups, in the order menus and the list of shortcuts show them
export const commandGroups = [
  "File",
  "Tabs",
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
  [C.FILE_CLEAR_RECENT]: {
    group: "File",
    label: "Clear recent files",
    icon: "trash",
    aliases: ["recent", "history", "forget"],
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
  [C.FILE_PRINT]: {
    group: "File",
    label: "Print…",
    icon: "print",
    aliases: ["printer", "paper"],
  },
  [C.TAB_CLOSE]: {
    group: "Tabs",
    label: "Close tab",
    icon: "x",
    aliases: ["close", "document", "file"],
  },
  [C.TAB_NEXT]: {
    group: "Tabs",
    label: "Next tab",
    icon: "chevron-right",
    aliases: ["switch", "document"],
  },
  [C.TAB_PREVIOUS]: {
    group: "Tabs",
    label: "Previous tab",
    icon: "chevron-left",
    aliases: ["switch", "document"],
  },
  [C.TAB_REOPEN]: {
    group: "Tabs",
    label: "Reopen closed tab",
    icon: "undo",
    aliases: ["restore", "closed", "again"],
  },
  [C.TAB_MOVE_LEFT]: {
    group: "Tabs",
    label: "Move tab left",
    icon: "column-back",
    aliases: ["reorder"],
  },
  [C.TAB_MOVE_RIGHT]: {
    group: "Tabs",
    label: "Move tab right",
    icon: "column-forward",
    aliases: ["reorder"],
  },
  [C.EXPORT_PDF]: {
    group: "Export",
    label: "Export as PDF…",
    icon: "pdf",
    aliases: ["export", "portable"],
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
  [C.INSERT_BLOCK]: {
    group: "Insert",
    label: "Insert a block",
    icon: "blocks",
    aliases: ["table of contents", "toc", "form", "recipe", "drawing", "embed"],
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
  [C.FORMAT_UNDERLINE]: {
    group: "Format",
    label: "Underline",
    icon: "underline",
    aliases: ["underlined"],
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
  [C.BLOCKTYPE_CODE_BLOCK]: {
    group: "Format",
    label: "Code block",
    icon: "source",
    aliases: ["pre", "fenced", "program"],
  },
  [C.FORMAT_BLOCKQUOTE]: {
    group: "Format",
    label: "Quote",
    icon: "quote",
    aliases: ["blockquote", "citation"],
  },
  // the labels of the table's alignment actions too
  [C.FORMAT_ALIGN_LEFT]: {
    group: "Format",
    label: "Align left",
    icon: "align-left",
    aliases: ["alignment", "left"],
  },
  [C.FORMAT_ALIGN_CENTER]: {
    group: "Format",
    label: "Center",
    icon: "align-center",
    aliases: ["alignment", "centre", "middle"],
  },
  [C.FORMAT_ALIGN_RIGHT]: {
    group: "Format",
    label: "Align right",
    icon: "align-right",
    aliases: ["alignment", "right"],
  },
  [C.FORMAT_ALIGN_JUSTIFY]: {
    group: "Format",
    label: "Justify",
    icon: "align-justify",
    aliases: ["alignment", "justified", "block"],
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
    label: "Footer",
    icon: "footer",
    aliases: ["page", "numbers", "page number", "page numbers"],
  },
  [C.VIEW_OUTLINE]: {
    group: "View",
    label: "Outline",
    icon: "outline",
    aliases: ["headings", "toc", "navigation"],
  },
  [C.VIEW_FOCUS_NEXT]: {
    group: "View",
    label: "Next part of the window",
    icon: "focus",
    aliases: ["focus", "tabs", "toolbar", "keyboard", "f6"],
  },
  [C.VIEW_FOCUS_PREVIOUS]: {
    group: "View",
    label: "Previous part of the window",
    icon: "focus",
    aliases: ["focus", "tabs", "toolbar", "keyboard", "f6"],
  },
  [C.VIEW_TOOLBAR_FOCUS]: {
    group: "View",
    label: "Go to the toolbar",
    icon: "focus",
    aliases: ["formatting", "focus", "keyboard"],
  },
  [C.VIEW_FOCUS_MODE]: {
    group: "View",
    label: "Focus mode",
    icon: "focus-mode",
    aliases: ["distraction", "free", "zen", "hide", "writing"],
  },
  [C.VIEW_PAGES]: {
    group: "View",
    label: "Pages / page ends",
    icon: "pages",
    aliases: ["sheets", "desk", "view", "mode"],
  },
  [C.VIEW_BLOCKS]: {
    group: "View",
    label: "Blocks pane",
    icon: "blocks",
    aliases: ["pane", "sidebar", "insert"],
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
  [C.TOOLS_STATS]: {
    group: "Tools",
    label: "Word count",
    icon: "info",
    aliases: ["statistics", "characters", "reading", "time"],
  },
  [C.APP_SETTINGS]: {
    group: "Tools",
    label: "Settings…",
    icon: "settings",
    aliases: ["preferences", "options", "configuration", "blank.json"],
  },
  [C.APP_SHORTCUTS]: {
    group: "Tools",
    label: "Keyboard shortcuts",
    icon: "keyboard",
    aliases: ["keys", "keymap", "bindings"],
  },
  [C.APP_GUIDE]: {
    group: "Tools",
    label: "Guide",
    icon: "help",
    aliases: ["help", "docs", "manual", "documentation"],
  },
  [C.APP_ABOUT]: {
    group: "Tools",
    label: "About Blank",
    icon: "logo",
    aliases: ["version", "licenses", "website"],
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

/**
 * commandItem returns the menu item of a command, named and with the key as
 * the command list and the keymap have them, e.g. for the context menu, the
 * toolbar's menus and a tab's; `item` may leave the key out
 * (`shortcut: undefined`)
 */
export const commandItem = (
  id: string,
  command: CommandIdentifier,
  item: Omit<Exclude<MenuItem, "separator">, "id" | "label">,
): MenuItem => ({
  id,
  label: commandLabel(command),
  shortcut: getKeyBinding(command) || undefined,
  ...item,
});

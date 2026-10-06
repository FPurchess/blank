---
paths:
  - "src/editor/commands/listKeys.ts"
  - "src/editor/commands/indent.ts"
  - "src/editor/commands/codeIndent.ts"
  - "src/editor/commands/lists.ts"
  - "src/editor/plugins/keymap.ts"
  - "src/editor/plugins/tables/keys.ts"
  - "src/markdown/tabs.ts"
  - "src/importers/docx/tabs.ts"
---

# Lists, Tab and tabs in text

What the keys do in lists and text follows Google Docs and Notion for lists and VS Code for Tab; `docs/guide/writing.md` (Lists, Tabs in text) says it for users.

## Enter and Backspace in lists (`src/editor/commands/listKeys.ts`)

- `enterEmptyItem`, first in the keymap's `Enter`: an item holding only an empty line leaves all its lists, by `liftListItem` level by level in one transaction, so Enter twice always ends the list, however deep (the user's choice; Bear and Obsidian go up one level per Enter). In the middle of a list that splits it, and a nested item's followers stay a list below the new paragraph. Shift-Tab goes up one level.
- `backspaceInList` and `joinAfterList` come before `joinBackward` in the keymap's `Backspace` (and `Shift-Backspace`), which replace `baseKeymap`'s: an empty item is deleted (an only one with its list), except the first of a list at the top, which becomes a paragraph; an item with text goes up a level per press; at the start of the paragraph after a list, its text joins the list's last line, and two lists of a kind that meet join, so two presses on a middle item undo the split. Stock `joinBackward` would make the item a second paragraph of the one above.
- A numbered list split by taking an item out starts its second part at 1 (`restartAfter`), which the user chose; ProseMirror's split copies the first part's `order`.
- Code at the start of an item keeps its own keys: these commands step aside for a `code_block`.

## Tab and Shift-Tab (`src/editor/commands/indent.ts`)

- The keys and the toolbar run different chains (`keyCommands` over `commandMap` in `keymap.ts`): the toolbar enables a button by a dry run of `commandFor(id)`, so that command returns false where it does nothing, while the keys never let the focus leave the text (`keepKey`; F6 does that).
- Order: code (`indentCode`), the items of one list (`inItems`: in a list, the key is kept even where the first item can't go down, and no tab goes into an item), a tab at the cursor or over a selection on one line (`insertTab`, keys only), then a tab in front of every touched paragraph or heading (`indentLines`; a whole line selected counts as several, as in VS Code) with the touched items of lists sunk, the first item of each staying. Shift-Tab takes a leading tab from each line, wherever the cursor is.
- Forms and tables handle Tab before the keymap (fields, cells), but a table's `tab()` lets code in a cell indent.

## Tabs in the file and the documents

- Markdown drops whitespace at the start and the end of a line, and four columns of it start a code block, so `src/markdown/tabs.ts` writes those tabs as `&#9;` (through a private-use placeholder while serializing, since prosemirror-markdown expels whitespace from marks and escapes text). Tabs in code stay as they are, since entities are text there.
- The Word export writes `\t` as Word's `<w:tab/>` (`textOf`), with `defaultTabStop` at 720 twips, the engine's 36 pt (see `layout-engine.md`). The import keeps mammoth's tabs from the parser's whitespace collapsing (`src/importers/docx/tabs.ts`), but drops the tab Word puts at the start of a list item, after a footnote's mark or a list's number.
- The hidden editor sets `tab-size` to the same stops (`src/scss/main.scss`).

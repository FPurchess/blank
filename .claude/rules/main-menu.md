---
paths:
  - "src/ui/LogoButton.vue"
  - "src/ui/mainMenuModel.ts"
  - "src/ui/ContextMenu.vue"
  - "src/ui/MenuList.vue"
  - "src/ui/MenuLineView.vue"
  - "src/ui/menuModel.ts"
  - "src/ui/composables/useMenuLevels.ts"
  - "src/ui/composables/useMenuButton.ts"
  - "src/commandSearch.ts"
  - "src/state/mainMenu.ts"
  - "src/state/recent.ts"
  - "src/editor/commandRun.ts"
  - "src/editor/commands/mainMenu.ts"
  - "src/editor/commands/recentFiles.ts"
---

# The main menu

The logo at the left of the tab row (`LogoButton.vue`) opens the main menu, as `Mod-k` (`menu.main`) does from anywhere. It's the context menu (`ContextMenu.vue`) with a search above it: one `ContextMenuRequest` with `search` (what it finds, and what it says when it finds nothing). Its box (`#main-menu`, a dialog named "Main menu", which the logo's `aria-haspopup` says) is placed once with `place(…, { fill: true })`: at most as tall as the window allows below the logo (`place()` sets its `max-height` before it measures), and a resize closes it. There's no second menu component: what the main menu adds is in the item kinds, `useMenuLevels` and `MenuList`'s `embedded` and `found`.

## What it lists (`mainMenuItems`, `src/ui/mainMenuModel.ts`)

Top to bottom, sections between separators:

1. **Recent**: up to 3 of the commands used last that can run now (`recentForMenu`), without what the menu shows anyway (`MENU_SHOWN`) and without the Edit, Format and Tabs commands their key ran (typing, not choosing). The section is left out while there are none.
2. **File** (`FILE_COMMANDS`, one array): New, Open, Open recent ▸, Save, Save as, Export ▸ (`EXPORT_COMMANDS`: PDF, Word). Print goes after Export, and Export signed PDF into Export, when they're there; whichever lands second adds its row with a test.
3. **Edit** row: Undo, Redo, Find and replace.
4. **View** row: the blocks pane, the outline, pages / page ends, focus mode, as switches (`menuitemcheckbox`). The blocks pane closes the menu, since it opens with the focus in its search.
5. **Zoom** row: −, the zoom (a click fits), +; disabled without the engine (`ZOOM_NEEDS_PAGES`).
6. **Theme** row: a swatch per theme (`menuitemradio`, drawn with `data-theme` in that theme's paper and ink).
7. Settings…, Keyboard shortcuts, Guide (the website's guide, `GUIDE` in `src/links.ts`), About Blank.

The View (but the blocks pane), Zoom and Theme items `stay`: the menu stays open when they run, without the editor taking the focus, and `LogoButton` re-issues its request, the search's too (`useMenuButton.update`), when what they change changes, so they show it at once; an open submenu stays through it. Undo, Redo and Find close it. A switch that is on keeps its look when focused, with the focus ring.

## Item kinds (`src/state/popups.ts`)

A level holds `MenuLine`s: items (`MenuItem`), separators, a `MenuHead` (the name of the section after it; `shown` or only read out) and a `MenuRow` (items side by side after its label). `menuModel.ts` is the one keyboard model of all menus: `step` skips heads, a row is focusable while it has an enabled item, `rowStep` moves along a row without wrapping, `indexAfterUpdate` finds a line again by its id and keeps the column of a row. `MenuList` renders the sections with heads as `role="group"` named by the head, and a menu without heads as one flat list; one line is `MenuLineView.vue`. An item may carry `command` (its key in the tooltip), `tip` (the tooltip of an icon, or why it's disabled), `match` (the part of the label a search marked), `stays` and `swatch`.

`useMenuLevels` (`src/ui/composables/`) holds the open levels and their keys for every menu: ↑↓ Home End, ←→ along a row and into and out of submenus, Enter and Space, typeahead, Esc and Tab, a text field in an item, and the update of an open menu by a request with the same `close`. Its options are the main menu's: the search's results as the first level (`levelZero`), the search keeping the focus while it shows them (`searching`, `focusSearch`), and letters typed in the list going to the search (`onPrintable`).

## The search

- `src/commandSearch.ts` searches the command list (`commandList.ts`) by label, group and aliases: `matchCommands` in the list's order (the settings' shortcuts), `rankCommands` ranked (the label starts with the query, then a word of it, then the label contains it, then only an alias or the group), the commands used last first within a rank, at most `SEARCH_LIMIT`. The main menu's search never offers `menu.main`, `menu.context`, `file.clear_recent` or the focus keys F6, Shift-F6 and Alt-F10, whose focus the closing menu would take back (`MAIN_MENU_UNSEARCHED` in `mainMenuModel.ts`).
- The field is a combobox (`SearchField`, which can put the cursor at the end of what it holds) whose popup, while it searches, is a `listbox` of `option`s with `aria-activedescendant`: the focus stays in the field, ↑↓ move the active one, Enter runs it, the pointer makes one active. ↓ in the empty field goes into the menu at its top, ↑ at its bottom, and ↑ on the first line back to the search. Esc clears the query, then closes; Esc in the list closes. `menu.main`'s key while it's open, in a submenu too, goes back to the search (`onCommandKey` on the menus' container, since the window's keys rest while a menu is open). The number found is announced once typing rests.

## Recent commands and files (`src/state/recent.ts`)

- **Commands** are recorded in one place: `recorded` (`src/editor/commandRun.ts`), which wraps a command so it remembers its id when it runs with `dispatch` and does something. `commandFor(id)` (the UI) and `bindingsOf` (the keys) hand out wrapped commands, so a component runs a command through `editor.run(commandFor(id))`, never its own function, or the run isn't remembered. Ctrl+wheel zooms through `zoomStep` itself, unrecorded: it's no command the user chose. `can()` passes no `dispatch` and records nothing. `UNRECORDED` leaves out what only moves the focus or opens a menu (F6, Alt-F10, Shift-F10, `menu.main`, `file.clear_recent`). A command must do nothing without `dispatch`: the menu asks every command it shows.
- **Files** are their canonical paths, remembered when `readTabs` opens one (also one already open) and when `saveTabNow` saves one. `openRecentFile` checks the file is there, says "‹name› isn't there any more" and forgets it if not (logged as info with its path; a check that fails is logged as a warning), and opens it through `openPaths`, which shows its tab if it's open.
- Both are restored in `bootStorage` with `restore`, and cleaned of what Blank no longer knows (`cleanRecentCommands`, `cleanRecentFiles`); `pushRecent` returns the same list when the item is first already, so a repeated command writes nothing.

## The logo in the tab row

The logo is the first stop of the tab row's roving focus: ← on the first tab and Home go to it (`tabKey` → `"logo"`), →, ←, Home, End and Esc leave it (`logoKey`), and Enter, Space or ↓ open the menu. A menu opened from the logo with the keyboard gives it the focus back when it closes; one opened by a click or the key gives it to the text.

---
paths:
  - "src/ui/settings/**"
  - "src/config.ts"
  - "src/keyNames.ts"
  - "src/editor/keyBindings.ts"
  - "src/editor/plugins/keymap.ts"
  - "src/state/settingsDialog.ts"
---

# Settings

The settings dialog (`Mod-,`, `app.settings`) changes Blank's settings, and every change applies at once. There's no mouse path to it until the main menu exists, which the maintainer decided.

## Where a setting lives

- **blank.json** (`src/config.ts`) holds what it held before the dialog existed: the keymap, autocorrect (the groups and `replace`), the spell check flags, `editor.indentSize`, `focusMode.hideAfter` and `layout.page`. It stays the one source of truth for these, and users can still edit it by hand; hand edits need a restart, as before.
- **localforage** (`src/storage.ts`) keeps the theme, the language and spell check on/off, through the refs `theme`, `language` and `spellcheck`, which the dialog assigns directly. They change often from the keyboard and the status bar, and are part of the session, not of the configuration.

## One writer: `saveSettings`

- `saveSettings(changes)` is the only code that writes blank.json; `saveDefaultPage` calls it.
  - A change is `{ path, value }`. Without a value, the setting goes back to its default.
  - `changes` may also be a function of the file as read, for a change that builds on it, e.g. the replacements of a language: it never overwrites what was written by hand since Blank started.
- **What it writes:**
  - It re-reads the file every time, and refuses (`false`, with a notification unless `notify: false`) to touch a file that isn't a JSON object.
  - It leaves out a value equal to the default (a key binding by `sameBinding`) and prunes objects left empty, so the file holds only what the user changed. Every merge reads `{}` like a missing key.
  - It writes `blank.json.tmp` and renames it.
- **Order and identity:**
  - Writes run one after the other, through one queue.
  - After a write, `config.value` is `mergeConfig` of the file, with every unchanged section kept as the same object (`keepUnchanged`). That matters: `pageLayout` re-lays out the document when `layout` changes, and the keymap is rebuilt when `keymap` changes.
- `defaults` is the default config, for what a reset goes back to.

## The live keymap

- Nothing reads a binding once and keeps it. `liveKeys(build)` (`src/editor/keyBindings.ts`) returns a keydown handler that rebuilds its bindings whenever `config.value.keymap` is a new object, and `commandKey(id, run)` is the one-command form ("the key that opened the picker closes it").
- The editor's `keymap()` plugin is built on it. Every tab's state shares the plugin (`base.plugins`, `tabs.ts`), so a changed key works at once in the shown tab, in background tabs and in new ones, without reconfiguring states.
- The other handlers use it too: `commandKeys` (the window's keys, `useWindowCommands`), the language picker, the table picker, table mode and the blocks pane. A new one must too.
- Invalid bindings typed into blank.json are reported once, at the start.
- `canonicalBinding` and `sameBinding` (`src/keyNames.ts`, no imports from the config) say when two bindings are the same key on the platform. Compare bindings with them, never as strings.
- **Recording a key** (`shortcutsModel.ts`):
  - It names the key as prosemirror-keymap matches it, through the key code when a modifier is held, so layouts and Option don't change the letter.
  - It refuses keys the text or the window needs (`REFUSED`, and Option with a letter or digit on macOS).
  - It moves a key another command has only on a second press. A reset does the same, so the dialog never makes two commands share a key.

## The dialog

- `SettingsDialog.vue` is a `BaseDialog` with a vertical tablist of `SECTIONS` (`settingsModel.ts`, ↑↓ through `useRovingFocus(…, "vertical")`) and a tabpanel.
- **Height:** it measures `.settings-body` on Appearance once and keeps that height, so it never jumps; longer sections scroll.
- **Opening:** `settingsSection` (`src/state/settingsDialog.ts`) is the section it opens on again.
- **Inner pages:** your replacements, your dictionary and the licenses show in place of their section (`useInnerPage`). The section stays mounted but `hidden`, so Back gives the focus back to the button that opened the page. `InnerPage.vue` makes Esc go back instead of closing.
- **Licenses:** `LicensesPage.vue` loads the notices only when it opens and draws them a block of `NOTICE_LINES` at a time, one per frame (`chunksOf`, `aboutModel.ts`): drawn at once, the 11,000 lines held the webview up for most of a second.
- **Enter:** BaseDialog submits on Enter. In a field of the settings, Enter is the field's (`enterInField`), so it never closes the dialog.
- **Recording:** while a shortcut is recorded, a capture listener on the form takes every key.
- **Rows** are `SettingRow`s, and a switch is a `SwitchRow` (the row names the switch, and a click on its label switches it). Lists of entries are `EntryList`s, with a filter from `FILTER_FROM` entries on. A change goes through `save(changes, message)`, which announces the message once it's saved.

## Adding a setting

1. Add it to `Config`, `defaultConfig` and its merge in `src/config.ts` (reported as `section.key` when invalid), and to the reference `blank.json` and `docs/guide/configuration.md`.
2. Read it from `config.value` where it's used, at the time it's used, so it applies at once.
3. Add its row to the section it belongs to, writing it with `save([{ path, value }], message)`.
4. Document it in `docs/guide/settings.md`.

A new bindable command needs nothing in the dialog: the shortcuts list every command of `commandList.ts`.

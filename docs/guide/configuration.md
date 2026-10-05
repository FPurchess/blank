# Configuration

Blank reads its settings from `blank.json` in the app config folder. The file is optional: list only what you want to change, everything else keeps its default.

The [settings](./settings) (`Mod` `,`) write this file for you and apply each change at once. They keep only what differs from the defaults, and leave the rest of the file, including settings they don't show, as you wrote it.

| System  | Config file                                                           |
| ------- | --------------------------------------------------------------------- |
| Linux   | `~/.config/com.github.fpurchess.blank/blank.json`                     |
| Snap    | `~/snap/blank/current/.config/com.github.fpurchess.blank/blank.json`  |
| macOS   | `~/Library/Application Support/com.github.fpurchess.blank/blank.json` |
| Windows | `%APPDATA%\com.github.fpurchess.blank\blank.json`                     |

Restart Blank after changing the file by hand. If the file is not valid JSON, Blank ignores it and uses the defaults. A single setting that Blank can't use, such as `"false"` in quotes instead of `false`, or a shortcut for a command it doesn't know, never stops Blank from starting: it keeps the default for that setting and tells you which ones it ignored. Other names it doesn't know are skipped.

## Keyboard shortcuts

Map a command to a key under `keymap`. Keys are written like `Mod-Shift-s`, where `Mod` is `Cmd` on macOS and `Ctrl` elsewhere. This example saves with `Ctrl` `Alt` `S` and exports the PDF with `Mod` `P`:

```json
{
  "keymap": {
    "file.save": "Ctrl-Alt-s",
    "export.pdf": "Mod-p"
  }
}
```

The tab commands are named `tab.…`, e.g. `"tab.close": "Mod-w"`. `Ctrl` `Page Up` and `Ctrl` `Page Down` always go to the previous and next tab too, unless you give those keys to another command.

An empty key, `""`, takes a command's key away. A code block has none to start with: give it one here if you make code blocks often, e.g. `"blocktype.code_block": "Mod-Alt-k"`.

You can also write the modifiers the way your keyboard names them: `Option` works like `Alt`, and `Command`, `Cmd` and `Super` work like `Meta`. Case doesn't matter, so `option-p` is fine too.

::: details The default configuration, with every command and its key
<<< @/../blank.json
:::

## Autocorrect

Each [group](./autocorrect#what-gets-corrected) can be turned off with `false`. `replace` adds your own replacements, either for all languages (`*`) or for one:

```json
{
  "autocorrect": {
    "capitalize": false,
    "replace": {
      "*": { "btw": "by the way" },
      "de": { "mfg": "Mit freundlichen Grüßen" }
    }
  }
}
```

The groups are `arrows`, `dashes`, `symbols`, `formatting`, `links`, `quotes`, `capitalize` and `blocks`. All are on by default. A replacement for a language also applies to its regional variants: one for `de` works in `de-CH` too.

## Spell check

[Spell check](./spelling) leaves words in capitals and words with digits alone. Set these to `false` to check them as well:

```json
{
  "spellcheck": {
    "ignoreUppercase": false,
    "ignoreWordsWithNumbers": false
  }
}
```

The words you add to the dictionary are kept next to `blank.json`, in the `dictionaries` folder.

## Code blocks {#code-blocks}

`Tab` and `Shift` `Tab` indent and outdent the lines of a [code block](./writing#code) by 4 spaces. Set another indent size, from 1 to 16 spaces, with `indentSize`; it's also how wide a tab counts there:

```json
{
  "editor": {
    "indentSize": 2
  }
}
```

## Focus mode {#focus-mode}

In [focus mode](./writing#focus-mode), the bars fade when you type, and also once the mouse has rested for `hideAfter` seconds, 3 by default. `0` fades them only when you type; up to 60 seconds work:

```json
{
  "focusMode": {
    "hideAfter": 10
  }
}
```

## Forms {#forms}

Your own forms are form definitions, YAML files in the `forms` folder next to `blank.json`. See [Your own forms](./blocks#your-own-forms) for what they say.

## Page setup {#page-setup}

`layout.page` is the [page setup](./pages) of documents that don't have their own. **Make this my default** in the page setup writes it for you:

```json
{
  "layout": {
    "page": {
      "size": "a5",
      "orientation": "portrait",
      "margins": "2cm"
    }
  }
}
```

It takes the same settings as the [properties of a file](./pages#frontmatter). The default `size` is `auto`, the paper of your region. Headers and footers belong to each document, so **Make this my default** leaves them out. To number the pages of every document, add them here yourself, e.g. `"footer": { "center": "{page}" }`.

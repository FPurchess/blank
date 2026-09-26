# Configuration

Blank reads its settings from `blank.json` in the app config folder. The file is optional: list only what you want to change, everything else keeps its default.

| System  | Config file                                                           |
| ------- | --------------------------------------------------------------------- |
| Linux   | `~/.config/com.github.fpurchess.blank/blank.json`                     |
| Snap    | `~/snap/blank/current/.config/com.github.fpurchess.blank/blank.json`  |
| macOS   | `~/Library/Application Support/com.github.fpurchess.blank/blank.json` |
| Windows | `%APPDATA%\com.github.fpurchess.blank\blank.json`                     |

Restart Blank after changing the file. If the file is not valid JSON, Blank ignores it and uses the defaults. A single setting that Blank can't use, such as a key it doesn't know or `"false"` in quotes instead of `false`, never stops Blank from starting: it keeps the default for that setting and tells you which ones it ignored.

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

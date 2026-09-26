# Configuration

Blank reads its settings from `blank.json` in the app config folder. The file is optional: list only what you want to change, everything else keeps its default.

| System  | Config file                                                           |
| ------- | --------------------------------------------------------------------- |
| Linux   | `~/.config/com.github.fpurchess.blank/blank.json`                     |
| macOS   | `~/Library/Application Support/com.github.fpurchess.blank/blank.json` |
| Windows | `%APPDATA%\com.github.fpurchess.blank\blank.json`                     |

Restart Blank after changing the file. If the file is not valid JSON, Blank ignores it and uses the defaults.

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

::: details All commands and their default keys
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

The groups are `arrows`, `dashes`, `symbols`, `formatting`, `links`, `quotes`, `capitalize` and `blocks`. All are on by default.

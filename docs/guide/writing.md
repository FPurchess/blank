# Writing in Blank

Blank shows your text as it will look, not as markdown syntax. There are no toolbars: you format with [keyboard shortcuts](./shortcuts) or by typing markdown, which Blank turns into formatting as you go.

<img class="shot" src="/screenshots/theme-light.png" alt="A document in Blank's light theme" />

## Format as you type

At the start of an empty line, type one of these to turn the line into a block:

| Type at the start of a line | Then  | You get         |
| --------------------------- | ----- | --------------- |
| `#` … `######`              | Space | Heading 1–6     |
| `-` `*` `+`                 | Space | Bullet list     |
| `1.` (any number)           | Space | Numbered list   |
| `>`                         | Space | Blockquote      |
| `---` `***` `___`           | Enter | Horizontal line |
| ` ``` ` or ` ```lang `      | Enter | Code block      |

Inline markdown works too: `**bold**`, `*italic*`, `` `code` ``, `[title](url)` and plain URLs become formatting once you finish the word. See [Autocorrect](./autocorrect) for everything Blank corrects.

## Blank remembers your document

Blank keeps what you write as you go, at least once a second and once more when you close the window, and restores it on the next start, together with the open file, the theme and the language. So you can close the window mid-thought without saving, and pick up right where you left off.

## Save, open and export

Documents are plain markdown files, so any other editor can open them.

| Command       | Shortcut          |
| ------------- | ----------------- |
| New file      | `Mod` `N`         |
| Open file     | `Mod` `O`         |
| Save          | `Mod` `S`         |
| Save as       | `Mod` `Shift` `S` |
| Export as PDF | `Mod` `Alt` `P`   |

`Mod` is `Cmd` on macOS and `Ctrl` on Windows and Linux.

## The status bar

The top of the window shows the open file, or _Untitled_. The bottom shows the word and character count and the [autocorrect language](./autocorrect#language).

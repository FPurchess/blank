# Keyboard shortcuts

`Mod` is `Cmd` on macOS and `Ctrl` on Windows and Linux. All shortcuts except the line break, `Mod` + Click and `Ctrl` `Page Up` / `Page Down` can be changed.

## Change a shortcut

Open **Settings** with `Mod` `,` and choose **Keyboard shortcuts**. Click the key of a command (or press `Enter` on it) and press the new keys: they work at once, in every tab. `Esc` cancels, and `Backspace` removes the shortcut.

- A shortcut needs `Ctrl` or `Alt` (on macOS `Cmd`, `Ctrl` or `Option`) with a key, or is an F key on its own.
- If another command already has the keys, Blank says which one. Press them again to move them to the new command; the other one is then left without a shortcut.
- A changed shortcut has a reset button next to it, and **Reset all** brings back every default.
- Some keys stay with what they do everywhere, and Blank says why when you press them: `Mod` `A`, `C`, `V` and `X`, `Mod` `Backspace` and `Delete`, `Ctrl` `Page Up` / `Page Down`, `Alt` `F4` on Windows and Linux, and on macOS `Option` with a letter or digit (it types a character) and the text keys `Ctrl` `A`, `E`, `H` and `D`, `Option` `Backspace` and `Delete`, and `Ctrl` `Option` `Backspace`.

The shortcuts are kept in [blank.json](./configuration#keyboard-shortcuts), which you can also edit by hand.

::: info Keyboards with AltGr
On keyboard layouts that type characters with `AltGr` (Polish, German and many more), Windows and Linux report `AltGr` as `Ctrl` `Alt`. A shortcut with `Ctrl` `Alt` and a key that `AltGr` uses on your layout then runs the command instead of typing the character. Choose another key for that command in the settings.
:::

## Files

| Command                                     | Shortcut          |
| ------------------------------------------- | ----------------- |
| New document                                | `Mod` `N`         |
| Open file                                   | `Mod` `O`         |
| Save                                        | `Mod` `S`         |
| Save as                                     | `Mod` `Shift` `S` |
| [Print](./print)                            | `Mod` `P`         |
| Export as PDF                               | `Mod` `Alt` `P`   |
| Export as Word                              | `Mod` `Alt` `W`   |
| Page setup                                  | `Mod` `Alt` `U`   |
| Edit header                                 | `Mod` `Alt` `H`   |
| Edit footer                                 | `Mod` `Alt` `F`   |
| [Pages or page ends](./pages#on-the-screen) | `Mod` `Alt` `V`   |
| [Outline](./pages#outline)                  | `Mod` `Alt` `O`   |
| [Word count](./writing#the-status-bar)      | `Mod` `Alt` `C`   |
| Cycle themes                                | `Mod` `Alt` `T`   |
| Choose language                             | `Mod` `Alt` `L`   |
| [Focus mode](./writing#focus-mode)          | `Mod` `Shift` `F` |
| [Settings](./settings)                      | `Mod` `,`         |

## Tabs and moving around

| Command                                           | Shortcut                                  |
| ------------------------------------------------- | ----------------------------------------- |
| [Next tab](./writing#tabs)                        | `Ctrl` `Tab`, or `Ctrl` `Page Down`       |
| Previous tab                                      | `Ctrl` `Shift` `Tab`, or `Ctrl` `Page Up` |
| Close tab                                         | `Mod` `W`                                 |
| Reopen the file closed last                       | `Mod` `Shift` `T`                         |
| Move tab left                                     | `Ctrl` `Shift` `Page Up`                  |
| Move tab right                                    | `Ctrl` `Shift` `Page Down`                |
| Go to the tabs, the toolbar, and back to the text | `F6`                                      |
| The other way round                               | `Shift` `F6`                              |
| Go to the toolbar                                 | `Alt` `F10`                               |

## Editing

| Command                     | Shortcut                                                     |
| --------------------------- | ------------------------------------------------------------ |
| Undo                        | `Mod` `Z`                                                    |
| Redo                        | `Mod` `Shift` `Z`                                            |
| Insert line break           | `Shift` `Enter`                                              |
| A screen up / down          | `Page Up` / `Page Down`                                      |
| Start / end of the line     | `Home` / `End`                                               |
| Start / end of the document | `Ctrl` `Home` / `Ctrl` `End`, on macOS `Cmd` `↑` / `Cmd` `↓` |

Add `Shift` to the last three to select as you go. When a block like a table of contents or an embed is selected, `↑` and `↓` move on to the text above or below it.

## Blocks

| Command                         | Shortcut        |
| ------------------------------- | --------------- |
| Paragraph                       | `Mod` `0`       |
| Heading 1 – 6                   | `Mod` `1` … `6` |
| Bullet list, on or off          | `Mod` `8`       |
| Numbered list, on or off        | `Mod` `9`       |
| Code block                      | (none)          |
| Indent list item                | `Tab`           |
| Outdent list item               | `Shift` `Tab`   |
| Indent code lines               | `Tab`           |
| Outdent code lines              | `Shift` `Tab`   |
| Tab, in text                    | `Tab`           |
| Take away a tab at line start   | `Shift` `Tab`   |
| Blockquote, on or off           | `Mod` `G`       |
| Horizontal line                 | `Mod` `H`       |
| Page break                      | `Mod` `Enter`   |
| Table                           | `Mod` `T`       |
| [Insert a block](./blocks#pane) | `Mod` `Alt` `B` |

## Forms

| Command                         | Shortcut              |
| ------------------------------- | --------------------- |
| Next / previous field           | `Tab` / `Shift` `Tab` |
| Next field, from a one-line one | `Enter`               |
| New line, in a one-line field   | `Shift` `Enter`       |
| Select the whole form           | `Escape`              |

## Tables

| Command                         | Shortcut                 |
| ------------------------------- | ------------------------ |
| Insert a table                  | `Mod` `T`, arrows, Enter |
| Next / previous cell            | `Tab` / `Shift` `Tab`    |
| Add a row (in the last cell)    | `Tab`                    |
| New line in a cell              | `Enter`                  |
| Select cells                    | `Shift` + arrow keys     |
| Select the cell, then the table | `Mod` `A`                |
| Clear the selected cells        | `Backspace` or `Delete`  |
| Table mode, in a table          | `Mod` `T`                |

In your text, `Tab` never takes you out of it: `F6` does that. See [Lists](./writing#lists) for what Enter and Backspace do in a list, and [Tabs](./writing#tabs-in-text) for tabs in your text.

In table mode, the arrow keys insert rows and columns, `Shift` + arrows move them, and letters align (`L` `C` `R`), sort (`S`), merge (`M`) and switch headers (`H`). See [Change a table](./tables#change) for all keys.

## Text

| Command              | Shortcut          |
| -------------------- | ----------------- |
| Bold                 | `Mod` `B`         |
| Italic               | `Mod` `I`         |
| Underline            | `Mod` `U`         |
| Code                 | `Mod` `E`         |
| Insert or edit link  | `Mod` `Alt` `K`   |
| Open link in browser | `Mod` + Click     |
| Insert or edit image | `Mod` `Alt` `I`   |
| Align left           | `Mod` `Shift` `L` |
| Center               | `Mod` `Shift` `E` |
| Align right          | `Mod` `Shift` `R` |
| Justify              | `Mod` `Shift` `J` |

The link dialog moved from `Mod` `K` to `Mod` `Alt` `K`.

## Spell check

| Command                     | Shortcut                      |
| --------------------------- | ----------------------------- |
| Turn spell check on or off  | `Mod` `Alt` `S`               |
| Next misspelled word        | `Mod` `Alt` `N`               |
| Previous misspelled word    | `Mod` `Alt` `Shift` `N`       |
| Open the menu at the cursor | `Shift` `F10` or the menu key |

See [Spell check](./spelling) for what the menu offers.

You can also create most of these by typing markdown. See [Format as you type](./writing#format-as-you-type).

# Settings

Press `Mod` `,` to open the settings. Everything you change applies at once, in every tab, and stays after a restart: there is nothing to save and no need to start Blank again. Close them with **Close** or `Esc`.

<Shot src="settings.png" alt="The settings over a document: the sections Appearance, Writing, Spelling, Keyboard shortcuts and About on the left, and the theme cards and the focus mode choice on the right" />

The sections are listed on the left; `↑` and `↓` move between them, and the settings open again on the section you saw last.

## Appearance

<Shot src="settings-appearance.gif" single alt="The theme cards in the settings: a click on Dark, then Blue, then Light colors the whole window and the page behind the dialog at once; then the focus mode choice goes from 3 to 10 seconds and back" />

- **Theme:** click a card to switch to that [theme](./themes). Each card shows the theme's own colors, and the window behind the settings changes with it, so you see your pages in it right away. `Mod` `Alt` `T` cycles through the themes without opening the settings.
- **In focus mode, hide the controls:** when [focus mode](./writing#focus-mode) lets the tabs, the toolbar and the status bar fade. They always fade as soon as you type. Choose whether they also fade once the mouse has rested for 3 seconds (where Blank starts) or 10 seconds, or only when you type.

## Writing

<Shot src="settings-writing.gif" alt="In the Writing section, the switch for dashes goes off and on again; Edit… opens Your replacements, where btw becomes by the way; back in the document, typing see you soon btw turns into See you soon by the way" />

- **Autocorrect:** one switch for each group of [autocorrect](./autocorrect), each with an example of what it does:

  | Switch                 | What it does                                          |
  | ---------------------- | ----------------------------------------------------- |
  | Arrows                 | `->` becomes →, `==>` becomes ⇒                       |
  | Dashes                 | `A - B` becomes A – B, `A--B` becomes A—B             |
  | Symbols                | `(c)` becomes ©, `1/2` becomes ½, `<=` becomes ≤      |
  | Typographic quotes     | quotes in the style of the language, like “…” or „…“  |
  | Capitalize sentences   | a capital at the start of a sentence, and fixes _THe_ |
  | Formatting as you type | `**bold**`, `*italic*` and `` `code` ``               |
  | Blocks as you type     | `#` heading, `-` list, `>` quote, `---` line          |
  | Links                  | web and email addresses become links                  |

- **Your replacements:** click **Edit…** to add text that Blank replaces for you, such as `btw` → `by the way`: type what you type into **Typed**, what it becomes into **Becomes**, and press `Enter`. Choose at the top whether a replacement is for every language or only the one you write in now. Blank replaces it once the word is complete, when you type a space, punctuation, `Tab` or `Enter` after it, and yours come before Blank's own. The bin next to one removes it. `Esc` or **Back** brings you back to the section.
- **Indent size:** how many spaces `Tab` indents a line of a [code block](./writing#code) by, from 1 to 16.

## Spelling

<Shot src="settings-spelling.gif" alt="In the Spelling section, Check spelling is turned on; back in the document, blankword is underlined; in the settings again, Edit… opens Your dictionary, where blankword is added, and the underline goes" />

- **Check spelling** turns [spell check](./spelling) on or off, like `Mod` `Alt` `S` and the _Spelling_ button in the status bar.
- **Language** chooses the language of spell check and autocorrect, like `Mod` `Alt` `L`. A language that doesn't come with Blank is downloaded the first time you check it.
- **Ignore words in capitals** and **Ignore words with numbers** leave words like _NASA_ or _mp3_ alone. The text is checked again as soon as you change them.
- **Your dictionary:** click **Edit…** to see the words you added in the current language, add new ones and remove others. Underlines go and come at once. **Add to dictionary** in the menu of an underlined word adds it too.

## Keyboard shortcuts

<Shot src="settings-shortcuts.gif" alt="In the Keyboard shortcuts section, the search for pdf finds Export as PDF; a click on its shortcut and Ctrl Shift P give it new keys, and the reset button next to it brings back Ctrl Alt P" />

Every command, with its shortcut. Type into the search to find one by its name. Click a shortcut, or press `Enter` on it, and press the new keys: they work at once, in every tab. If another command has them already, Blank says which one, and a second press moves them over. A changed shortcut has a button next to it that brings back Blank's own, and **Reset all** does that for every command. See [Change a shortcut](./shortcuts#change-a-shortcut) for the keys you can use.

## About

Blank's version, its license, links to the website and the source code, and the licenses of the software Blank is built with.

## Where the settings are kept

The theme, the language and whether spell check is on are kept with your documents. Everything else is written to [blank.json](./configuration), which only holds what you changed. You can still edit that file by hand; then restart Blank to use what you wrote.

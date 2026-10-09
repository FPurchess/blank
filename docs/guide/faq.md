# FAQ

## macOS says Blank "cannot be opened" or "is damaged"

Blank is not notarized by Apple. See [Install → macOS](./install#macos) for how to allow it.

## Where are my documents stored?

Files you save are ordinary markdown files wherever you saved them. On top of that, Blank keeps every open tab in its own app storage, unsaved changes included, and restores them on the next start, so closing the window doesn't lose anything. `Mod` `N` opens a new tab and leaves the others as they are. This is not a backup, though: a tab you close with **Don't save** is gone, so save what you want to keep.

## Why did Blank change what I typed?

That's [autocorrect](./autocorrect). Press `Mod` `Z` right away to undo a single correction, or [turn a group off](./configuration#autocorrect).

## The quotes look wrong for my language

Quotes follow the language at the bottom right. Press `Mod` `Alt` `L` to [choose yours](./autocorrect#language).

## Does Blank check my spelling?

If you want it to: press `Mod` `Alt` `S`. See [Spell check](./spelling).

## Does Blank send my text anywhere?

No. There's no account, and nothing you write leaves your computer. Blank keeps a [log](#log) of what went wrong, on your computer only. Blank downloads two things from the internet: a [spell check dictionary](./spelling#languages) when you check a language that doesn't come with Blank, and the images from the web that your documents show and that your PDF and Word exports include.

## Can I use the mouse?

Yes, though every command also has a key. You can click to place the cursor, select text and drag it somewhere else, click a header or footer on the page to change it or point at a margin to add one, and `Mod` + Click a link to open it. The [toolbar](./writing#toolbar) formats and inserts with a click, the [tabs](./writing#tabs) switch, close and move with the mouse, and [tables](./tables) have handles for it too.

On Linux, middle-click pastes as in your other apps: the text you select in Blank is the one a middle click pastes elsewhere, and a middle click in Blank pastes the text you selected last, in Blank or in any other app, right where you click. It comes in as plain text.

## Can I edit a Word document with Blank?

You can open it with `Mod` `O`: Blank turns it into a markdown document and leaves the Word file as it is. When you're done, save it as markdown with `Mod` `S`, or send it back as a Word document with `Mod` `Alt` `W`. Blank never writes markdown into a .docx, so the original can't get lost by accident. See [Back and forth with Word users](./files#back-and-forth) for how it works and what comes along.

## Which open source software does Blank use?

Blank is open source itself, and builds on the work of many others: its fonts, the editor, the layout engine and their libraries. The [third-party notices](https://github.com/FPurchess/blank/blob/main/public/THIRD-PARTY-NOTICES.txt) list them all, with their licences.

## I found a bug or have an idea

Please [open an issue](https://github.com/FPurchess/blank/issues/new/choose) on GitHub. If something went wrong, the end of Blank's [log](#log) helps us find out why.

## Where is Blank's log? {#log}

Blank writes down what goes wrong, like a file it couldn't save or an export that failed, in a log on your computer. It never sends it anywhere: you decide whether to share it, for example by pasting the end of it into an issue. The log names the files Blank worked with, with their folders, but never holds what you wrote.

You find it here:

| System          | Log                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------- |
| Linux           | `~/.local/share/com.github.fpurchess.blank/logs/blank.log` (or under `$XDG_DATA_HOME`, if set) |
| Linux, the Snap | `~/snap/blank/current/.local/share/com.github.fpurchess.blank/logs/blank.log`                  |
| macOS           | `~/Library/Logs/com.github.fpurchess.blank/blank.log`                                          |
| Windows         | `%LOCALAPPDATA%\com.github.fpurchess.blank\logs\blank.log`                                     |

The `~/.local` and `~/Library` folders are hidden: in the file manager, press `Ctrl` `H` on Linux, or choose **Go → Go to Folder…** in the Finder and paste the path. On Windows, paste the path into the address bar of the Explorer.

Each line says when, in UTC, and how serious it was. Once `blank.log` reaches 1 MB it is kept as an older file next to it, with its date in the name, and only the two newest of those stay, so the log never takes more than about 3 MB. You can delete the files at any time.

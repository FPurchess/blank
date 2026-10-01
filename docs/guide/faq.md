# FAQ

## macOS says Blank "cannot be opened" or "is damaged"

Blank is not notarized by Apple. See [Install → macOS](./install#macos) for how to allow it.

## Where is my document stored?

Files you save are ordinary markdown files wherever you saved them. On top of that, Blank keeps the open document in its own app storage and restores it on the next start, so closing the window doesn't lose it. This is not a backup, though: `Mod` `N` replaces the document with an empty one right away, so save first what you want to keep.

## Why did Blank change what I typed?

That's [autocorrect](./autocorrect). Press `Mod` `Z` right away to undo a single correction, or [turn a group off](./configuration#autocorrect).

## The quotes look wrong for my language

Quotes follow the language at the bottom right. Press `Mod` `Alt` `L` to [choose yours](./autocorrect#language).

## Does Blank check my spelling?

If you want it to: press `Mod` `Alt` `S`. See [Spell check](./spelling).

## Does Blank send my text anywhere?

No. The only thing Blank ever downloads is a [spell check dictionary](./spelling#languages), and only when you check a language that doesn't come with Blank.

## Can I use the mouse?

You can click to place the cursor, select text and drag it somewhere else, double-click a header or footer to change it, and `Mod` + Click a link to open it. [Tables](./tables) have handles for the mouse too. Everything else is done with the keyboard, on purpose.

On Linux, middle-click pastes as in your other apps: the text you select in Blank is the one a middle click pastes elsewhere, and a middle click in Blank pastes the text you selected last, in Blank or in any other app, right where you click. It comes in as plain text.

## Can I edit a Word document with Blank?

You can open it with `Mod` `O`: Blank turns it into a markdown document and leaves the Word file as it is. When you're done, save it as markdown with `Mod` `S`, or send it back as a Word document with `Mod` `Alt` `W`. Blank never writes markdown into a .docx, so the original can't get lost by accident. See [Back and forth with Word users](./files#back-and-forth) for how it works and what comes along.

## Which open source software does Blank use?

Blank is open source itself, and builds on the work of many others: its fonts, the editor, the layout engine and their libraries. The [third-party notices](https://github.com/FPurchess/blank/blob/main/public/THIRD-PARTY-NOTICES.txt) list them all, with their licences.

## I found a bug or have an idea

Please [open an issue](https://github.com/FPurchess/blank/issues/new/choose) on GitHub.

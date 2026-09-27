# Pages

Your PDF and Word documents come out on the paper of your region, A4 or Letter, with generous margins of 2.5 cm. Most documents never need more than that. When one does, a single shortcut gets you there.

## Page setup {#page-setup}

Press `Mod` `Alt` `U`, or choose **Page Setup…** from the menu (right-click or `Shift` `F10`).

![The page setup dialog with the paper, orientation and margins, and a picture of the page](/screenshots/page-setup.png)

| Setting     | Choices                                                              |
| ----------- | -------------------------------------------------------------------- |
| Paper       | the paper of your region, A3, A4, A5, B5, Letter, Legal, or any size |
| Orientation | portrait or landscape                                                |
| Margins     | narrow (1.27 cm), normal (2.5 cm), wide (3.5 cm), or your own        |

Everything works from the keyboard: `↑` `↓` move between the settings, `←` `→` change one, `Enter` applies and `Esc` leaves everything as it was. The picture of the page follows every change, so you see what you get before you apply it.

For your own size or margins, choose **Custom…** and type them below. Numbers are in centimetres, or in inches where Letter paper is used, and you can also write the unit, like `25mm` or `1in`.

Changed your mind? `Mod` `Z` undoes the whole page setup at once.

## Where the page setup is kept {#frontmatter}

The page setup belongs to the document, so it prints the same on every computer. Blank writes it into the [properties at the top of the file](./files#frontmatter), and only what differs from your defaults:

```md
---
page:
  size: a5
  orientation: landscape
  margins: 2cm
---
```

You can write these yourself too. `size` is `a3`, `a4`, `a5`, `b5`, `letter`, `legal`, `auto` for the paper of your region, or a size like `170mm x 240mm`. `margins` is one length for all four sides, or `top`, `right`, `bottom` and `left` on their own lines. Lengths are written with their unit: `mm`, `cm`, `in` or `pt`.

The line above your text sums the page setup up, for example _A5 landscape · margins 2 cm_. Click it to open the page setup. **Edit as Text** in the dialog shows all properties of the file, to change the ones the dialog has no settings for.

If a setting can't be used, say a paper size Blank doesn't know, the export uses your default for it and tells you so.

## Your defaults {#defaults}

**Make This My Default** in the page setup keeps the settings for every document that doesn't have its own. Blank saves them in [`blank.json`](./configuration#page-setup).

## Page setup and Word {#word}

Word documents keep their page setup both ways: an export to Word has your paper, orientation and margins, and a Word document you open brings along its own. If someone changed the page setup in Word, you get their version.

Word can do a few things Blank's page setup can't hold. When a document has them, Blank tells you right after opening it:

- sections with different page setups: Blank uses the first one,
- a binding margin, which is left out,
- mirrored margins for printing both sides, which become the same on every page.

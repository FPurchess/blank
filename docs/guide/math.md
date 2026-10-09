# Math

Blank sets formulas the way LaTeX does, right in your text: inline with your sentences, like $e^{i\pi} + 1 = 0$, or on lines of their own, numbered if you like. You write them in LaTeX, the language of math that GitHub, Obsidian, Typora, pandoc and most other markdown apps read too. They print sharp, can be searched in the PDF, and go to Word as real equations you can edit there.

## Write a formula {#write}

- **Type it between dollar signs.** `$x^2$` becomes a formula as soon as you type a space or a punctuation mark after it. `Mod` `Z` gives you the dollar signs back.
- **`$$` and Enter** on an empty line start a formula on lines of its own. `$$x^2$$` and Enter on one line does the same with `x^2` already in it.
- **`Mod` `Shift` `M`** makes a formula where the cursor is: inline in a sentence, on lines of its own in an empty line. Select text first, and it becomes the formula.
- **The blocks pane** (`Mod` `Alt` `B`) has an **Equation** under **Math & science**.

## Prices stay prices {#prices}

A dollar sign only starts a formula when a formula can follow: no space after the opening `$`, no space before the closing one, and no digit right after it. So "$5 and $10" and "it costs 5$" stay text. Where a `$` of your text would read as math, Blank writes it as `\$` in the file, so it stays text in other apps too.

If you never write math, turn **Math as you type** off in the [settings](./settings#writing) (`Mod` `,` → **Writing**).

## Edit a formula {#edit}

Move into a formula with the arrow keys or click on it, and it shows its LaTeX between faint `$`s, with the formula as it will look in a small preview under the line. If something's wrong, the preview says what and where. Leave it with the arrow keys, Enter or Esc.

- **Backspace** at the start of a formula, or **Delete** at its end, turns it back into text with its `$`s.
- A formula on lines of its own is a block. **Change it:** click it, and its LaTeX opens above the formula. With the keyboard, select it with the arrow keys and press `Enter`, or just start typing. `Escape` then selects it.
- Formulas on lines of their own are centered. The align buttons put one at the right, and back in the middle.

When you open a document with math, its formulas show as LaTeX for a moment while Blank gets ready to set them.

## Numbers {#numbers}

A formula on lines of its own can be numbered: select it and press `Shift` `Enter` for its settings, and switch on **Numbered**. Numbers go (1), (2) and so on, at the right, counted through the document; in the file the formula gets an id, `$$ … $$ {#eq-1}`. `\tag{A}` gives one a label of your own instead.

## What you can write {#latex}

Blank understands what KaTeX does: fractions, roots, sums and integrals, matrices and `aligned`, Greek letters, arrows and the symbols of the AMS packages, `\text{…}`, and colors. [KaTeX's list](https://katex.org/docs/supported) shows everything. Macros of your own (`\newcommand`) aren't supported yet.

**Colors:** Blank draws formulas in the color of your text, which follows the theme, unless you give a color yourself. A color you give stays exactly as you wrote it in every theme and in the PDF, so a dark color can be hard to read on a dark theme. You give one with `\color{red}{x}`, `\textcolor{red}{x}` or, for a background, `\colorbox{yellow}{x}`. Word gets the colors too; a `\colorbox` background may not show in every app that opens the file.

**Chemistry** works too, with `\ce` for formulas and reactions and `\pu` for quantities with their units:

- `$\ce{2H2 + O2 -> 2H2O}$` sets the reaction with its numbers as subscripts and a real arrow.
- `$\ce{Fe^{3+}}$` and `$\ce{SO4^2-}$` set ions with their charges.
- `$\pu{123 kJ/mol}$` sets the number and the unit with the right space between them.

## In files {#files}

- **Markdown:** `$…$` inline and `$$…$$` on lines of their own, with `{#eq-…}` after a numbered one, as pandoc and Quarto write it. Blank also reads GitHub's ``$`…`$`` and ` ```math ` blocks, and `\(…\)`.
- **Word:** formulas become Word's own equations, which Word and LibreOffice edit as equations. Equations made in Word come back to Blank as LaTeX. Blank's own come back exactly as you wrote them, as long as they weren't changed in Word.
- **PDF:** formulas are set from the KaTeX fonts, sharp at any zoom, and you can search and copy them.

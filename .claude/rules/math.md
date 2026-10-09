---
paths:
  - "src/math/**"
  - "src/markdown/math/**"
  - "src/editor/plugins/mathInline.ts"
  - "src/editor/plugins/autocomplete/inline/math.ts"
  - "src/editor/plugins/autocomplete/transformers/math.ts"
  - "src/exporters/docx/math.ts"
  - "src/importers/docx/math.ts"
  - "src/importers/docx/omml.ts"
  - "src/ui/MathPreview.vue"
  - "src-tauri/layout/src/math.rs"
  - "src-tauri/math/**"
  - "src/engine/mathModule.ts"
  - "src-tauri/layout/src/items/math.rs"
  - "src-tauri/layout/src/engine/numbers.rs"
---

# Math

Inline math (`$…$`) and display math (`$$…$$`), set by the layout engine in the KaTeX fonts, for the pages and the PDF alike. The user's guide is `docs/guide/math.md`.

## The math module

- **RaTeX (a Rust port of KaTeX) lives in a module of its own, `src-tauri/math` (crate `blank-math`, built to `src/engine/wasm/math/`), never in the engine:** the engine's wasm, which every start loads, stays as small as without math, and only a document with math fetches the module (2.4 MB). `make engine` builds it.
- **What crosses:** `draw(latex, display)` returns a drawing of `src-tauri/layout/src/drawing.rs` in em from the top left of the formula's box, with its `depth`, or `{error, line, column}`. Glyphs come by KaTeX family (`math:Main-Regular`) and character (`chars: true`), which the engine maps through the KaTeX fonts it has, so the module reads no fonts (RaTeX's metrics are built in). Rules, `\colorbox` and RaTeX's outlined shapes are paths. RaTeX's black is the ink; any other colour is the author's (`paint.color`).
- **The engine keeps the rest:** `Maths` (`src-tauri/layout/src/math.rs`) holds each formula's drawing by source and kind (`addMath`, `removeMath`), and sets it at the size of the text it stands in (`MATH_SCALE`); inline boxes, numbering, tags, warnings and the PDF are the engine's. A formula without its drawing yet shows its source, as without its fonts. The engine's own tests draw with `blank-math` as a dev-dependency.
- **The webview's side:** `src/engine/mathModule.ts` loads the module (a load that failed is retried after 10 s; a module that trapped is given up until Blank starts again, since wasm-bindgen would hand back the same instance, and the formula that trapped is kept as one Blank can't set; failures are logged without the formula), `src/math/drawings.ts` keeps what it drew (`mathDrawing`, `drawAllMath`, `mathIn`) and bumps `drawnMath` when formulas asked for before it loaded are drawn. Display math flattens through its kind's `item` (`register.ts`, through flatten's shared `sourceBlock()`, which puts the item under the open source while it's typed), so `registerMath()` must run before anything flattens: `bootEditor` does it, and tests that flatten display math call it. The page view gives each engine the formulas of its document before it lays them out and takes back the others (`addMath` in `pageView.ts`); a block's record key says which of its formulas are drawn (`mathDrawnIn` in `flatten.ts`), so they're laid out again when they are. The PDF carries them in its job (`math`). Rendering a formula (`register.ts`) loads the module and the fonts and waits for them, so exports (`renderAll`) have them. The first layout doesn't wait (the maintainer's call): a document opened with math shows each formula's source in code style for a moment, and the formula once the module and the fonts have come (`drawnMath`, `fallbackFonts`).
- **Colours:** what the author colours (`\color`, `\textcolor`, `\colorbox`) stays that colour in every theme, on the pages, in the PDF (glyph runs and paths carry a `Paint`; painted glyph runs get their paint in the display's `gp`) and in Word (`w:color` and `w:shd` on the equation's runs, `markColors`/`colorRun` in `src/math/omml.ts`, since mathml2omml drops them). Never lighten them for a dark theme: the pages must match the PDF.

## The nodes

- `math_inline` (`src/markdown/math/nodes.ts`): an inline node with its LaTeX as text (`content: "text*"`, `code: true`, no marks inside; it can carry marks itself). Not an atom: the caret goes into it, which opens it.
- `math_display`: a source block (`sourceBlockSpecs`, `src/markdown/blocks/sourceBlock.ts`) in group `block`, so it stands in lists, quotes and table cells too, with its LaTeX in `math_display_source`. Attrs: `label` (the id of a numbered equation, `{#eq-…}`), `delim` (`dollar` or `fence`, how the file wrote it), `align` (only at the top, through `<div align>`, null is centered).
- Both are kinds of source (`src/math/register.ts`, `src/sources/registry.ts`), with `written: true` (exports write them themselves, and a render never lays the pages out again) and a MathML `preview` (Temml, `src/math/mathml.ts`). Without the engine, `renderMath` checks a formula with Temml instead.
- **Inline math always has its MathML in the hidden editor**, also with the engine: screen readers read it as math, while the caret is elsewhere; the open formula's source is read while it's typed. Raw LaTeX read aloud fails anyone who doesn't speak LaTeX. `mathPreview` holds the source and fills the MathML in after Temml's lazy chunk, 50 a task, from a cache by source (measured in WebKit: Temml ~0.1 ms and the layout ~0.2 ms a formula; a key costs the same with 200 formulas around as without).
- **`#editor math` has `font-family: inherit` with the engine (`main.scss`), and must keep it:** WebKit resolves its own math font family on the first MathML it lays out, a single ~250 ms task in WebKitGTK (fontconfig), measured at 252–272 ms, against 1–17 ms with a font named. Nobody sees that text. Without the engine, the visible editor keeps WebKit's math font.

## The `$` rules

`src/markdown/math/scan.ts` is the one place of the rules of what `$…$` is math (pandoc's `tex_math_dollars`: no space after the opening `$`, none before the closing one, no digit after it; the first unescaped `$` closes or nothing does). The tokenizer reads by them (`rules.ts`), the serializer escapes by them, and the autocorrection converts by them. Change them there only.

- The serializer escapes a `$` of text only where the tokenizer would read math from it: `escapeDollars` (`serialize.ts`) checks a textblock's finished markdown, as the tokenizer reads it (code spans, link destinations and autolinks skipped, the math Blank wrote marked with U+E000), and repeats until no `$` opens math. A line of text starting with `$$` is escaped too. The property test in `math.test.ts` checks random text round-trips.
- `\[…\]` isn't read: Blank writes a text `[` as `\[`, so it would turn brackets into math.
- In a table cell, `cellText` already escapes `|`, which markdown-it unescapes before inline rules: math needs no escaping of its own there.

## On the pages

- Inline math is flattened (`spansOf`, `src/engine/flatten.ts`) as one character per position of its node, so positions map one to one: closed, word joiners (U+2060) under a span with `math`, which the engine lays out as a Parley inline box after them; open (`SourceView.inline`), its source between two `$` that stand for the node's start and end, as code, the `$` `dim`.
- A formula that can't be set (an error, or no math fonts yet) shows its source as code in its place (`Shown::Source` in `text.rs`, the label in `items/math.rs`); the PDF warns (`Warning::Math`). Only a preview (`preview: true`, under an open display formula, and the inline preview) says what is wrong.
- The math fonts are fallback fonts of the family `math:<RaTeX name>` (`src/math/fonts.ts`), added to every engine as fallbacks are; `Fonts::add` keeps them out of the text stacks (`crate::math::MATH_FAMILY`). They load once flatten first sees math (`wantMathFonts`) or a formula is rendered, and the PDF export waits for them (`hasMath`). The module loads the same way, the first time `mathDrawing` is asked for a formula (from `flatten.ts`).
- Numbers are set after paginating (`engine/numbers.rs`), like a table of contents' page numbers: an equation added before others renumbers them without laying them out again. A formula with `\tag` gets none.
- Glyphs are drawn as glyph runs, and rules, `\colorbox`, radicals, big delimiters and arrows as `Op::Path` (`p` on the wire, filled or stroked; `gp` carries a run's paint).
- The tagged PDF has a `Formula` per formula, with its LaTeX as the alt text: inline math in its paragraph between the words around it (`Part::InlineMath`; the glyph runs of a line are split at a formula, so the PDF reads it in place), display math (`Part::Math`) with its number beside it in a `P` (`Part::MathNumber`), not inside the formula, and display math in table cells (`Part::CellMath`, by its position, `CellFormula`).

## Word

- Export: Temml's MathML, converted by `mathml2omml` to OMML (`toOmml`, `src/math/omml.ts`), replaces a placeholder run per formula after docx packed the file (`src/exporters/docx/math.ts`). mathml2omml doesn't escape text, so it gets the MathML with its entities kept (`disableDecode`); its result must parse, and `fixOmml` corrects what it writes wrong (styles OMML hasn't, the order of a run's properties, a sum's operand). The LaTeX is kept in the Custom XML part `CUSTOM_PARTS.math` with a hash of each equation (of the whole `m:oMathPara` for display math) by `structural`: math elements and the text of adjacent runs joined without spaces, no properties, nothing of other namespaces, so a file Word saved again still matches. What can't be converted goes in as its LaTeX as text, with a warning.
- Import: `markMath` (`src/importers/docx/math.ts`) turns equations into marker paragraphs and runs before mammoth, which drops them. The LaTeX comes from the part by the equation's hash (never by position: Word users add equations), else from `ommlToLatex` (`omml.ts`), which escapes what LaTeX and markdown give a meaning. Stored ids are given first, then free ones to numbered equations made in Word. Digits and parentheses after an equation are its number only with a SEQ field.
- Never log a formula's source, nor a library's error message that echoes it: only the kind of failure.

## Known limits

- Parley allows a line break after any inline box, so a line can start with the punctuation right after an inline formula.
- No macros (`\newcommand`) of the user's yet.
- Display math in a list doesn't keep its list through Word.
- Display math can't be aligned left: it is centered unless it says `right` (`blockCaps.alignDefault`), and `<div align>` has no left.

---
paths:
  - "src/ui/**"
  - "src/scss/**"
  - "src/icons.ts"
  - "src/commandList.ts"
---

# Design

How Blank's controls look and behave, so every part of the UI looks the same without deciding it again. The long form, with the reasons, is the design draft in `design/next/` (branch `design/next-ui`: `rules.html`, `tokens.css`, `ui.css`, `proto.js`). **The draft shows behavior and look, never code to copy**: it is plain DOM. Build in Blank's way (`ui-components.md`, `state.md`).

## Tokens (`src/scss/_tokens.scss`)

- **Colors only through tokens.** Never add a new `color-mix(var(--color) N%)`.
- **Each theme sets** `--accent` and `--accent-ink` (text on the accent) and `--popover-shadow`, next to its paper, ink and desk.
- **Everything else is derived once from those:**
  - `--muted` (secondary text on the desk) and `--muted-on-paper`;
  - `--line` (dividers) and `--line-strong` (borders of fields and buttons);
  - `--hover` and `--pressed`;
  - `--accent-soft` and `--accent-hover`;
  - `--focus`;
  - `--on-fill`/`--on-ink` (a control that is on) and `--on-text`/`--on-weight` (a status item that is on);
  - `--ink-fill` (solid ink).
- **The accent is only for what can be clicked or is on,** never for static text.
- **`--ink-fill` and, in mono, `--on-fill` are lists of layers.** Use them in `background`, never in `background-color`. The ink is translucent in Dark.
- **Monochrome** is `colorMode` (`src/state/appearance.ts`) → `body[data-color="mono"]`, which swaps the tokens. Components never mention mono.
- **The selection colors are the themes' own;** the tokens don't touch them.
- **Sizes and spacing:**
  - the 8px grid `--s1…--s8` (4, 8, 12, 16, 24, 32, 48);
  - `--control` 28 (icon and text buttons), `--row` 32 (menu rows), `--status-item` 24;
  - `--ui-small` 12px (status items, tooltips);
  - radii `--r-control` 6, `--r-pop` 8 (what floats) and `--r-dialog` 12 (dialogs still use 6 until the settings dialog).
- **Motion:** `--fade-in` 100, `--fade-out` 150, `--chrome-in` 300 and `--chrome-out` 700 (focus mode), with `--ease` and `--ease-soft`. Motion is only feedback.
  - Every new `transition` or `animation` gets its selector in main.scss's `prefers-reduced-motion` block (`motion.test.ts` checks it), which also zeroes the timings.
  - Don't add a second reduced-motion block before it: the test reads the first.

## Contrast (`src/scss/themes.test.ts`)

- Text, secondary text included, needs 4.5:1. Icons, control borders, the accent and the focus ring need 3:1.
- This holds in every theme × {accent, mono}.
- The tests read the formulas from `_tokens.scss` (`themeColor` in `contrast.ts`), so a changed percentage is checked as written.
- A new color token gets a test there.

## Controls (`src/scss/_controls.scss`)

- **Mixins that existing selectors include:**
  - `states($on)`: hover, pressed, on, disabled;
  - `icon-button`;
  - `text-button`, `text-button-primary`, `text-button-quiet`;
  - `status-item`;
  - `popover`;
  - `separator`;
  - `shortcut`.
- **Classes only where a component uses one:** `.icon-button` (`IconButton.vue`) and `.status-item`.
- **States:**
  - hover `--hover` and pressed `--pressed`, only while enabled;
  - on (`aria-pressed`/`aria-checked="true"`): `--on-fill` with the icon in `--on-ink`, or for status items `$on: text`;
  - disabled: opacity 0.38.
- **Keyboard focus** is the global 2px `--focus` ring with a 2px offset, on `:focus-visible` only. Don't add `:focus` outlines. Bars, pickers and toolbars never take the editor's focus (`editor-boundary.md`).
- **Text buttons always have a box,** a border or a fill. One primary per surface: the dialogs' submit button.
- **The one depth cue:** `popover` (a 1px `--line` border, the `--r-pop` radius, one shadow), only on what floats (menus, toolbars, pickers).
- **The pointer:**
  - The global rule gives the hand to buttons, links and the roles button, tab, menuitem*, option, radio and switch. Text fields get the text cursor, and anything `:disabled`/`aria-disabled` the arrow.
  - Give a clickable element a role rather than its own `cursor` rule.
  - `controls.test.ts` checks the rule, and `e2e/specs/pointer.e2e.ts` checks what the webview computes.

## Tooltips (`src/ui/UiTooltip.vue`, `tooltipModel.ts`)

- **Opting in:** a control opts in with `v-bind="tipAttrs({ name, command, key })"`, or through `IconButton`.
  - It sets `data-tip` (the name: the command's label unless given) and `data-tip-key` (the command's shortcut via `commandShortcut`, unless `key` gives one).
  - For a command, it also sets `aria-keyshortcuts`.
- **Never use `title` on a control.** A tooltip is the name plus the shortcut, never a sentence. Sentences over the pages (link hints, "Double-click to edit…") stay native titles.
- **Not moved yet**, each for the part of the redesign that rebuilds it:
  - the bottom bar's items, which keep their `title` and their own `cursor` rules until the status bar;
  - the header and footer strip (`BandEditor.vue`), which keeps its `title`s and its Title Case labels ("First Page ▾", "Odd & Even Pages").
- **Behavior:**
  - It shows after 400ms of rest (`hoverIntent.ts`, the timer cards share).
  - It goes at once on leave, press, key, wheel or blur.
  - It sits above the control, or below near the top bar, at the pointer on wide controls (`placeTip`).
  - It never takes the focus. While shown, it describes the control (`aria-describedby`) by what its own name doesn't say.
- **`tooltipsSuppressed`** (`src/state/popups.ts`) hides them, e.g. while focus mode fades the controls.

## The command list (`src/commandList.ts`)

- **What's in it:** every `CommandIdentifier` has an entry (the type enforces it), with:
  - `label`, in sentence case and American English, ending in "…" when the command opens a dialog;
  - `group`;
  - `icon`;
  - optionally `short`;
  - `aliases` (lower case, for search).
- **The keys stay in the keymap** (`config.ts`).
- **Take labels from it** (`commandLabel`) wherever the UI names a command: menus, tooltips, the toolbar. The context menu's `commandItem` does.

## Icons (`src/icons.ts`, `IconGlyph.vue`)

- **How they're drawn:** line icons on a 24 grid, a 1.5 stroke, round caps and joins, no fill. They show at 16px, or 20px with `size="large"` (`IconButton`'s `large`) where they carry more detail, as on the table toolbar.
- **Dot-only icons** (`more`, `grip`) get a 2.5 stroke (`iconStroke`).
- **One meaning per icon;** reuse a name before adding one.
- `icons.test.ts` checks that every path stays on the grid.

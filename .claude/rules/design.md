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
  - `--scrim` (the desk, half see-through, behind a dialog);
  - `--spotlight` (how far the pages step back into the desk around a header or footer being edited, 85%);
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
  - type: `--ui` 13px for all UI text at 13/20, `--ui-small` 12px (status items, hints, tooltips) at 12/16. The chrome's roots (the top area, the side panes, the outline, the menus, what floats and the dialogs) include `ui-text` (`_controls.scss`), which gives their elements the 20px back from the reset's 1.5em. Never size UI text in `rem`: the root stays at the editor's 16.5px;
  - radii `--r-control` 6, `--r-pop` 8 (what floats) and `--r-dialog` 12 (dialogs).
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
  - `side-pane`;
  - `separator`;
  - `field` (an input or select on the paper);
  - `group-label` (the small capitals naming a group);
  - `shortcut`;
  - `select-button` (a menu button showing a value, in a box);
  - `switch` and `switch-on` (a switch's track and knob);
  - `segmented` (a row of choices as one control: a sunken `--hover` ground, the chosen one raised on the paper in weight 500, the others in ink, since secondary text is too faint on that ground).
- **Classes only where a component uses one:** `.icon-button` (`IconButton.vue`), `.status-item`, `.menu-button` with `.select` (`MenuButton.vue`), `.switch-row` (`SwitchControl.vue`) and `.segmented` (`SegmentedTabs.vue`).
- **Shared controls** (`src/ui/components/`): `IconButton`, `MenuButton` for a menu or a select, `SwitchControl` for a setting that is on or off and applies at once, `SegmentedTabs` for switching what a surface shows.
- **States:**
  - hover `--hover` and pressed `--pressed`, only while enabled;
  - on (`aria-pressed`/`aria-checked="true"`): `--on-fill` with the icon in `--on-ink`, or for status items `$on: text`;
  - disabled: opacity 0.38.
- **Keyboard focus** is the global 2px `--focus` ring with a 2px offset, on `:focus-visible` only. Don't add `:focus` outlines. Pickers and the floating toolbars never take the editor's focus, and the top area's rows take it only from the keyboard (`editor-boundary.md`).
- **Text buttons always have a box,** a border or a fill. One primary per surface: the dialogs' submit button, filled with the accent made solid over the desk (`solid()` in `_controls.scss`), so it's solid ink in mono.
- **Dialogs** (`BaseDialog.vue`): paper with a 1px `--line` border, the `--r-dialog` radius and a large soft shadow in `--popover-shadow`, over `--scrim` (the desk, half see-through), which dims the window behind. A head with the title (15px, 500) and a foot with the buttons, each divided from the body by a `--line`: what else the dialog offers on the left (`secondary`: what ends it otherwise, like Don't save or Convert to text), then on the right the buttons that close it as asked (like Make this my default), Cancel, and the primary last. No close ✕: Esc, Cancel and a press on the scrim close it. It includes `ui-text` (`--ui` at 13/20); hints and small labels are `--ui-small`. Like a popover, it re-points `--muted` to `--muted-on-paper`, and the rows of its settings are `SettingRow`s. What is wrong is in `--spelling-color` (`themes.test.ts` checks it on the paper), each on its own line, and linked to its field with `aria-invalid` and `aria-describedby` (to its row while the field is hidden), in a live region that is always there, so screen readers announce what comes into it.
- **The one depth cue:** `popover` (a 1px `--line` border, the `--r-pop` radius, one shadow), only on what floats (menus, toolbars, pickers). It's paper, so it re-points `--muted` to `--muted-on-paper`: whatever is inside just uses `--muted`. A new surface on the paper does the same, rather than a property of its own.
- **Closing what a component opened** (a menu, a card, a floating list): `useDismiss(inside, close, options)` (`src/ui/composables/useDismiss.ts`) closes it on a press outside `inside()` (but not on a scrollbar, `onScrollbar`), which lists its own elements and what belongs to it (the button that opened it, so a press there toggles), and optionally on Escape, any key, blur or resize. It takes the Escape it closes on (`preventDefault`): closing may give the editor the focus, which would get the rest of the press as typing (it once replaced a selected table of contents). Other keys of `anyKey` go on. Don't add another window `pointerdown` listener for it.
- **A command's key for code that handles it itself:** `commandKey(id, run)` or `liveKeys(build)` (`src/editor/keyBindings.ts`), which follow the keymap when the settings change it; never a `keydownHandler` built once from `commandBinding(id)`. `commandShortcut(id)` writes the key for people, `sameBinding` compares two.
- **Side panes:** `side-pane($edge, $offset)` (the blocks pane; made for the outline's open list too), with `side-pane-head`, `side-pane-title` and `side-pane-foot` (`SidePaneHead.vue`). A flat surface of the desk's color with a 1px `--line` on the side of the pages; below `OUTLINE_BREAKPOINT`, where it floats over the pages (class `floating`), the popovers' shadow. Its surface is the desk, so it keeps `--muted`.
- **The pointer:**
  - The global rule gives the hand to buttons, links and the roles button, tab, menuitem*, option, radio and switch. Text fields get the text cursor, and anything `:disabled`/`aria-disabled` the arrow.
  - Give a clickable element a role rather than its own `cursor` rule.
  - `controls.test.ts` checks the rule, and `e2e/specs/pointer.e2e.ts` checks what the webview computes.

## Tooltips (`src/ui/UiTooltip.vue`, `tooltipModel.ts`)

- **Opting in:** a control opts in with `v-bind="tipAttrs({ name, command, key })"`, or through `IconButton`.
  - It sets `data-tip` (the name: the command's label unless given) and `data-tip-key` (the command's shortcut via `commandShortcut`, unless `key` gives one).
  - For a command, it also sets `aria-keyshortcuts`.
- **Never use `title` on a control.** A tooltip is a name, optionally with its state ("Spelling: loading German"), plus the shortcut, never an instruction ("click for…"). Sentences over the pages (link hints) stay native titles.
- **Behavior:**
  - It shows once the pointer has rested on the control for 400ms with no button held (`hoverIntent.ts`, the timer cards share).
  - It goes at once on leave, press, key, wheel, scroll or blur, and stays away from a control pressed or typed on until the pointer leaves it.
  - Listeners of the wheel and scroll are passive (`listenOnWindow` takes addEventListener's options), so they never hold up scrolling.
  - It sits above the control, or below it in the top area and near it, at the pointer on wide controls (`placeTip`).
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
- **Take labels from it** (`commandLabel`) wherever the UI names a command: menus, tooltips, the toolbar. `commandItem` (in `commandList.ts`) makes a menu item of a command, for the context menu and the toolbar's menus. A command may have no key (`""` in the keymap, the code block's by default): the tooltip and the menu then show none.
- **The main menu and its search** (`main-menu.md`) list every command from it: the search finds a command by its label, group and aliases (`src/commandSearch.ts`, also the settings' list of shortcuts), so give a new command aliases people would type.

## Icons (`src/icons.ts`, `IconGlyph.vue`)

- **How they're drawn:** line icons on a 24 grid, a 1.5 stroke, round caps and joins, no fill. They show at 16px, or 20px with `size="large"` (`IconButton`'s `large`) where they carry more detail, as on the table toolbar.
- **Dot-only icons** (`more`, `grip`) get a 2.5 stroke (`iconStroke`).
- **One meaning per icon;** reuse a name before adding one.
- `icons.test.ts` checks that every path stays on the grid.

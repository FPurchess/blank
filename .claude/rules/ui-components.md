---
paths:
  - "src/ui/**"
  - "src/ui.ts"
  - "src/scss/**"
  - "src/popup.ts"
---

# Vue components

The UI around the editor is moving to Vue 3.5 (see `vue-migration.md` for what's done). `src/ui/mount.ts` (`bootApp`) mounts one app into `#ui-app` inside `uiRoot()`, and `src/ui/App.vue` renders the parts that are Vue already.

## How components are written

- **`<script setup lang="ts">` single-file components, without `<style>`.** Styles stay in the global SCSS (`src/scss/`), with the themes and the shared type scale. Use the existing classes and ids.
- **Logic goes into `.ts` modules next to the component** (e.g. `src/ui/tableToolbarModel.ts`, named apart from its component), which are unit tested and counted by coverage. Templates stay thin: v8 coverage doesn't count branches in templates.
- **Shared state comes from `src/state/`**, imported directly. Imported refs are unwrapped in the template (`v-if="tableToolbar"`). The editor comes from `useEditor()` (see `editor-boundary.md`). Composables in `src/ui/composables/` are for reusable component logic only, never for state.
- **Props down, callbacks in the state's requests up.** A component gets the state it shows as props (`TableToolbar :state`), and acts through the callbacks in that state (`item.run()`, `caption.submit()`) or through `useEditor()`.
- **Vapor mode is not used.** Vue 3.6's Vapor is still a release candidate, and our keyed lists depend on the fixes it keeps getting. Components use the regular renderer.

## Rendering rules

- **Placement is imperative.** A popup or toolbar places itself with `place()` / `placeToolbar()` (`src/popup.ts`) in `onMounted` and `onUpdated`. These write `left`, `top` and `hidden`, so the template must never bind `style`, `left`, `top` or `hidden` on that element, or Vue's next patch would overwrite them. Bind the classes that change the size (like `.keys`), since they apply before `onUpdated` measures.
- **Inputs that are typed into aren't bound** when their component re-renders while the user types (e.g. the toolbar follows the scrolling). Set the value once in `onMounted`, as `CaptionField.vue` does. A bound `:value` would undo what was typed on the next render.
- **Keep updates cheap for state that changes on every transaction or scroll.** Key lists by id (`:key="item.id"`) so elements stay the same. Pass each child the item itself as a prop, not a new wrapper, an inline closure or slot content that uses the loop variable, so Vue skips children that didn't change. Compare `ToolbarButton.vue`: with inline handlers in the `v-for`, every button re-rendered on every scroll event, and an update cost twice as much.
- **Keep every id, class, role, `data-*` and aria attribute** that E2E, the docs shots and the tests use.
- **Stacking:** `#ui` comes after `.ProseMirror`. The z-index layers are set in `src/scss/main.scss` (e.g. table handles 4, toolbar 5, dialog backdrop 10, picker and menus 20); keep a new part in line with them, below the backdrop unless it is a modal or a menu.

## Components so far

| Component | What |
|---|---|
| `App.vue` | the Vue part of the UI |
| `TableToolbar.vue`, `ToolbarButton.vue`, `CaptionField.vue` | the table toolbar |
| `components/IconGlyph.vue` | an icon of `src/icons.ts` |

Add reusable components to `src/ui/components/` when a second place needs them (e.g. a button, a text field, a dialog frame when the dialogs are ported), not before.

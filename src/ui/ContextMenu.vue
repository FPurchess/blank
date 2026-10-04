<script setup lang="ts">
import { nextTick, onMounted, shallowRef, useTemplateRef, watch } from "vue";

import { listenOnWindow } from "../scope";
import {
  type ContextMenuRequest,
  language,
  type MenuItem,
  spellcheck,
} from "../state";
import { useDismiss } from "./composables/useDismiss";
import MenuList from "./MenuList.vue";
import {
  enabledAt,
  firstEnabled,
  indexAfterUpdate,
  isEntry,
  lastEnabled,
  step,
  typeahead,
} from "./menuModel";

// The context menu, which replaces the webview's (see
// src/editor/plugins/contextMenu.ts for when it opens and
// src/editor/contextMenu/model.ts for its items). It holds the focus while
// it's open: the arrow keys move it, Enter or Space run an item, → and ←
// open and close submenus, a letter jumps to an item, Esc and Tab close it.
// App.vue keys it by the request's `close`, so a request of the open menu
// updates it here and another one mounts a new menu.
const props = defineProps<{ request: ContextMenuRequest }>();

interface Level {
  items: MenuItem[];
  // the focused item, or -1 while the menu itself has the focus
  index: number;
  // the row a submenu opens next to
  side: DOMRect | null;
}

// opening the menu of the next misspelling scrolls to it, which mustn't close
// the menu right away
const SCROLL_GRACE = 500;
const openedAt = Date.now();
// the user moved the focus, so an update keeps it where it is
let moved = false;

const initialIndex = (request: ContextMenuRequest) =>
  request.keyboard ? firstEnabled(request.items) : -1;

// the open levels, the menu first, and which of them has the focus
const levels = shallowRef<Level[]>([
  {
    items: props.request.items,
    index: initialIndex(props.request),
    side: null,
  },
]);
const focusDepth = shallowRef(0);
const editing = shallowRef<{ depth: number; index: number } | null>(null);

const container = useTemplateRef<HTMLElement>("container");
const lists = useTemplateRef<InstanceType<typeof MenuList>[]>("lists");

// closes the menu once: the listeners stay until Vue has unmounted it, so a
// blur right after an item ran mustn't close it again
let closed = false;
const close = () => {
  if (closed) return;
  closed = true;
  props.request.close();
};

/**
 * focusCurrent focuses the focused item of the level that has the focus, once
 * Vue has rendered it
 */
const focusCurrent = () =>
  nextTick(() => {
    const depth = focusDepth.value;
    const list = lists.value?.find((l) => l.depth === depth);
    list?.focus(levels.value[depth].index);
  });

/**
 * show replaces the levels, gives `depth` the focus and focuses it
 */
const show = (next: Level[], depth: number) => {
  // a field in a submenu that closes goes with it
  if (editing.value && editing.value.depth >= next.length) editing.value = null;
  levels.value = next;
  focusDepth.value = depth;
  void focusCurrent();
};

const withIndex = (depth: number, index: number) =>
  levels.value
    .slice(0, depth + 1)
    .map((level, d) => (d === depth ? { ...level, index } : level));

/**
 * focusItem focuses the item at `index` of `depth`, closing its submenus
 */
const focusItem = (depth: number, index: number) =>
  show(withIndex(depth, index), depth);

/**
 * openSubmenu opens the submenu of the item at `index` of `depth`, and gives it
 * the focus if `enter` is set
 */
const openSubmenu = (depth: number, index: number, enter: boolean) => {
  const item = levels.value[depth].items[index];
  if (!isEntry(item) || !item.children) return;
  const list = lists.value!.find((l) => l.depth === depth)!;
  const submenu: Level = {
    items: item.children,
    index: enter ? firstEnabled(item.children) : -1,
    side: list.rowRect(index),
  };
  show([...withIndex(depth, index), submenu], enter ? depth + 1 : depth);
};

/**
 * activate runs the item at `index` of `depth`: opens its submenu, turns it
 * into a text field, or closes the menu and runs it
 */
const activate = (depth: number, index: number) => {
  const item = levels.value[depth].items[index];
  if (!isEntry(item) || item.disabled) return;
  if (item.children) {
    openSubmenu(depth, index, true);
  } else if (item.edit) {
    // the field focuses itself; the mouse and Esc move the focus away again
    editing.value = { depth, index };
    levels.value = withIndex(depth, index);
    focusDepth.value = depth;
  } else {
    close();
    item.run?.();
  }
};

const hover = (depth: number, index: number) => {
  if (!enabledAt(levels.value[depth].items, index)) return;
  moved = true;
  const item = levels.value[depth].items[index];
  if (isEntry(item) && item.children) openSubmenu(depth, index, false);
  else focusItem(depth, index);
};

const onKey = (depth: number, event: KeyboardEvent) => {
  const level = levels.value[depth];
  if (!level) return;
  const { key } = event;
  const handled = () => {
    event.preventDefault();
    event.stopPropagation();
  };
  const { items, index } = level;

  if (key === "ArrowDown" || key === "ArrowUp") {
    handled();
    moved = true;
    const direction = key === "ArrowDown" ? 1 : -1;
    const from = index < 0 && direction === -1 ? 0 : index;
    focusItem(depth, step(items, from, direction));
  } else if (key === "Home" || key === "End") {
    handled();
    moved = true;
    focusItem(depth, key === "Home" ? firstEnabled(items) : lastEnabled(items));
  } else if (key === "ArrowRight") {
    handled();
    const item = items[index];
    if (index >= 0 && isEntry(item) && item.children) activate(depth, index);
  } else if (key === "ArrowLeft" || key === "Escape") {
    handled();
    if (depth > 0) focusItem(depth - 1, levels.value[depth - 1].index);
    else if (key === "Escape") close();
  } else if (key === "Enter" || key === " ") {
    handled();
    if (index >= 0) activate(depth, index);
  } else if (key === "Tab") {
    handled();
    close();
  } else if (
    key.length === 1 &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.altKey
  ) {
    handled();
    const next = typeahead(items, index, key);
    if (next !== null) {
      moved = true;
      focusItem(depth, next);
    }
  }
};

const submitEdit = (depth: number, value: string) => {
  const item = levels.value[depth].items[editing.value!.index];
  close();
  if (isEntry(item)) item.edit?.submit(value);
};

const cancelEdit = () => {
  const { depth, index } = editing.value!;
  editing.value = null;
  focusItem(depth, index);
};

// a request of the open menu, e.g. once the suggestions for a misspelling are
// known, updates it: the item the user moved to keeps the focus, submenus and
// a text field close
watch(
  () => props.request,
  (next) => {
    const { items, index } = levels.value[0];
    editing.value = null;
    show(
      [
        {
          items: next.items,
          index: indexAfterUpdate(items, index, moved, next),
          side: null,
        },
      ],
      0,
    );
  },
);

onMounted(focusCurrent);

// what closes the menu while it's open: a press or a scroll outside it, but
// for the scroll the menu's own opening caused
const { contains } = useDismiss(() => [container.value], close, {
  resize: true,
  blur: true,
});
listenOnWindow(
  "scroll",
  (event) => {
    if (Date.now() - openedAt > SCROLL_GRACE && !contains(event.target)) {
      close();
    }
  },
  true,
);
watch([spellcheck, language], close);
</script>

<template>
  <div ref="container" class="context-menus">
    <MenuList
      v-for="(level, depth) in levels"
      :key="depth"
      ref="lists"
      :items="level.items"
      :depth="depth"
      :anchor="request.anchor"
      :side="level.side"
      :focused="level.index"
      :expanded="levels[depth + 1] ? level.index : -1"
      :editing="editing?.depth === depth ? editing.index : -1"
      @hover="hover(depth, $event)"
      @activate="activate(depth, $event)"
      @key="onKey(depth, $event)"
      @edit-submit="submitEdit(depth, $event)"
      @edit-cancel="cancelEdit"
      @close="close"
    />
  </div>
</template>

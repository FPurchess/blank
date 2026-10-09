<script setup lang="ts">
import { computed, onMounted, onUpdated, useTemplateRef } from "vue";

import { keepFocus } from "../dom";
import { place } from "../popup";
import type { Anchor, MenuLine } from "../state";
import MenuLineView from "./MenuLineView.vue";
import {
  groupsOf,
  hasChecks,
  isEntry,
  isHead,
  isRow,
  type MenuGroup,
  optionId,
} from "./menuModel";

// One level of a menu: the menu itself, or a submenu next to the item it
// belongs to. ContextMenu.vue decides what's focused, open and being edited;
// this renders it, places itself and reports what the user does. Its
// sections are groups named by their heads, a row holds items side by side.
// `embedded` is the main menu's own list, which its box places; `found`
// lists what its search found, which the search keeps the focus over.
const props = defineProps<{
  items: readonly MenuLine[];
  depth: number;
  anchor: Anchor;
  // the row of the parent item, which a submenu opens next to
  side: DOMRect | null;
  // the focused line (and item of a row), the one whose submenu is open and
  // the one being edited, or -1
  focused: number;
  column: number;
  expanded: number;
  editing: number;
  embedded?: boolean;
  found?: boolean;
}>();
const emit = defineEmits<{
  hover: [index: number, column: number];
  activate: [index: number, column: number];
  key: [event: KeyboardEvent];
  editSubmit: [value: string];
  editCancel: [];
  close: [];
}>();

const root = useTemplateRef<HTMLElement>("root");
const checks = computed(() => hasChecks(props.items));
const groups = computed(() => groupsOf(props.items));
const grouped = computed(() => groups.value.some((group) => group.head));

// the element of the line at `index`, or of its item at `column` in a row
const lineAt = (index: number, column = 0) =>
  root.value!.querySelector<HTMLElement>(
    isRow(props.items[index])
      ? `[data-index="${index}"][data-column="${column}"]`
      : `[data-index="${index}"]`,
  )!;

const placeMenu = () => {
  if (!props.embedded)
    place(root.value!, props.anchor, { side: props.side ?? undefined });
};
onMounted(placeMenu);
onUpdated(placeMenu);

// the places of a section's lines in the menu
const linesOf = (group: MenuGroup) =>
  Array.from({ length: group.end - group.start }, (_, i) => group.start + i);
// keys that stay while the lines stay, so an update keeps their elements
const lineKey = (index: number) => {
  const item = props.items[index];
  if (isEntry(item) || isRow(item)) return item.id;
  return isHead(item) ? `head-${item.label}` : `separator-${index}`;
};
const groupKey = (group: MenuGroup) =>
  group.start < group.end ? `group-${lineKey(group.start)}` : "group-empty";
// what each line gets, and what it says back
const lineProps = (index: number) => ({
  item: props.items[index],
  index,
  focused: props.focused,
  column: props.column,
  expanded: props.expanded,
  editing: props.editing,
  checks: checks.value,
  found: !!props.found,
  optionId: optionId(props.depth, index),
});
const lineEvents = {
  hover: (index: number, column: number) => emit("hover", index, column),
  activate: (index: number, column: number) => emit("activate", index, column),
  editSubmit: (value: string) => emit("editSubmit", value),
  editCancel: () => emit("editCancel"),
  close: () => emit("close"),
};

defineExpose({
  depth: props.depth,
  // focuses the line at `index` (its item at `column` of a row), or the
  // menu itself for -1
  focus: (index: number, column: number) => {
    if (index < 0) return root.value!.focus();
    const line = lineAt(index, column);
    line.focus();
    line.scrollIntoView?.({ block: "nearest" });
  },
  rowRect: (index: number) => lineAt(index).getBoundingClientRect(),
  // shows the line at `index` while the focus stays in the search
  reveal: (index: number) =>
    index >= 0 && lineAt(index).scrollIntoView?.({ block: "nearest" }),
});
</script>

<template>
  <div
    :id="depth ? undefined : 'context-menu'"
    ref="root"
    class="context-menu"
    :class="{ submenu: depth > 0, embedded }"
    :role="found ? 'listbox' : 'menu'"
    :aria-label="found ? 'Commands' : undefined"
    tabindex="-1"
    @keydown="emit('key', $event)"
    @mousedown="keepFocus"
    @contextmenu.prevent
  >
    <!-- sections with heads are groups named by them, e.g. Recent; a menu
    without heads is one list, whose lines keep their elements whatever moves -->
    <template v-if="grouped">
      <template v-for="(group, at) in groups" :key="groupKey(group)">
        <div v-if="at > 0" role="separator" />
        <div
          :role="group.head ? 'group' : 'none'"
          :aria-label="group.head?.label"
        >
          <MenuLineView
            v-for="index in linesOf(group)"
            :key="lineKey(index)"
            v-bind="lineProps(index)"
            v-on="lineEvents"
          />
        </div>
      </template>
    </template>
    <template v-for="(item, index) in items" v-else :key="lineKey(index)">
      <div v-if="item === 'separator'" role="separator" />
      <MenuLineView v-else v-bind="lineProps(index)" v-on="lineEvents" />
    </template>
  </div>
</template>

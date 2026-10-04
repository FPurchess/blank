<script setup lang="ts">
import {
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  shallowRef,
  useTemplateRef,
  watch,
} from "vue";

import type { CommandIdentifier } from "../config";
import { blockStyleAt } from "../editor/formatState";
import { useEditor } from "../editor/handle";
import { commandFor } from "../editor/plugins/keymap";
import { toolbarFocused, toolbarFocusRequest } from "../state";
import type { Anchor } from "../state";
import { useRovingFocus } from "./composables/useRovingFocus";
import {
  entries,
  type FormatItem,
  formatItems,
  insertMenuItems,
  moreMenuItems,
  overflowCut,
  PARTS,
  type PartId,
  styleLabel,
  styleMenuItems,
} from "./formatToolbarModel";
import { keepFocus } from "./toolbarModel";
import ToolbarButton from "./ToolbarButton.vue";
import ToolbarMenuButton from "./ToolbarMenuButton.vue";

// The formatting toolbar, the second row of the top area: history, the style
// menu, the marks, lists and quote, alignment and Insert, with what doesn't
// fit a narrow window in a More menu. Pressing it never moves the editor's
// focus or selection; from the keyboard (Alt-F10) it is one tab stop whose
// buttons ←→ Home End move between, and Esc goes back to the text.
const editor = useEditor();
const root = useTemplateRef<HTMLElement>("root");

// from the keyboard the toolbar keeps the focus, so another button can be
// pressed; a click gives it back to the text
const runById = (id: CommandIdentifier) =>
  editor.run(commandFor(id), { focus: !toolbarFocused.value });

// the same objects while the editor's state leaves them as they were
const items = computed((previous?: FormatItem[]) =>
  formatItems(editor.state.value, editor.can, runById, previous),
);
const style = computed(() => styleLabel(blockStyleAt(editor.state.value)));

// what a narrow window moves into the More menu, from each part's width as
// measured with everything shown
const cut = shallowRef<ReadonlySet<PartId>>(new Set());
const shown = computed(() => entries(items.value, cut.value));
let widths: Record<PartId, number> | null = null;
let moreWidth = 0;

const measure = () => {
  const element = root.value;
  if (!element) return;
  let previous = Number.NaN;
  const measured = {} as Record<PartId, number>;
  for (const part of PARTS) {
    const boxes = [...element.querySelectorAll(`[data-part="${part.id}"]`)].map(
      (control) => control.getBoundingClientRect(),
    );
    if (boxes.length === 0) return;
    const right = Math.max(...boxes.map((box) => box.right));
    const left = Number.isNaN(previous)
      ? Math.min(...boxes.map((box) => box.left))
      : previous;
    measured[part.id] = right - left;
    previous = right;
  }
  widths = measured;
  const button = element.querySelector("button");
  moreWidth = (button?.getBoundingClientRect().width ?? 28) + 2;
};
const fit = () => {
  const element = root.value;
  if (!element || !widths) return;
  const style = getComputedStyle(element);
  const available =
    element.clientWidth -
    parseFloat(style.paddingLeft || "0") -
    parseFloat(style.paddingRight || "0");
  const next = overflowCut(widths, moreWidth, available);
  const same =
    next.size === cut.value.size && [...next].every((id) => cut.value.has(id));
  if (!same) cut.value = next;
};
// measured with every part shown, then fitted
const remeasure = async () => {
  cut.value = new Set();
  await nextTick();
  measure();
  fit();
};

let resized: ResizeObserver | undefined;
onMounted(() => {
  void remeasure();
  void document.fonts?.ready.then(remeasure);
  if (typeof ResizeObserver === "undefined" || !root.value) return;
  resized = new ResizeObserver(() => fit());
  resized.observe(root.value);
});
onUnmounted(() => {
  resized?.disconnect();
  toolbarFocused.value = false;
});

// the controls in the order the keys move through them
const stops = computed(() => {
  const order = new Map<string, number>();
  for (const entry of shown.value) {
    if (entry.kind !== "separator") order.set(entry.key, order.size);
  }
  return order;
});
const { current, onKeydown, focusCurrent } = useRovingFocus(
  () => root.value,
  "button",
);
const tabindexOf = (key: string) =>
  stops.value.get(key) === current.value ? 0 : -1;

watch(toolbarFocusRequest, (request) => {
  if (request) void nextTick(focusCurrent);
});

const onFocusIn = (event: FocusEvent) => {
  toolbarFocused.value = true;
  // the control the focus went to is the one in the tab order
  const controls = [...(root.value?.querySelectorAll("button") ?? [])];
  const index = controls.indexOf(event.target as HTMLButtonElement);
  if (index >= 0) current.value = index;
};
const onFocusOut = (event: FocusEvent) => {
  if (!root.value?.contains(event.relatedTarget as Node | null)) {
    toolbarFocused.value = false;
  }
};
const onKey = (event: KeyboardEvent) => {
  if (onKeydown(event)) return;
  if (event.key === "Escape") {
    event.preventDefault();
    editor.focus();
  }
};

const styleItems = () =>
  styleMenuItems(editor.state.value, editor.can, runById);
const insertItems = (anchor: Anchor) =>
  insertMenuItems(
    editor.can,
    runById,
    (command) => editor.run(command),
    anchor,
  );
const moreItems = (anchor: Anchor) =>
  moreMenuItems(items.value, cut.value, () => insertItems(anchor));
</script>

<template>
  <div
    id="format-toolbar"
    ref="root"
    role="toolbar"
    aria-label="Formatting"
    @mousedown="keepFocus"
    @keydown="onKey"
    @focusin="onFocusIn"
    @focusout="onFocusOut"
  >
    <template v-for="entry in shown" :key="entry.key">
      <ToolbarButton
        v-if="entry.kind === 'button'"
        :item="entry.item"
        :keys="false"
        :large="false"
        :tabindex="tabindexOf(entry.key)"
        :data-part="entry.part"
      />
      <ToolbarMenuButton
        v-else-if="entry.kind === 'menu' && entry.menu === 'style'"
        class="style-select"
        label="Text style"
        :text="style"
        :items="styleItems"
        :tabindex="tabindexOf(entry.key)"
        :data-part="entry.part"
      />
      <ToolbarMenuButton
        v-else-if="entry.kind === 'menu'"
        class="wide"
        label="Insert"
        icon="plus"
        text="Insert"
        :items="insertItems"
        :tabindex="tabindexOf(entry.key)"
        :data-part="entry.part"
      />
      <ToolbarMenuButton
        v-else-if="entry.kind === 'more'"
        label="More"
        icon="more"
        :chevron="false"
        :items="moreItems"
        :tabindex="tabindexOf(entry.key)"
      />
      <span
        v-else
        class="separator"
        role="separator"
        aria-orientation="vertical"
      />
    </template>
  </div>
</template>

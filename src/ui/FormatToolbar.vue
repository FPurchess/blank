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
import { FOCUS_ORDER, toolbarFocused } from "../state";
import type { Anchor } from "../state";
import { useFocusRegion } from "./composables/useFocusRegion";
import { useResizeObserver } from "./composables/useResizeObserver";
import { useRovingFocus } from "./composables/useRovingFocus";
import {
  entries,
  type FormatItem,
  formatItems,
  insertMenuItems,
  moreMenuItems,
  overflowCut,
  partWidths,
  type PartId,
  sameParts,
  styleLabel,
  styleMenuItems,
} from "./formatToolbarModel";
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

const fit = () => {
  const element = root.value;
  if (!element || !widths) return;
  const style = getComputedStyle(element);
  const available =
    element.clientWidth -
    parseFloat(style.paddingLeft || "0") -
    parseFloat(style.paddingRight || "0");
  // the More button, or another icon button of its size while it's away
  const more =
    element.querySelector("[data-more]") ?? element.querySelector("button");
  const moreWidth = (more?.getBoundingClientRect().width ?? 0) + 2;
  const next = overflowCut(widths, moreWidth, available);
  if (!sameParts(next, cut.value)) cut.value = next;
};
// measured with every part shown, then fitted
const remeasure = async () => {
  cut.value = new Set();
  await nextTick();
  const element = root.value;
  if (!element) return;
  widths = partWidths((part) =>
    [...element.querySelectorAll(`[data-part="${part}"]`)].map((control) =>
      control.getBoundingClientRect(),
    ),
  );
  fit();
};

onMounted(() => {
  void remeasure();
  // again once the font of the labels is there
  void document.fonts?.ready.then(remeasure);
  document.fonts?.addEventListener("loadingdone", remeasure);
});
onUnmounted(() => {
  document.fonts?.removeEventListener("loadingdone", remeasure);
});
useResizeObserver(() => [root.value], fit);

// the controls in the order the keys move through them
const stops = computed(() => {
  const order = new Map<string, number>();
  for (const entry of shown.value) {
    if (entry.kind !== "separator") order.set(entry.key, order.size);
  }
  return order;
});
const { current, onKeydown, follow, clamp, focusCurrent } = useRovingFocus(
  () => root.value,
  "button",
);
const tabindexOf = (key: string) =>
  stops.value.get(key) === current.value ? 0 : -1;

// a part moved into More takes its buttons along, the focused one too: the
// focus goes to the button now in the tab order, rather than nowhere
watch(
  shown,
  () => {
    clamp();
    if (toolbarFocused.value && !root.value?.contains(document.activeElement)) {
      focusCurrent();
    }
  },
  { flush: "post" },
);

// F6 comes to the toolbar after the tab row, and Alt-F10 right away
const region = useFocusRegion(() => root.value, toolbarFocused, {
  id: "toolbar",
  order: FOCUS_ORDER.toolbar,
  focus: focusCurrent,
});
const onFocusIn = (event: FocusEvent) => {
  region.onFocusin();
  // the control the focus went to is the one in the tab order
  follow(event.target);
};
const onFocusOut = region.onFocusout;
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
    class="top-row"
    role="toolbar"
    aria-label="Formatting"
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
        data-more
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

<script setup lang="ts">
import { computed, useTemplateRef } from "vue";

import { useEditor } from "../editor/handle";
import type { Anchor, MenuItem } from "../state";
import IconGlyph from "./components/IconGlyph.vue";
import { useMenuButton } from "./composables/useMenuButton";
import { tipAttrs } from "./tooltipModel";

// A button of the formatting toolbar that opens a menu below it: the style
// menu (its text the selection's style), Insert and More. A menu a click
// opened gives the text the focus when it closes. One opened from the
// keyboard (↓, Enter or Space on the focused button) starts on its first
// item and gives the button the focus back when it closes, also after an
// item ran, so the toolbar keeps it.
const props = withDefaults(
  defineProps<{
    // its name, for its tooltip and screen readers
    label: string;
    icon?: string;
    // what it says, e.g. the style or "Insert"
    text?: string;
    // the menu, below `anchor`
    items: (anchor: Anchor) => MenuItem[];
    tabindex?: number;
    // the arrow that says a menu opens, but on the More button
    chevron?: boolean;
  }>(),
  { icon: undefined, text: undefined, tabindex: -1, chevron: true },
);

const editor = useEditor();
const button = useTemplateRef<HTMLButtonElement>("button");
const menu = useMenuButton((keyboard) => {
  if (keyboard) button.value?.focus();
  else editor.focus();
});

const tip = computed(() => tipAttrs({ name: props.label }));

// the menu is built only to open it, not when a click closes it
const open = (event: Event) => {
  if (menu.isOpen.value) return menu.toggle(event, []);
  const { left, bottom } = button.value!.getBoundingClientRect();
  menu.toggle(event, props.items({ left, top: bottom, bottom }));
};
const openByKey = (event: KeyboardEvent) => {
  event.preventDefault();
  if (!menu.isOpen.value) open(event);
};
</script>

<template>
  <button
    ref="button"
    type="button"
    class="icon-button toolbar-menu-button"
    v-bind="tip"
    :aria-label="text ? `${label}: ${text}` : label"
    aria-haspopup="menu"
    :aria-expanded="menu.isOpen.value"
    :tabindex="tabindex"
    @click="open"
    @keydown.down="openByKey"
  >
    <IconGlyph v-if="icon" :name="icon" />
    <span v-if="text !== undefined" class="text">{{ text }}</span>
    <IconGlyph v-if="chevron" name="chevron-down" />
  </button>
</template>

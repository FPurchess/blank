<script setup lang="ts">
import { type ComponentPublicInstance, useTemplateRef } from "vue";

import { useEditor } from "../editor/handle";
import type { Anchor, MenuItem } from "../state";
import IconButton from "./components/IconButton.vue";
import IconGlyph from "./components/IconGlyph.vue";
import { useMenuButton } from "./composables/useMenuButton";

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
const button = useTemplateRef<ComponentPublicInstance>("button");
const element = () => button.value?.$el as HTMLButtonElement | undefined;
const menu = useMenuButton((keyboard) => {
  if (keyboard) element()?.focus();
  else editor.focus();
});

// the menu is built only to open it, not when a click closes it
const open = (event: Event) => {
  if (menu.isOpen.value) return menu.toggle(event, []);
  const { left, bottom } = element()!.getBoundingClientRect();
  menu.toggle(event, props.items({ left, top: bottom, bottom }));
};
const openByKey = (event: KeyboardEvent) => {
  event.preventDefault();
  if (!menu.isOpen.value) open(event);
};
</script>

<template>
  <IconButton
    ref="button"
    class="toolbar-menu-button"
    :class="{ 'icon-only': text === undefined }"
    :icon="icon"
    :label="text ? `${label}: ${text}` : label"
    :tip="label"
    :tabindex="tabindex"
    aria-haspopup="menu"
    :aria-expanded="menu.isOpen.value"
    @click="open"
    @keydown.down="openByKey"
  >
    <span v-if="text !== undefined" class="text">{{ text }}</span>
    <IconGlyph v-if="chevron" name="chevron-down" />
  </IconButton>
</template>

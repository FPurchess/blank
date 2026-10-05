<script setup lang="ts">
import {
  type ComponentPublicInstance,
  computed,
  useSlots,
  useTemplateRef,
} from "vue";

import { useEditor } from "../../editor/handle";
import type { Anchor, MenuItem } from "../../state";
import { useMenuButton } from "../composables/useMenuButton";
import IconButton from "./IconButton.vue";
import IconGlyph from "./IconGlyph.vue";

// A button that opens a menu below it: the formatting toolbar's style menu,
// Insert and More, or a select, e.g. what the first page has. A menu a click
// opened gives the focus to `refocus` when it closes (the text, unless
// given). One opened from the keyboard (↓, Enter or Space on the focused
// button) starts on its first item and gives the button the focus back when
// it closes, also after an item ran, so the row it is in keeps it.
const props = withDefaults(
  defineProps<{
    // its name, for its tooltip and screen readers
    label: string;
    icon?: string;
    // the tooltip, when it says more than the label
    tip?: string;
    // what it shows as its value, e.g. the style; screen readers hear
    // "label: text"
    text?: string;
    // the menu, below `anchor`
    items: (anchor: Anchor) => MenuItem[];
    tabindex?: number;
    // the arrow that says a menu opens, but on the More button
    chevron?: boolean;
    // what takes the focus when a menu a click opened closes
    refocus?: () => void;
  }>(),
  {
    icon: undefined,
    tip: undefined,
    text: undefined,
    tabindex: undefined,
    chevron: true,
    refocus: undefined,
  },
);

const editor = useEditor();
const slots = useSlots();
const button = useTemplateRef<ComponentPublicInstance>("button");
const element = () => button.value?.$el as HTMLButtonElement | undefined;
const menu = useMenuButton((keyboard) => {
  if (keyboard) element()?.focus();
  else if (props.refocus) props.refocus();
  else editor.focus();
});
// only an icon, without a value or a name it shows
const iconOnly = computed(() => props.text === undefined && !slots.default);

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
    class="menu-button"
    :class="{ 'icon-only': iconOnly }"
    :icon="icon"
    :label="text ? `${label}: ${text}` : label"
    :tip="tip ?? label"
    :tabindex="tabindex"
    aria-haspopup="menu"
    :aria-expanded="menu.isOpen.value"
    @click="open"
    @keydown.down="openByKey"
  >
    <slot />
    <span v-if="text !== undefined" class="text">{{ text }}</span>
    <IconGlyph v-if="chevron" name="chevron-down" />
  </IconButton>
</template>

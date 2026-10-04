<script setup lang="ts">
import { computed, onMounted, onUpdated, useTemplateRef } from "vue";

import { formatShortcut } from "../editor/keyBindings";
import { place } from "../popup";
import type { Anchor, MenuItem } from "../state";
import IconGlyph from "./components/IconGlyph.vue";
import MenuEditField from "./MenuEditField.vue";
import { hasChecks, isEntry, roleOf } from "./menuModel";

// One level of the context menu: the menu itself, or a submenu next to the
// item it belongs to. ContextMenu.vue decides what's focused, open and being
// edited; this renders it, places itself and reports what the user does.
const props = defineProps<{
  items: MenuItem[];
  depth: number;
  anchor: Anchor;
  // the row of the parent item, which a submenu opens next to
  side: DOMRect | null;
  // the focused item, the one whose submenu is open and the one being
  // edited, or -1
  focused: number;
  expanded: number;
  editing: number;
}>();
const emit = defineEmits<{
  hover: [index: number];
  activate: [index: number];
  key: [event: KeyboardEvent];
  editSubmit: [value: string];
  editCancel: [];
  close: [];
}>();

const root = useTemplateRef<HTMLElement>("root");
const checks = computed(() => hasChecks(props.items));

// the rows are the menu's children, one per item, separators included
const rowAt = (index: number) => root.value!.children[index] as HTMLElement;

const placeMenu = () =>
  place(root.value!, props.anchor, props.side ?? undefined);
onMounted(placeMenu);
onUpdated(placeMenu);

/**
 * keepFocus keeps the focus in the menu on a press, except in a text field
 */
const keepFocus = (event: MouseEvent) => {
  if (!(event.target as Element).closest("input, textarea")) {
    event.preventDefault();
  }
};

defineExpose({
  depth: props.depth,
  // focuses the item at `index`, or the menu itself for -1
  focus: (index: number) =>
    index >= 0 ? rowAt(index).focus() : root.value!.focus(),
  rowRect: (index: number) => rowAt(index).getBoundingClientRect(),
});
</script>

<template>
  <div
    :id="depth ? undefined : 'context-menu'"
    ref="root"
    class="context-menu"
    :class="{ submenu: depth > 0 }"
    role="menu"
    tabindex="-1"
    @keydown="emit('key', $event)"
    @mousedown="keepFocus"
    @contextmenu.prevent
  >
    <template
      v-for="(item, index) in items"
      :key="isEntry(item) ? item.id : `separator-${index}`"
    >
      <div v-if="!isEntry(item)" role="separator" />
      <div
        v-else
        :role="roleOf(item)"
        :aria-checked="item.checked"
        :data-id="item.id"
        :tabindex="index === focused ? 0 : -1"
        :aria-disabled="item.disabled || undefined"
        :aria-haspopup="item.children ? 'menu' : undefined"
        :aria-expanded="item.children ? index === expanded : undefined"
        @mouseenter="emit('hover', index)"
        @click.stop="emit('activate', index)"
      >
        <MenuEditField
          v-if="index === editing"
          :item="item"
          @submit="emit('editSubmit', $event)"
          @cancel="emit('editCancel')"
          @close="emit('close')"
        />
        <template v-else>
          <span v-if="checks" class="check" aria-hidden="true">{{
            item.checked ? "✓" : ""
          }}</span>
          <IconGlyph v-if="item.icon" :name="item.icon" />
          <span class="label">{{ item.label }}</span>
          <span v-if="item.detail" class="detail">{{ item.detail }}</span>
          <kbd v-if="item.shortcut">{{ formatShortcut(item.shortcut) }}</kbd>
          <span v-if="item.children" class="more" aria-hidden="true">›</span>
        </template>
      </div>
    </template>
  </div>
</template>

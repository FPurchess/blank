<script setup lang="ts">
import { formatShortcut } from "../editor/keyBindings";
import type { MenuLine } from "../state";
import IconGlyph from "./components/IconGlyph.vue";
import MenuEditField from "./MenuEditField.vue";
import { isEntry, isHead, isRow, labelParts, roleOf } from "./menuModel";
import { tipAttrs } from "./tooltipModel";

// One line of a menu (MenuList.vue): a section's head, a row of items side
// by side, or an item, which may be a text field being edited. Its place in
// the menu is `index`, by which the levels find and focus it.
defineProps<{
  item: MenuLine;
  index: number;
  // the focused line and item of a row, the one whose submenu is open and
  // the one being edited, as MenuList has them
  focused: number;
  column: number;
  expanded: number;
  editing: number;
  // the lines have a column for check marks
  checks: boolean;
  // an option of what a search found, which the search keeps the focus over
  found: boolean;
  optionId: string;
}>();
const emit = defineEmits<{
  hover: [index: number, column: number];
  activate: [index: number, column: number];
  editSubmit: [value: string];
  editCancel: [];
  close: [];
}>();
</script>

<template>
  <div
    v-if="isHead(item)"
    class="menu-head"
    :class="{ 'visually-hidden': !item.shown }"
    aria-hidden="true"
  >
    {{ item.label }}
  </div>
  <div
    v-else-if="isRow(item)"
    role="group"
    class="menu-row"
    :aria-label="item.label"
  >
    <span class="row-label" aria-hidden="true">{{ item.label }}</span>
    <div
      v-for="(child, slot) in item.items"
      :key="child.id"
      :role="roleOf(child)"
      :class="[child.look, { swatch: child.swatch }]"
      :data-id="child.id"
      :data-index="index"
      :data-column="slot"
      :data-theme="child.swatch"
      :aria-label="
        child.tip && child.look === 'value'
          ? `${child.tip}, ${child.label}`
          : child.label
      "
      :aria-checked="child.checked"
      :aria-disabled="child.disabled || undefined"
      :tabindex="index === focused && slot === column ? 0 : -1"
      v-bind="
        tipAttrs({
          name: child.tip ?? child.label,
          command: child.command,
        })
      "
      @mouseenter="emit('hover', index, slot)"
      @click.stop="emit('activate', index, slot)"
    >
      <IconGlyph v-if="child.icon" :name="child.icon" />
      <span v-else-if="!child.swatch" class="label">{{ child.label }}</span>
    </div>
  </div>
  <div
    v-else-if="isEntry(item)"
    :id="found ? optionId : undefined"
    :role="roleOf(item, found)"
    :class="[item.look, { active: found && index === focused }]"
    :aria-checked="found ? undefined : item.checked"
    :aria-selected="found ? index === focused : undefined"
    :data-id="item.id"
    :data-index="index"
    :tabindex="!found && index === focused ? 0 : -1"
    :aria-disabled="item.disabled || undefined"
    :aria-haspopup="item.children && !found ? 'menu' : undefined"
    :aria-expanded="item.children && !found ? index === expanded : undefined"
    v-bind="item.tip ? tipAttrs({ name: item.tip }) : {}"
    @mouseenter="emit('hover', index, 0)"
    @click.stop="emit('activate', index, 0)"
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
      <span class="label"
        ><template v-for="(part, p) in labelParts(item)" :key="p"
          ><mark v-if="part.marked">{{ part.text }}</mark
          ><template v-else>{{ part.text }}</template></template
        ></span
      >
      <span v-if="item.detail" class="detail">{{ item.detail }}</span>
      <kbd v-if="item.shortcut">{{ formatShortcut(item.shortcut) }}</kbd>
      <span v-if="item.children" class="more" aria-hidden="true">›</span>
    </template>
  </div>
</template>

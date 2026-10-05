<script setup lang="ts" generic="T extends string">
import { useTemplateRef } from "vue";

import { useRovingFocus } from "../composables/useRovingFocus";

// A row of tabs drawn as one segmented control, e.g. which pages the header
// strip edits. One tab is selected; ←→ Home End select the next and keep the
// focus on the row, and only the selected tab is in the tab order. Styled by
// `segmented` in src/scss/_controls.scss.
const props = defineProps<{
  // names the row for screen readers
  label: string;
  items: { value: T; label: string }[];
}>();
const selected = defineModel<T>({ required: true });

const root = useTemplateRef<HTMLElement>("root");
const indexOf = (value: T) =>
  Math.max(
    0,
    props.items.findIndex((item) => item.value === value),
  );
const { onKeydown, follow } = useRovingFocus(
  () => root.value,
  "[role=tab]",
  indexOf(selected.value),
  (index) => (selected.value = props.items[index].value),
);

const choose = (value: T, event: MouseEvent) => {
  follow(event.currentTarget);
  selected.value = value;
};
</script>

<template>
  <div
    ref="root"
    class="segmented"
    role="tablist"
    :aria-label="label"
    @keydown="onKeydown"
  >
    <button
      v-for="item in items"
      :key="item.value"
      type="button"
      role="tab"
      :data-value="item.value"
      :aria-selected="item.value === selected"
      :tabindex="item.value === selected ? 0 : -1"
      @click="choose(item.value, $event)"
    >
      {{ item.label }}
    </button>
  </div>
</template>

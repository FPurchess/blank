<script setup lang="ts" generic="T extends OptionValue">
import { useTemplateRef } from "vue";

import type { Option } from "../../layout/choices";
import {
  type Chosen,
  chooseAt,
  firstStop,
  isOn,
  type OptionValue,
} from "../optionGroupModel";
import { useRovingFocus } from "../composables/useRovingFocus";

// A labelled row of option buttons. With a value, it's a radio group: one
// option is checked, and ←→ check the next. With a list of values, the
// options are toggle buttons that are each on or off: ←→ move between them,
// and Space or a click switches one. One button is in the tab order at a
// time, so Tab leaves the row, and the dialog can move between rows with ↑↓
// (`[data-row] button[tabindex="0"]`).
const props = defineProps<{
  // the label's id, which names the row for screen readers
  id: string;
  // the row, as `data-row`
  name: string;
  label: string;
  options: Option<T>[];
}>();
const chosen = defineModel<Chosen<T>>({ required: true });

// a row doesn't change its kind, and a new request gets a new dialog
const toggles = Array.isArray(chosen.value);
const row = useTemplateRef<HTMLElement>("row");
// the option in the tab order, which ←→ move; in a radio group they check it
const {
  current,
  onKeydown: move,
  follow,
} = useRovingFocus(
  () => row.value,
  ".options button",
  firstStop(chosen.value, props.options),
  (index) => {
    if (!toggles) chosen.value = chooseAt(chosen.value, props.options, index);
  },
);

const press = (index: number, event: MouseEvent) => {
  follow(event.currentTarget);
  chosen.value = chooseAt(chosen.value, props.options, index);
  // WebKit doesn't focus a clicked button, and ↑↓ go on from the checked one
  if (!toggles) (event.currentTarget as HTMLButtonElement).focus();
};
</script>

<template>
  <div
    ref="row"
    class="setting"
    :data-row="name"
    :role="toggles ? 'group' : 'radiogroup'"
    :aria-labelledby="id"
    @keydown="move"
  >
    <span :id="id" class="setting-label">{{ label }}</span>
    <div class="options">
      <button
        v-for="(option, index) in options"
        :key="option.value"
        type="button"
        :role="toggles ? undefined : 'radio'"
        :data-value="option.value"
        :tabindex="index === current ? 0 : -1"
        :aria-checked="toggles ? undefined : isOn(chosen, option.value)"
        :aria-pressed="toggles ? isOn(chosen, option.value) : undefined"
        @click="press(index, $event)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

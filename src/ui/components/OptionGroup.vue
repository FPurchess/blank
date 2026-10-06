<script setup lang="ts" generic="T extends OptionValue">
import { type ComponentPublicInstance, useTemplateRef, watch } from "vue";

import type { Option } from "../../layout/choices";
import {
  type Chosen,
  chooseAt,
  firstStop,
  isOn,
  type OptionValue,
} from "../optionGroupModel";
import { tipAttrs } from "../tooltipModel";
import { useRovingFocus } from "../composables/useRovingFocus";
import SettingRow from "./SettingRow.vue";

// A labelled row of options, drawn as one segmented control. With a value,
// it's a radio group: one option is checked, and ←→ check the next. With a
// list of values, the options are toggle buttons that are each on or off: ←→
// move between them, and Space or a click switches one. One button is in the
// tab order at a time, so Tab leaves the row, and the dialog can move between
// rows with ↑↓ (`[data-row] button:not([tabindex="-1"])`). An option with a
// `short` label shows it, and its label names it.
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
const row = useTemplateRef<ComponentPublicInstance>("row");
// the option in the tab order, which ←→ move; in a radio group they check it
const {
  current,
  onKeydown: move,
  follow,
} = useRovingFocus(
  () => row.value?.$el as HTMLElement | undefined,
  ".options button",
  firstStop(chosen.value, props.options),
  (index) => {
    if (!toggles) chosen.value = chooseAt(chosen.value, props.options, index);
  },
);
// the checked option stays the one in the tab order when the value changes
// from outside, e.g. a custom paper typed wider than high turns it landscape
if (!toggles) {
  watch(chosen, (value) => {
    current.value = firstStop(value, props.options);
  });
}

const press = (index: number, event: MouseEvent) => {
  follow(event.currentTarget);
  chosen.value = chooseAt(chosen.value, props.options, index);
  // WebKit doesn't focus a clicked button, and ↑↓ go on from the checked one
  if (!toggles) (event.currentTarget as HTMLButtonElement).focus();
};

// a short label names its option, and shows its label as the tooltip
const named = (option: Option<T>) =>
  option.short === undefined
    ? {}
    : { "aria-label": option.label, ...tipAttrs({ name: option.label }) };
</script>

<template>
  <SettingRow
    :id="id"
    ref="row"
    :name="name"
    :label="label"
    :role="toggles ? 'group' : 'radiogroup'"
    :aria-labelledby="id"
    @keydown="move"
  >
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
        v-bind="named(option)"
        @click="press(index, $event)"
      >
        {{ option.short ?? option.label }}
      </button>
    </div>
  </SettingRow>
</template>

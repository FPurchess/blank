<script setup lang="ts">
import { computed, useTemplateRef } from "vue";

// A labelled text field of a dialog, with an optional hint below it that
// screen readers announce. The default slot goes next to the field, e.g. a
// button that fills it. `input` is emitted on every native input event, also
// one that leaves the value as it is (v-model's update isn't), e.g. pasting
// the same text over itself, which still counts as typing.
const props = defineProps<{
  id: string;
  label: string;
  // what the field says about its value below it: its element's id, e.g.
  // "link-dialog-hint", and its text, "" for nothing
  hint?: { id: string; text: string };
  placeholder?: string;
}>();
const value = defineModel<string>({ required: true });
const emit = defineEmits<{ input: [] }>();

const input = useTemplateRef<HTMLInputElement>("input");
// the field's attributes, the same with or without something next to it
const attributes = computed(() => ({
  id: props.id,
  type: "text",
  autocomplete: "off",
  spellcheck: false,
  placeholder: props.placeholder,
  "aria-describedby": props.hint?.id,
}));

defineExpose({
  // focuses the field and selects its text, to type over it
  select: () => {
    input.value!.focus();
    input.value!.select();
  },
});
</script>

<template>
  <label :for="id">{{ label }}</label>
  <div v-if="$slots.default" class="row">
    <input
      ref="input"
      v-model="value"
      v-bind="attributes"
      @input="emit('input')"
    />
    <slot />
  </div>
  <input
    v-else
    ref="input"
    v-model="value"
    v-bind="attributes"
    @input="emit('input')"
  />
  <p v-if="hint" :id="hint.id" aria-live="polite" :hidden="!hint.text">
    {{ hint.text }}
  </p>
</template>

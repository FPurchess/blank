<script setup lang="ts">
import { nextTick, onMounted, useTemplateRef } from "vue";

import { shownIn, trapTab } from "../../dom";

// A modal dialog: a backdrop with a form, titled `title` in its head. Esc and
// a press on the backdrop cancel it, Tab keeps the focus inside, and Enter
// submits the form. It takes the focus once open, on its first field, unless
// the dialog put it somewhere in it itself. The default slot holds its body, `actions` the buttons at
// the right of its foot (Cancel, then the submit button), and `secondary`
// those at the left, e.g. "Don't save".
defineProps<{
  id: string;
  title: string;
  // a class of the form besides `dialog`, for a dialog's own styles
  formClass?: string;
  // the id of the text that says what the dialog is about, read out with
  // its title
  describedBy?: string;
}>();
const emit = defineEmits<{ submit: []; cancel: [] }>();

const form = useTemplateRef<HTMLFormElement>("form");

// the dialog's own onMounted runs after this one's, so look a tick later;
// with the focus left behind, the keys would go to what the dialog covers
onMounted(() =>
  nextTick(() => {
    const element = form.value;
    if (!element || element.contains(document.activeElement)) return;
    const [first] = shownIn(
      element,
      'input:not([type="radio"]:not(:checked)), textarea, button:not(:disabled):not([tabindex="-1"])',
    );
    (first ?? element).focus();
  }),
);

const cancelOnBackdrop = (event: MouseEvent) => {
  if (event.target === event.currentTarget) {
    event.preventDefault();
    emit("cancel");
  }
};
</script>

<template>
  <div :id="id" class="dialog-backdrop" @mousedown="cancelOnBackdrop">
    <form
      ref="form"
      :class="['dialog', formClass]"
      role="dialog"
      tabindex="-1"
      aria-modal="true"
      :aria-labelledby="`${id}-title`"
      :aria-describedby="describedBy"
      @submit.prevent="emit('submit')"
      @keydown.esc.prevent="emit('cancel')"
      @keydown.tab="trapTab(form!, $event)"
    >
      <header class="dialog-head">
        <h2 :id="`${id}-title`">{{ title }}</h2>
      </header>
      <div class="dialog-body">
        <slot />
      </div>
      <div class="dialog-foot actions">
        <div v-if="$slots.secondary" class="secondary">
          <slot name="secondary" />
        </div>
        <slot name="actions" />
      </div>
    </form>
  </div>
</template>

<script setup lang="ts">
import { useTemplateRef } from "vue";

import { shownIn } from "../../dom";

// A modal dialog: a backdrop with a form, titled `title` in its head. Esc and
// a press on the backdrop cancel it, Tab keeps the focus inside, and Enter
// submits the form. The default slot holds its body, `actions` the buttons at
// the right of its foot (Cancel, then the submit button), and `secondary`
// those at the left, e.g. "Edit as text".
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

/**
 * trapFocus moves the focus from the last field back to the first on Tab,
 * and the other way round on Shift+Tab. What Tab can reach: not the unchecked
 * options of a radio group, nor what is hidden.
 */
const trapFocus = (event: KeyboardEvent) => {
  const focusable = shownIn(
    form.value!,
    'input, textarea, button:not(:disabled):not([tabindex="-1"])',
  );
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
};

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
      aria-modal="true"
      :aria-labelledby="`${id}-title`"
      :aria-describedby="describedBy"
      @submit.prevent="emit('submit')"
      @keydown.esc.prevent="emit('cancel')"
      @keydown.tab="trapFocus"
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

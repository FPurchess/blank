<script setup lang="ts">
import { useTemplateRef } from "vue";

// A modal dialog: a backdrop with a form, titled `title`. Esc and a press on
// the backdrop cancel it, Tab keeps the focus inside, and Enter submits the
// form. The default slot holds its fields, `actions` its buttons.
defineProps<{ id: string; title: string }>();
const emit = defineEmits<{ submit: []; cancel: [] }>();

const form = useTemplateRef<HTMLFormElement>("form");

/**
 * trapFocus moves the focus from the last field back to the first on Tab,
 * and the other way round on Shift+Tab. What Tab can reach: not the unchecked
 * options of a radio group, nor what is hidden.
 */
const trapFocus = (event: KeyboardEvent) => {
  const focusable = [
    ...form.value!.querySelectorAll<HTMLElement>(
      'input, textarea, button:not(:disabled):not([tabindex="-1"])',
    ),
  ].filter((element) => !element.closest("[hidden]"));
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
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`${id}-title`"
      @submit.prevent="emit('submit')"
      @keydown.esc.prevent="emit('cancel')"
      @keydown.tab="trapFocus"
    >
      <h2 :id="`${id}-title`">{{ title }}</h2>
      <slot />
      <div class="actions">
        <slot name="actions" />
      </div>
    </form>
  </div>
</template>

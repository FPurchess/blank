<script setup lang="ts">
// A switch: a setting that is on or off and takes effect at once, e.g. "Odd
// and even pages differ". Its label is the default slot, and the whole row is
// the button, so a click on the label switches it too. Styled by `switch` and
// `.switch-row` in src/scss/_controls.scss.
const on = defineModel<boolean>({ required: true });
</script>

<template>
  <button
    type="button"
    role="switch"
    class="switch-row"
    :aria-checked="on"
    @click="on = !on"
  >
    <span class="switch" aria-hidden="true" />
    <slot />
  </button>
</template>

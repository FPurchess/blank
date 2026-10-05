<script setup lang="ts">
import { onMounted, shallowRef } from "vue";

import { loadNotices } from "./aboutModel";
import InnerPage from "./InnerPage.vue";

// The licenses of the software Blank uses, loaded only when asked: one block
// of plain text, which the page scrolls.
const emit = defineEmits<{ back: [] }>();

const text = shallowRef<string>();
const failed = shallowRef(false);
onMounted(async () => {
  try {
    text.value = await loadNotices();
  } catch (error) {
    console.warn("failed to load the licenses", error);
    failed.value = true;
  }
});
</script>

<template>
  <InnerPage
    title="Licenses"
    subtitle="THIRD-PARTY-NOTICES.txt"
    back-tip="Back to About"
    @back="emit('back')"
  >
    <p v-if="failed" class="error" role="alert">
      Blank couldn't load the licenses.
    </p>
    <pre
      v-else
      class="licenses"
      tabindex="0"
      aria-label="Licenses"
      :aria-busy="text === undefined"
      >{{ text ?? "Loading…" }}</pre>
  </InnerPage>
</template>

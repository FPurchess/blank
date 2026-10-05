<script setup lang="ts">
import { onMounted, onScopeDispose, shallowRef } from "vue";

import { chunksOf, loadNotices } from "./aboutModel";
import InnerPage from "./InnerPage.vue";

// The licenses of the software Blank uses, loaded only when asked, as plain
// text that the page scrolls. It's long, so it's drawn a block at a time,
// one per frame, and the first shows at once.
const emit = defineEmits<{ back: [] }>();

const chunks = shallowRef<string[]>([]);
const shown = shallowRef(0);
const loading = shallowRef(true);
const failed = shallowRef(false);
let frame = 0;

const showNext = () => {
  shown.value += 1;
  if (shown.value < chunks.value.length)
    frame = requestAnimationFrame(showNext);
  else loading.value = false;
};
onScopeDispose(() => cancelAnimationFrame(frame));

onMounted(async () => {
  try {
    chunks.value = chunksOf(await loadNotices());
    showNext();
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
    <div
      v-else
      class="licenses"
      tabindex="0"
      role="document"
      aria-label="Licenses"
      :aria-busy="loading"
    >
      <pre v-if="chunks.length === 0">Loading…</pre>
      <pre v-for="(chunk, index) in chunks.slice(0, shown)" :key="index">{{
        chunk
      }}</pre>
    </div>
  </InnerPage>
</template>

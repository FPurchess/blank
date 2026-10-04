<script setup lang="ts">
import { computed } from "vue";
import { useData, withBase } from "vitepress";

// the demo in the site's theme, light or dark (see Shot.vue)
const { isDark } = useData();
const src = computed(() =>
  withBase(
    isDark.value ? "/screenshots/demo-dark.gif" : "/screenshots/demo.gif",
  ),
);
</script>

<template>
  <div class="demo">
    <div class="window">
      <div class="bar" aria-hidden="true">
        <span></span><span></span><span></span>
        <strong>Blank</strong>
      </div>
      <img
        :src="src"
        width="800"
        height="400"
        alt="Someone starts writing in Blank: a heading, “A great start”, a few lines about the blank page, the word “uncertain” erased and replaced with “possible”, and a closing line in italics; then focus mode lets the bars fade while the last line is typed"
      />
    </div>
  </div>
</template>

<style scoped>
.demo {
  padding: 0 24px 48px;
}
.window {
  max-width: 800px;
  margin: 0 auto;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
  background: var(--vp-c-bg);
  box-shadow: var(--vp-shadow-5);
}
.bar {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 36px;
  padding: 0 14px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
}
.bar span {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--vp-c-default-3);
}
.bar strong {
  flex: 1;
  margin-right: 60px;
  text-align: center;
  font-size: 13px;
  font-weight: 500;
  color: var(--vp-c-text-2);
}
img {
  display: block;
  width: 100%;
  height: auto;
}
@media (min-width: 640px) {
  .demo {
    padding: 0 48px 64px;
  }
}
</style>

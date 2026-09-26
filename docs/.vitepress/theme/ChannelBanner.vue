<script setup lang="ts">
import { computed, watchEffect } from "vue";
import { inBrowser, useRoute } from "vitepress";

import { channelBase, pageIn, useBlank, useVersions } from "./versions";

const blank = useBlank();
const route = useRoute();
const versions = useVersions(blank.root);

// dev always shows the banner, a frozen release only once a newer one exists
const message = computed(() => {
  if (blank.channel === "dev")
    return "You are reading the docs of the unreleased development version.";
  if (
    blank.channel === "archive" &&
    versions.value &&
    versions.value.latest !== blank.version
  )
    return `You are reading the docs of Blank v${blank.version}, an older version.`;
  return undefined;
});
// the nav bar is fixed on wide screens, so it has to make room for the banner (see the style
// below). The dev banner is known at build time, config.ts reserves its room before hydration
watchEffect(() => {
  if (inBrowser)
    document.documentElement.classList.toggle(
      "has-channel-banner",
      !!message.value,
    );
});
const latestLink = computed(() =>
  pageIn(route.path, channelBase(blank.root, "latest")),
);
</script>

<template>
  <div v-if="message" class="channel-banner">
    {{ message }}
    <a :href="latestLink" target="_self">Go to the latest version →</a>
  </div>
</template>

<style scoped>
.channel-banner {
  position: relative;
  z-index: 40;
  box-sizing: border-box;
  padding: 8px 24px;
  text-align: center;
  font-size: 14px;
  color: var(--vp-c-warning-1);
  background: var(--vp-c-warning-soft);
}
@media (min-width: 960px) {
  .channel-banner {
    height: 37px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  :global(html.has-channel-banner) {
    --vp-layout-top-height: 37px;
  }
}
.channel-banner a {
  margin-left: 6px;
  font-weight: 600;
  color: inherit;
  text-decoration: underline;
}
</style>

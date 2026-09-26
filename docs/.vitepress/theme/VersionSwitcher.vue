<script setup lang="ts">
import { computed } from "vue";
import { useRoute } from "vitepress";

import { channelBase, pageIn, useBlank, useVersions } from "./versions";

defineProps<{ screen?: boolean }>();

const blank = useBlank();
const route = useRoute();
const versions = useVersions(blank.root);

const current = computed(() => {
  if (blank.channel === "dev") return "dev";
  return `v${blank.version}`;
});

const options = computed(() => {
  const latest = versions.value?.latest ?? (blank.channel === "latest" ? blank.version : undefined);
  const archived = (versions.value?.versions ?? []).filter((v) => v !== latest);
  const link = (target: string) => pageIn(route.path, channelBase(blank.root, target));
  return [
    ...(latest ? [{ text: `v${latest} (latest)`, link: link("latest"), active: blank.channel !== "dev" && blank.version === latest }] : []),
    { text: "dev (main)", link: link("dev"), active: blank.channel === "dev" },
    ...archived.map((v) => ({ text: `v${v}`, link: link(v), active: blank.channel === "archive" && blank.version === v })),
  ];
});
</script>

<template>
  <div class="version-switcher" :class="{ screen }">
    <details>
      <summary aria-label="Choose documentation version">{{ current }}</summary>
      <ul>
        <li v-for="option in options" :key="option.text">
          <a :href="option.link" :class="{ active: option.active }" target="_self">{{ option.text }}</a>
        </li>
      </ul>
    </details>
  </div>
</template>

<style scoped>
.version-switcher {
  position: relative;
  display: flex;
  align-items: center;
  margin-left: 12px;
  font-size: 13px;
  font-weight: 500;
}
/* on small screens the switcher moves into the menu (nav-screen-content-after) */
@media (max-width: 767px) {
  .version-switcher:not(.screen) {
    display: none;
  }
}
.version-switcher.screen {
  margin: 24px 0 0;
}
summary {
  cursor: pointer;
  list-style: none;
  padding: 2px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
}
summary::after {
  content: " ▾";
  color: var(--vp-c-text-3);
}
summary::-webkit-details-marker {
  display: none;
}
ul {
  position: absolute;
  right: 0;
  z-index: 100;
  min-width: 150px;
  margin: 6px 0 0;
  padding: 6px;
  list-style: none;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  background: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-3);
}
.screen ul {
  position: static;
  box-shadow: none;
}
a {
  display: block;
  padding: 4px 10px;
  border-radius: 4px;
  color: var(--vp-c-text-1);
  white-space: nowrap;
}
a:hover {
  background: var(--vp-c-default-soft);
}
a.active {
  color: var(--vp-c-brand-1);
}
</style>

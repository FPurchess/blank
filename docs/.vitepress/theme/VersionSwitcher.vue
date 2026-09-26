<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute } from "vitepress";

import { channelBase, pageIn, useBlank, useVersions } from "./versions";

defineProps<{ screen?: boolean }>();

const blank = useBlank();
const route = useRoute();
const versions = useVersions(blank.root);

const current = computed(() =>
  blank.channel === "dev" ? "dev" : `v${blank.version}`,
);

// latest first, then dev, then the frozen releases (newest first, as in versions.json)
const options = computed(() => {
  const latest =
    versions.value?.latest ??
    (blank.channel === "latest" ? blank.version : undefined);
  const archived = (versions.value?.versions ?? []).filter((v) => v !== latest);
  const link = (target: string) =>
    pageIn(route.path, channelBase(blank.root, target));
  return [
    ...(latest
      ? [
          {
            text: `v${latest}`,
            note: "latest",
            link: link("latest"),
            active: blank.channel !== "dev" && blank.version === latest,
          },
        ]
      : []),
    {
      text: "dev",
      note: "unreleased",
      link: link("dev"),
      active: blank.channel === "dev",
    },
    ...archived.map((v) => ({
      text: `v${v}`,
      note: "",
      link: link(v),
      active: blank.channel === "archive" && blank.version === v,
    })),
  ];
});

// a <details> dropdown, closed by a click elsewhere or Escape like the nav menus
const details = ref<HTMLDetailsElement>();
const close = (event: Event) => {
  if (!details.value?.open) return;
  if (
    event instanceof KeyboardEvent
      ? event.key === "Escape"
      : !details.value.contains(event.target as Node)
  )
    details.value.open = false;
};
onMounted(() => {
  document.addEventListener("click", close);
  document.addEventListener("keydown", close);
});
onBeforeUnmount(() => {
  document.removeEventListener("click", close);
  document.removeEventListener("keydown", close);
});
</script>

<template>
  <div class="version-switcher" :class="{ screen }">
    <details ref="details">
      <summary
        :aria-label="`Documentation version: ${current}. Choose another version`"
      >
        {{ current }}
      </summary>
      <ul>
        <li v-for="option in options" :key="option.text">
          <a
            :href="option.link"
            :class="{ active: option.active }"
            :aria-current="option.active ? 'page' : undefined"
            target="_self"
          >
            {{ option.text }}
            <span v-if="option.note" class="note">{{ option.note }}</span>
          </a>
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
  margin-left: 16px;
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
  font-size: 14px;
}
summary {
  cursor: pointer;
  list-style: none;
  padding: 3px 10px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
  transition: border-color 0.25s;
}
summary:hover,
details[open] summary {
  border-color: var(--vp-c-brand-1);
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
  min-width: 170px;
  margin: 8px 0 0;
  padding: 6px;
  list-style: none;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-elv);
  box-shadow: var(--vp-shadow-3);
}
.screen ul {
  position: static;
  box-shadow: none;
}
a {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 6px 10px;
  border-radius: 6px;
  color: var(--vp-c-text-1);
  font-family: var(--vp-font-family-mono);
  white-space: nowrap;
  transition: background-color 0.15s;
}
a:hover {
  background: var(--vp-c-default-soft);
}
a.active {
  color: var(--vp-c-brand-1);
  font-weight: 700;
}
.note {
  font-family: var(--vp-font-family-base);
  font-weight: 400;
  color: var(--vp-c-text-3);
}
</style>

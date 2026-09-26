<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { useBlank, useVersions } from "./versions";

defineProps<{ compact?: boolean }>();

// the installers published by .github/workflows/publish.yml, named by tauri-action
type Os = "macos" | "windows" | "linux";
interface Asset {
  label: string;
  file: (version: string) => string;
}

const assets: Record<Os, { name: string; items: Asset[] }> = {
  macos: {
    name: "macOS",
    items: [
      { label: "Apple Silicon (.dmg)", file: (v) => `blank_${v}_aarch64.dmg` },
      { label: "Intel (.dmg)", file: (v) => `blank_${v}_x64.dmg` },
    ],
  },
  windows: {
    name: "Windows",
    items: [
      { label: "Installer (.msi)", file: (v) => `blank_${v}_x64_en-US.msi` },
      { label: "Setup (.exe)", file: (v) => `blank_${v}_x64-setup.exe` },
    ],
  },
  linux: {
    name: "Linux",
    items: [
      { label: "Debian, Ubuntu (.deb)", file: (v) => `blank_${v}_amd64.deb` },
      {
        label: "Fedora, openSUSE (.rpm)",
        file: (v) => `blank-${v}-1.x86_64.rpm`,
      },
      {
        label: "Any distribution (AppImage)",
        file: (v) => `blank_${v}_amd64.AppImage`,
      },
    ],
  },
};

const releases = "https://github.com/FPurchess/blank/releases";
const blank = useBlank();
const versions = useVersions(blank.root);

// the dev docs may be ahead of the latest release, so they offer the latest release instead
const version = computed(() =>
  blank.channel === "dev" ? versions.value?.latest : blank.version,
);
const href = (asset: Asset) =>
  version.value
    ? `${releases}/download/v${version.value}/${asset.file(version.value)}`
    : `${releases}/latest`;

const detected = ref<Os | undefined>();
onMounted(() => {
  const nav = navigator as Navigator & {
    userAgentData?: { platform?: string };
  };
  const platform = (
    nav.userAgentData?.platform ||
    nav.platform ||
    ""
  ).toLowerCase();
  if (platform.includes("mac")) detected.value = "macos";
  else if (platform.includes("win")) detected.value = "windows";
  else if (platform.includes("linux") && !/android/i.test(navigator.userAgent))
    detected.value = "linux";
});

const primary = computed(() =>
  detected.value ? assets[detected.value] : undefined,
);
</script>

<template>
  <div class="downloads" :class="{ compact }">
    <div class="primary">
      <a v-if="primary" class="button" :href="href(primary.items[0])">
        Download for {{ primary.name }}
      </a>
      <a v-else class="button" :href="`${releases}/latest`">Download Blank</a>
      <span class="hint">
        <template v-if="primary">{{ primary.items[0].label }}</template>
        <template v-if="primary && version"> · </template>
        <template v-if="version">v{{ version }}</template>
      </span>
    </div>
    <div class="all">
      <div
        v-for="(os, key) in assets"
        :key="key"
        class="os"
        :class="{ current: key === detected }"
      >
        <strong>{{ os.name }}</strong>
        <a v-for="item in os.items" :key="item.label" :href="href(item)">
          {{ item.label }}
        </a>
      </div>
    </div>
    <p class="note">
      Free and open source.
      <a :href="releases">Release notes and older versions →</a>
    </p>
  </div>
</template>

<style scoped>
.downloads {
  margin: 24px 0;
}
.primary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 16px;
}
.compact .primary {
  justify-content: center;
}
.button {
  display: inline-block;
  padding: 0 24px;
  line-height: 44px;
  border-radius: 22px;
  font-size: 16px;
  font-weight: 600;
  color: var(--vp-button-brand-text) !important;
  background: var(--vp-button-brand-bg);
  text-decoration: none !important;
  transition: background-color 0.25s;
}
.button:hover {
  background: var(--vp-button-brand-hover-bg);
}
.hint {
  color: var(--vp-c-text-2);
  font-size: 14px;
}
.all {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 12px;
  margin-top: 20px;
}
.os {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  font-size: 14px;
  text-align: left;
}
.os strong {
  margin-bottom: 2px;
  color: var(--vp-c-text-1);
}
.os a {
  color: var(--vp-c-text-2);
  text-decoration: none;
  font-weight: 500;
}
.os a:hover {
  color: var(--vp-c-brand-1);
  text-decoration: underline;
}
.os.current {
  border-color: var(--vp-c-brand-1);
}
.note {
  margin-top: 16px;
  font-size: 14px;
  color: var(--vp-c-text-2);
}
.compact .note {
  text-align: center;
}
</style>

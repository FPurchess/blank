<script setup lang="ts">
import { computed, onMounted, ref } from "vue";

import { useBlank } from "./versions";

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
      { label: "Debian / Ubuntu (.deb)", file: (v) => `blank_${v}_amd64.deb` },
      { label: "Fedora / openSUSE (.rpm)", file: (v) => `blank-${v}-1.x86_64.rpm` },
      { label: "AppImage", file: (v) => `blank_${v}_amd64.AppImage` },
    ],
  },
};

const releases = "https://github.com/FPurchess/blank/releases";
const blank = useBlank();

// the dev docs may be ahead of the latest release, so they link to the releases page
const href = (asset: Asset) =>
  blank.channel === "dev"
    ? `${releases}/latest`
    : `${releases}/download/v${blank.version}/${asset.file(blank.version)}`;

const detected = ref<Os | undefined>();
onMounted(() => {
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = (nav.userAgentData?.platform ?? nav.platform ?? "").toLowerCase();
  if (platform.includes("mac")) detected.value = "macos";
  else if (platform.includes("win")) detected.value = "windows";
  else if (platform.includes("linux")) detected.value = "linux";
});

const primary = computed(() => (detected.value ? assets[detected.value] : undefined));
</script>

<template>
  <div class="downloads">
    <p v-if="primary" class="primary">
      <a class="button" :href="href(primary.items[0])">Download for {{ primary.name }}</a>
      <span class="hint">{{ primary.items[0].label }} · v{{ blank.version }}</span>
    </p>
    <div class="all">
      <div v-for="(os, key) in assets" :key="key" class="os" :class="{ current: key === detected }">
        <strong>{{ os.name }}</strong>
        <a v-for="item in os.items" :key="item.label" :href="href(item)">{{ item.label }}</a>
      </div>
    </div>
    <p class="note">
      <a :href="releases">All releases and release notes →</a>
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
  gap: 12px;
}
.button {
  display: inline-block;
  padding: 0 20px;
  line-height: 40px;
  border-radius: 20px;
  font-weight: 600;
  color: var(--vp-button-brand-text) !important;
  background: var(--vp-button-brand-bg);
  text-decoration: none !important;
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
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  margin-top: 16px;
}
.os {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  border: 1px solid var(--vp-c-divider);
  border-radius: 8px;
  font-size: 14px;
}
.os.current {
  border-color: var(--vp-c-brand-1);
}
.note {
  font-size: 14px;
}
</style>

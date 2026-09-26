import { ref } from "vue";
import { useData, withBase } from "vitepress";

import type { BlankThemeConfig } from "../config";

// versions.json lives at the root of the deployed site (the "latest" channel) and
// is written by .github/workflows/docs.yml. Every channel reads the same file, so
// frozen versions still list the releases that came after them.
export interface Versions {
  latest: string;
  versions: string[];
}

const versions = ref<Versions | undefined>();
let loading: Promise<void> | undefined;

export const useBlank = () => useData().theme.value.blank as BlankThemeConfig;

export const useVersions = (root: string) => {
  loading ??= fetch(`${root}versions.json`)
    .then((res) => (res.ok ? res.json() : undefined))
    .then((value: Versions | undefined) => {
      versions.value = value;
    })
    .catch(() => {
      // not deployed (e.g. local preview): the switcher only shows the current version
    });
  return versions;
};

/**
 * channelBase returns the base path of a channel: the root for latest, dev/ for dev
 * and v<version>/ for a frozen release
 */
export const channelBase = (root: string, target: "latest" | "dev" | string) =>
  target === "latest"
    ? root
    : `${root}${target === "dev" ? "dev" : `v${target}`}/`;

/**
 * pageIn returns the current page's path in another channel, so switching keeps the page
 */
export const pageIn = (path: string, targetBase: string) => {
  const page = path.startsWith(withBase("/"))
    ? path.slice(withBase("/").length)
    : "";
  return targetBase + page;
};

import { readFileSync } from "node:fs";
import {
  defineConfigWithTheme,
  type DefaultTheme,
  type HeadConfig,
} from "vitepress";

// the site is deployed in several channels next to each other (see docs/deploy.sh):
// "latest" at the root, "dev" at dev/ and each release frozen at v<version>/
const root = process.env.DOCS_ROOT ?? "/blank/";
const base = process.env.DOCS_BASE ?? root;
const channel = (process.env.DOCS_CHANNEL ?? "latest") as Channel;
// the app version, overridable to preview a frozen release locally
const version =
  process.env.DOCS_VERSION ??
  (
    JSON.parse(
      readFileSync(new URL("../../package.json", import.meta.url), "utf-8"),
    ) as { version: string }
  ).version;

export type Channel = "latest" | "dev" | "archive";

export interface BlankThemeConfig {
  root: string;
  channel: Channel;
  version: string;
}

const repo = "https://github.com/FPurchess/blank";
const origin = "https://fpurchess.github.io";
const description =
  "A minimalist, keyboard-only markdown editor made for writing. For Linux, macOS and Windows.";

const head: HeadConfig[] = [
  ["link", { rel: "icon", type: "image/svg+xml", href: `${base}app-icon.svg` }],
  ["meta", { name: "theme-color", content: "#11191f" }],
  ["meta", { property: "og:type", content: "website" }],
  ["meta", { property: "og:title", content: "Blank" }],
  ["meta", { property: "og:description", content: description }],
  [
    "meta",
    {
      property: "og:image",
      content: `${origin}${base}screenshots/theme-light.png`,
    },
  ],
  ["meta", { name: "twitter:card", content: "summary_large_image" }],
];
if (channel !== "latest") {
  // only the latest docs should show up in search engines
  head.push(["meta", { name: "robots", content: "noindex" }]);
}
if (channel === "dev") {
  // the dev banner is known at build time, so the fixed nav bar makes room for it right
  // away instead of jumping down once the page is hydrated (see ChannelBanner.vue)
  head.push([
    "style",
    {},
    "@media (min-width: 960px) { :root { --vp-layout-top-height: 37px; } }",
  ]);
}

export default defineConfigWithTheme<
  DefaultTheme.Config & { blank: BlankThemeConfig }
>({
  base,
  lang: "en-US",
  title: "Blank",
  description,
  cleanUrls: true,
  head,
  themeConfig: {
    logo: "/app-icon.svg",
    blank: { root, channel, version } satisfies BlankThemeConfig,
    nav: [
      { text: "Download", link: "/guide/install" },
      {
        text: "Guide",
        link: "/guide/writing",
        activeMatch:
          "^/guide/(writing|files|autocorrect|spelling|themes|configuration|faq)",
      },
      { text: "Shortcuts", link: "/guide/shortcuts" },
    ],
    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "Install", link: "/guide/install" },
          { text: "Writing in Blank", link: "/guide/writing" },
          { text: "Files & formats", link: "/guide/files" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Keyboard shortcuts", link: "/guide/shortcuts" },
          { text: "Autocorrect", link: "/guide/autocorrect" },
          { text: "Spell check", link: "/guide/spelling" },
          { text: "Themes", link: "/guide/themes" },
          { text: "Configuration", link: "/guide/configuration" },
        ],
      },
      {
        text: "Help",
        items: [
          { text: "FAQ", link: "/guide/faq" },
          { text: "Contributing", link: "/contributing" },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: repo }],
    search: { provider: "local" },
    // fixes to the docs always go to main, whichever version is being read. The function
    // runs in the browser, so it can't use the constants of this file
    editLink: {
      pattern: ({ filePath }) =>
        filePath === "contributing.md"
          ? "https://github.com/FPurchess/blank/edit/main/CONTRIBUTING.md"
          : `https://github.com/FPurchess/blank/edit/main/docs/${filePath}`,
      text: "Improve this page on GitHub",
    },
    footer: {
      message: `Released under the <a href="${repo}/blob/main/LICENSE">GNU AGPL v3.0</a> · <a href="${repo}">Source on GitHub</a>`,
      copyright:
        channel === "dev"
          ? "Documentation of the development version"
          : `Documentation of Blank v${version}`,
    },
  },
});

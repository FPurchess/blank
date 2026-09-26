import { readFileSync } from "node:fs";
import { defineConfig } from "vitepress";

// the site is deployed in several channels next to each other (see .github/workflows/docs.yml):
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
const description =
  "A minimalist, keyboard-only markdown editor made for writing. For Linux, macOS and Windows.";

export default defineConfig({
  base,
  lang: "en-US",
  title: "Blank",
  description,
  cleanUrls: true,
  // archived versions must not compete with the latest one in search engines
  head: [
    [
      "link",
      { rel: "icon", type: "image/svg+xml", href: `${base}app-icon.svg` },
    ],
    ["meta", { property: "og:title", content: "Blank" }],
    ["meta", { property: "og:description", content: description }],
    ...(channel === "latest"
      ? []
      : [
          ["meta", { name: "robots", content: "noindex" }] as [
            string,
            Record<string, string>,
          ],
        ]),
  ],
  themeConfig: {
    logo: "/app-icon.svg",
    blank: { root, channel, version } satisfies BlankThemeConfig,
    nav: [
      { text: "Download", link: "/guide/install" },
      { text: "Guide", link: "/guide/writing" },
      { text: "Shortcuts", link: "/guide/shortcuts" },
    ],
    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "Install", link: "/guide/install" },
          { text: "Writing in Blank", link: "/guide/writing" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Keyboard shortcuts", link: "/guide/shortcuts" },
          { text: "Autocorrect", link: "/guide/autocorrect" },
          { text: "Themes", link: "/guide/themes" },
          { text: "Configuration", link: "/guide/configuration" },
        ],
      },
      {
        text: "Help",
        items: [
          { text: "FAQ", link: "/guide/faq" },
          { text: "Contributing", link: `${repo}/blob/main/CONTRIBUTING.md` },
        ],
      },
    ],
    socialLinks: [{ icon: "github", link: repo }],
    search: { provider: "local" },
    editLink:
      channel === "dev"
        ? {
            pattern: `${repo}/edit/main/docs/:path`,
            text: "Edit this page on GitHub",
          }
        : undefined,
    footer: {
      message: "Released under the GNU Affero General Public License v3.0.",
    },
  },
});

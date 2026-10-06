import { createReadStream, existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Plugin } from "vite";
import {
  defineConfigWithTheme,
  type DefaultTheme,
  type HeadConfig,
} from "vitepress";

// the site is deployed in several channels next to each other (see docs/deploy.sh):
// "latest" at the root, "dev" at dev/ and each release frozen at v<version>/
const root = process.env.DOCS_ROOT ?? "/";
const base = process.env.DOCS_BASE ?? root;
// what `vitepress dev` serves is the branch being written, not a release:
// it says so with the dev banner, rather than passing for the latest version
const channel = (process.env.DOCS_CHANNEL ??
  (process.argv.includes("dev") ? "dev" : "latest")) as Channel;
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
const origin = "https://blank-writer.xyz";
const description =
  "A minimalist, keyboard-first markdown editor made for writing. For Linux, macOS and Windows.";

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

// The screenshots are captured on main by CI, and proposed in a PR of their own
// (.github/workflows/e2e.yml), so a page can show a picture before its file is
// there. Vite would fail the build on it: the page links it where it will be.
const MISSING_SHOT = "\0missing-shot:";
const missingShots: Plugin = {
  name: "blank-missing-shots",
  enforce: "pre",
  resolveId(id) {
    if (!id.startsWith("/screenshots/")) return;
    if (existsSync(new URL(`../public${id}`, import.meta.url))) return;
    this.warn(`${id} isn't captured yet, the page links it anyway`);
    return MISSING_SHOT + id;
  },
  load(id) {
    if (!id.startsWith(MISSING_SHOT)) return;
    const url = base + id.slice(MISSING_SHOT.length + 1);
    return `export default ${JSON.stringify(url)};`;
  },
};

// `DOCS_SHOTS=../e2e/screenshots/docs make docs-dev` shows the pictures a
// local capture made (make docs-screenshots) instead of the committed ones,
// to look at them on their pages before CI captures them
const shotsDir = process.env.DOCS_SHOTS
  ? resolve(process.env.DOCS_SHOTS)
  : undefined;
const localShots: Plugin = {
  name: "blank-local-shots",
  apply: "serve",
  configureServer(server) {
    if (!shotsDir) return;
    server.middlewares.use((request, response, next) => {
      // the picture itself, not Vite's import of it (`?import`), which a raw
      // <img> in a page turns into
      const match = /\/screenshots\/([a-z0-9-]+\.(png|gif))$/.exec(
        request.url ?? "",
      );
      const file = match && resolve(shotsDir, match[1]);
      if (!file || !existsSync(file)) return next();
      response.setHeader("Content-Type", `image/${match[2]}`);
      response.setHeader("Cache-Control", "no-store");
      createReadStream(file).pipe(response);
    });
  },
};

export default defineConfigWithTheme<
  DefaultTheme.Config & { blank: BlankThemeConfig }
>({
  base,
  vite: { plugins: [missingShots, localShots] },
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
          "^/guide/(writing|tables|blocks|files|pages|settings|autocorrect|spelling|themes|configuration|faq)",
      },
      { text: "Shortcuts", link: "/guide/shortcuts" },
    ],
    sidebar: [
      {
        text: "Getting started",
        items: [
          { text: "Install", link: "/guide/install" },
          { text: "Writing in Blank", link: "/guide/writing" },
          { text: "Tables", link: "/guide/tables" },
          { text: "Blocks", link: "/guide/blocks" },
          { text: "Files & formats", link: "/guide/files" },
          { text: "Pages", link: "/guide/pages" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Settings", link: "/guide/settings" },
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

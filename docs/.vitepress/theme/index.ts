import { h } from "vue";
import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";

import ChannelBanner from "./ChannelBanner.vue";
import DemoWindow from "./DemoWindow.vue";
import DownloadButtons from "./DownloadButtons.vue";
import HomeProse from "./HomeProse.vue";
import VersionSwitcher from "./VersionSwitcher.vue";
import "./style.css";

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      "layout-top": () => h(ChannelBanner),
      "home-hero-after": () => h(DemoWindow),
      "home-features-before": () => h(HomeProse),
      "nav-bar-content-after": () => h(VersionSwitcher),
      "nav-screen-content-after": () => h(VersionSwitcher, { screen: true }),
    }),
  enhanceApp({ app }) {
    app.component("DownloadButtons", DownloadButtons);
  },
} satisfies Theme;

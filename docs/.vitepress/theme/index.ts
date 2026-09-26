import { h } from "vue";
import DefaultTheme from "vitepress/theme";
import type { Theme } from "vitepress";

import ChannelBanner from "./ChannelBanner.vue";
import DownloadButtons from "./DownloadButtons.vue";
import VersionSwitcher from "./VersionSwitcher.vue";
import "./style.css";

export default {
  extends: DefaultTheme,
  Layout: () =>
    h(DefaultTheme.Layout, null, {
      "layout-top": () => h(ChannelBanner),
      "nav-bar-content-after": () => h(VersionSwitcher),
      "nav-screen-content-after": () => h(VersionSwitcher, { screen: true }),
    }),
  enhanceApp({ app }) {
    app.component("DownloadButtons", DownloadButtons);
  },
} satisfies Theme;

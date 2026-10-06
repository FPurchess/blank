<script setup lang="ts">
import { withBase } from "vitepress";

import Shot from "./Shot.vue";

// The home page's tour: a row per feature, its text beside a recording of it
// that starts as it scrolls into view (see Shot.vue). The claims follow what
// Blank does today, and each row links to its guide page.
const rows = [
  {
    title: "Real pages, as they print",
    text: "Blank lays out your text the way the PDF prints it: every line and every page ends on the screen where it ends on paper. Headers, footers and page numbers are in place on every sheet.",
    link: "/guide/pages",
    linkText: "Your pages",
    shot: "page-views.gif",
    alt: "Mod Alt V switches from Page ends, one column with a dashed line where each page ends, to Pages, the sheets on a desk with their headers and page numbers, and back",
  },
  {
    title: "Formatting as you type",
    text: "Type # for a heading, **…** for bold or - for a list, and Blank formats as you go, with typographic quotes and dashes in the language you write in. Every format also has a button in the toolbar, and every command a shortcut.",
    link: "/guide/writing",
    linkText: "Writing in Blank",
    shot: "writing.gif",
    alt: "Typing # and a title makes a heading; quotes curl and two hyphens become a dash; **slow** turns bold and *quiet* italic; a hyphen starts a list and > a quote, while the toolbar shows the style at the cursor",
  },
  {
    title: "Tables you can build from the keyboard",
    text: "Mod T, the arrow keys and Enter make a table, and Tab goes from cell to cell. Paste cells from a spreadsheet, and drag rows and columns with the mouse.",
    link: "/guide/tables",
    linkText: "Tables",
    shot: "table-insert.gif",
    alt: "Mod T opens a grid, the arrow keys make it four columns wide, Enter inserts the table, Tab fills it cell by cell and the arrow key leads out of it",
  },
  {
    title: "Only the page, when you want it",
    text: "Turn on focus mode, with the last button in the status bar or Mod Shift F, and the tabs, the toolbar, the panes and the status bar fade as you type. Move the mouse and they're back.",
    link: "/guide/writing#focus-mode",
    linkText: "Focus mode",
    shot: "focus-mode.gif",
    alt: "Mod Shift F turns on focus mode; as the typing starts, the tabs, the toolbar and the status bar fade out and only the page stays; a move of the mouse brings them back",
  },
  {
    title: "A table of contents that keeps up",
    text: "Insert one from the Blocks pane: it lists your headings with their pages, and follows every heading you add, rename or move.",
    link: "/guide/blocks#toc",
    linkText: "Blocks",
    shot: "toc.gif",
    alt: "Mod Alt B and Enter insert a table of contents, which lists the headings with their pages and follows a heading as it is renamed",
  },
];
</script>

<template>
  <section class="home-showcase">
    <div
      v-for="(row, index) in rows"
      :key="row.shot"
      class="row"
      :class="{ flip: index % 2 === 1 }"
    >
      <div class="text">
        <h2>{{ row.title }}</h2>
        <p>{{ row.text }}</p>
        <a :href="withBase(row.link)">{{ row.linkText }} →</a>
      </div>
      <div class="picture">
        <Shot :src="row.shot" :alt="row.alt" />
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-showcase {
  max-width: 1152px;
  margin: 0 auto;
  padding: 0 24px 24px;
}
.row {
  display: grid;
  gap: 24px;
  align-items: center;
  padding: 40px 0;
}
.text h2 {
  margin: 0;
  border: none;
  padding: 0;
  font-size: 26px;
  line-height: 1.3;
  font-weight: 600;
  letter-spacing: -0.01em;
  text-wrap: balance;
}
.text p {
  margin: 12px 0 0;
  font-size: 17px;
  line-height: 1.7;
  color: var(--vp-c-text-2);
}
.text a {
  display: inline-block;
  margin-top: 12px;
  font-weight: 500;
  color: var(--vp-c-brand-1);
}
@media (min-width: 960px) {
  .row {
    grid-template-columns: 2fr 3fr;
    gap: 56px;
  }
  .row.flip {
    grid-template-columns: 3fr 2fr;
  }
  .row.flip .text {
    order: 2;
  }
}
</style>

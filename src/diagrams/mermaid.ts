import type { Mermaid } from "mermaid";

import { diagramModule } from "../engine/diagramModule";

// Mermaid, loaded the first time a diagram is drawn, so documents without
// one never load it. It runs in the webview, as it needs the DOM to measure
// text, with Blank's settings: the classic layout and look that GitHub and
// Obsidian draw diagrams in, labels as SVG text (no HTML in a
// foreignObject, which the PDF and Word can't hold), nothing clickable, and
// Blank's font. Its colours become the page's ink later (./recolor.ts), so
// its palette is greys, which keep how strong each part is.

// the palette: pale fills, dark lines and text
const PALETTE = {
  primaryColor: "#e8e8e8",
  primaryTextColor: "#101010",
  primaryBorderColor: "#202020",
  lineColor: "#202020",
  secondaryColor: "#ececec",
  tertiaryColor: "#f0f0f0",
  background: "#ffffff",
  textColor: "#101010",
  fontFamily: "IBM Plex Sans",
};

export const MERMAID_CONFIG = {
  startOnLoad: false,
  securityLevel: "strict",
  htmlLabels: false,
  layout: "dagre",
  look: "classic",
  theme: "base",
  themeVariables: PALETTE,
  fontFamily: "IBM Plex Sans",
  deterministicIds: true,
  deterministicIDSeed: "blank",
} as const;

let loading: Promise<Mermaid> | null = null;

/**
 * loadMermaid loads Mermaid once, with the fonts it measures text in
 */
export const loadMermaid = (): Promise<Mermaid> => {
  loading ??= (async () => {
    // the module that draws what Mermaid makes loads meanwhile, rather
    // than after the first diagram is rendered; a failure is its own to
    // log, and leaves the diagrams pictures
    diagramModule().catch(() => {});
    await import("./polyfills");
    const { default: mermaid } = await import("mermaid");
    mermaid.initialize({ ...MERMAID_CONFIG });
    // the text is measured in the webview's fonts, so they must be there
    await Promise.all([
      document.fonts.load('16px "IBM Plex Sans"'),
      document.fonts.load('500 16px "IBM Plex Sans"'),
    ]).catch(() => undefined);
    return mermaid;
  })();
  // a failed load may work later, e.g. once the network is back for a
  // chunk the webview evicted
  loading.catch(() => (loading = null));
  return loading;
};

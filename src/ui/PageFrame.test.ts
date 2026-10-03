import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { type PageEngine, setPageEngine } from "../engine/engine";
import { documentFields } from "../layout/bands";
import {
  engineMissing,
  pageLayoutState,
  pageSelection,
  pageView,
  theme,
} from "../state";
import { createState, createTestHandle, doc, h, p } from "../test/editor";
import { testEngine } from "../test/engine";
import { flushPromises } from "../test/async";
import { testLayout } from "../test/layout";
import { bootApp } from "./mount";
import { pageBitmaps, paintQueue } from "./pageBitmaps";
import { frameRenders } from "./pageLayers";
import { painter, type Painter, setPainter } from "./painter";

// The pages paint through the painter, and only it knows how: a painter that
// records what it is asked shows what the page view paints, keeps and shows
// again.

const LONG =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

const node = doc(h(1, "Title"), ...Array.from({ length: 300 }, () => p(LONG)));

const view = () => document.getElementById("page-view")!;
const pageOf = (canvas: HTMLCanvasElement) =>
  Number(canvas.closest<HTMLElement>(".page-frame")!.dataset.page);

const layerOf = (canvas: HTMLCanvasElement) =>
  canvas.classList.contains("page-bands")
    ? "bands"
    : canvas.classList.contains("page-selected")
      ? "selected"
      : "body";

// a painter that records the pages it paints and shows: the pages of the
// text, and the layers as "page:layer"
const recorder = () => {
  const painted: number[] = [];
  const layers: string[] = [];
  const shown: number[] = [];
  const released: string[] = [];
  const fake: Painter = {
    snapshots: true,
    surface: (canvas) => ({ canvas }),
    paint: (surface) => {
      const layer = layerOf(surface.canvas);
      layers.push(`${pageOf(surface.canvas)}:${layer}`);
      if (layer === "body") painted.push(pageOf(surface.canvas));
    },
    clear: () => {},
    snapshot: async (surface) => ({
      width: surface.canvas.width,
      height: surface.canvas.height,
    }),
    show: (surface) => shown.push(pageOf(surface.canvas)),
    release: (surface) => released.push(layerOf(surface.canvas)),
  };
  return { fake, painted, layers, shown, released };
};

// what the editor's plugin publishes once the engine laid out `laidOut`
const publish = (engine: PageEngine) => {
  pageLayoutState.value = {
    width: 595.28,
    height: 841.89,
    margins: { top: 70.87, right: 70.87, bottom: 70.87, left: 70.87 },
    pages: engine.pages(),
    bodyVersions: engine.raw.bodyVersions(),
    bandVersions: engine.raw.bandVersions(),
    bottoms: engine.raw.bottoms(),
  };
};

const layOut = (settings = testLayout(), laidOut = node) => {
  const engine = testEngine();
  engine.setSettings(settings, documentFields(laidOut));
  engine.sync(laidOut, () => undefined);
  setPageEngine(engine);
  publish(engine);
  return engine;
};

// scrolls the view and lets it measure, in the next frame
const scrollTo = async (top: number) => {
  view().scrollTop = top;
  view().dispatchEvent(new Event("scroll"));
  vi.advanceTimersToNextFrame();
  await nextTick();
};

// paints what is queued: the pages in view in the next frame, the rest
// after it
const paintQueued = async () => {
  await nextTick();
  vi.advanceTimersToNextFrame();
  vi.runOnlyPendingTimers();
  await nextTick();
};

describe("the pages and the painter", () => {
  const original = painter;
  let dispose = () => {};

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "setTimeout"] });
    document.body.innerHTML = '<div id="ui-bottom"></div>';
    pageBitmaps.clear();
  });

  afterEach(() => {
    dispose();
    setPainter(original);
    setPageEngine(null);
    pageLayoutState.value = null;
    pageView.value = "page-ends";
    pageSelection.value = [];
    pageBitmaps.clear();
    document.body.replaceChildren();
    // what the queue still waits for runs on the fake timers, or it would
    // stay scheduled for the next test
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("paints each page once, in the next frame", async () => {
    const { fake, painted } = recorder();
    setPainter(fake);
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await nextTick();
    // not inside the render
    expect(painted).toEqual([]);
    await paintQueued();
    const pages = [...view().querySelectorAll<HTMLElement>(".page-frame")].map(
      (frame) => Number(frame.dataset.page),
    );
    expect(pages.length).toBeGreaterThan(1);
    expect([...painted].sort((a, b) => a - b)).toEqual(pages);
  });

  it("paints again only the page that changed", async () => {
    const { fake, painted } = recorder();
    setPainter(fake);
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await paintQueued();
    painted.length = 0;
    const state = pageLayoutState.value!;
    const bodyVersions = state.bodyVersions!.slice();
    bodyVersions[1] += 1;
    pageLayoutState.value = { ...state, bodyVersions };
    await paintQueued();
    expect(painted).toEqual([2]);
  });

  it("paints only the first page when its text is typed into", async () => {
    const { fake, layers } = recorder();
    setPainter(fake);
    // on the sheets, which paint their headers and footers too
    pageView.value = "pages";
    const engine = layOut(
      testLayout({
        footer: { left: "", center: "{page} of {pages}", right: "" },
      }),
    );
    expect(engine.pages()).toBeGreaterThan(10);
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await paintQueued();
    layers.length = 0;
    // "Title" becomes "Tiqtle", within the heading on the first page
    const typed = createState(node, { cursor: 3 });
    engine.sync(typed.apply(typed.tr.insertText("q", 3)).doc, () => undefined);
    publish(engine);
    const renders = frameRenders.count;
    await paintQueued();
    expect(layers).toEqual(["1:body"]);
    // and only its frame rendered again
    expect(frameRenders.count - renders).toBe(1);
  });

  it("paints only the headers and footers of the others when a page is added", async () => {
    const { fake, layers } = recorder();
    setPainter(fake);
    pageView.value = "pages";
    const engine = layOut(
      testLayout({
        footer: { left: "", center: "{page} of {pages}", right: "" },
      }),
    );
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await paintQueued();
    const pages = engine.pages();
    layers.length = 0;
    // enough at the end for another page, added as typing adds it, so the
    // pages before keep their text
    const state = createState(node);
    const longer = state.apply(
      state.tr.insert(
        node.content.size,
        Array.from({ length: 30 }, () => p(LONG)),
      ),
    ).doc;
    engine.sync(longer, () => undefined);
    publish(engine);
    expect(engine.pages()).toBe(pages + 1);
    await paintQueued();
    // every page shown paints its header and footer again, once each, for
    // {pages}, and none its text
    const sheets = [...view().querySelectorAll<HTMLElement>(".page-frame")]
      .map((frame) => frame.dataset.page)
      .filter((page) => Number(page) <= pages);
    const bands = layers.filter((layer) => layer.endsWith(":bands"));
    for (const page of sheets)
      expect(bands.filter((layer) => layer === `${page}:bands`)).toHaveLength(
        2,
      );
    expect(layers.filter((layer) => layer.endsWith(":body"))).toEqual([]);
  });

  it("shows a page that comes back into view from what it kept", async () => {
    const { fake, painted, shown } = recorder();
    setPainter(fake);
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await paintQueued();
    expect(painted).toContain(1);
    // far enough that the first page goes
    // jsdom lays nothing out, so the desk's height is only in its style
    const desk = view().querySelector<HTMLElement>(".page-desk")!;
    await scrollTo(parseFloat(desk.style.height));
    await flushPromises();
    expect(view().querySelector('.page-frame[data-page="1"]')).toBeNull();
    painted.length = 0;
    await scrollTo(0);
    await paintQueued();
    expect(shown).toContain(1);
    expect(painted).not.toContain(1);
  });

  it("paints every page again in another theme, once each", async () => {
    const { fake, painted } = recorder();
    setPainter(fake);
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await paintQueued();
    const pages = [...painted].sort((a, b) => a - b);
    painted.length = 0;
    theme.value = "dark";
    try {
      await paintQueued();
      expect([...painted].sort((a, b) => a - b)).toEqual(pages);
    } finally {
      theme.value = "light";
      // the queue runs what that asked for, before the timers are real again
      await paintQueued();
    }
  });

  it("frees the canvas of the headers and footers when page ends drops it", async () => {
    const { fake, layers, released } = recorder();
    setPainter(fake);
    pageView.value = "pages";
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await paintQueued();
    const sheets = view().querySelectorAll(".page-frame").length;
    expect(released).toEqual([]);
    pageView.value = "page-ends";
    await paintQueued();
    // each sheet's header and footer strips, and only those
    expect(released.filter((layer) => layer === "bands")).toHaveLength(
      2 * sheets,
    );
    expect(released).not.toContain("body");
    layers.length = 0;
    // back on the sheets, the new canvases are painted
    pageView.value = "pages";
    await paintQueued();
    expect(layers.filter((layer) => layer.endsWith(":bands")).length).toBe(
      2 * view().querySelectorAll(".page-frame").length,
    );
  });

  it("frees a page's canvases once it leaves the view", async () => {
    const { fake, released } = recorder();
    setPainter(fake);
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await paintQueued();
    const desk = view().querySelector<HTMLElement>(".page-desk")!;
    await scrollTo(parseFloat(desk.style.height));
    await flushPromises();
    // after the copy of what it showed was taken
    expect(released).toContain("body");
  });

  // 7 before the headers and footers were strips, each page with a second
  // bitmap as large as the sheet; 14 since
  it("paints the header and footer in strips as high as the margins", async () => {
    const origins = new Map<HTMLCanvasElement, number>();
    const { fake } = recorder();
    setPainter({
      ...fake,
      paint: (surface, display, options) => {
        origins.set(surface.canvas, options.y);
        fake.paint(surface, display, options);
      },
    });
    pageView.value = "pages";
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await paintQueued();
    const frame = view().querySelector<HTMLElement>(".page-frame")!;
    const scale = parseFloat(frame.style.width) / 595.28;
    const margin = 70.87 * scale;
    const header =
      frame.querySelector<HTMLCanvasElement>(".page-bands.header")!;
    const footer =
      frame.querySelector<HTMLCanvasElement>(".page-bands.footer")!;
    // as high as the margins, not the sheet
    expect(Math.abs(header.height - margin)).toBeLessThanOrEqual(1);
    expect(Math.abs(footer.height - margin)).toBeLessThanOrEqual(1);
    // the footer's strip lies at the bottom of the sheet, and paints the
    // page from the point at its top
    const top = parseFloat(footer.style.top);
    expect(
      Math.abs(top + margin - parseFloat(frame.style.height)),
    ).toBeLessThanOrEqual(1);
    expect(origins.get(header)).toBe(0);
    // within half a point: the frame width it was measured from is rounded
    expect(origins.get(footer)).toBeCloseTo(top / scale, 0);
  });

  it("paints the selected text over the selection on its page only", async () => {
    const { fake, layers } = recorder();
    const within: unknown[] = [];
    setPainter({
      ...fake,
      paint: (surface, display, options) => {
        if (surface.canvas.classList.contains("page-selected"))
          within.push(options.within);
        fake.paint(surface, display, options);
      },
    });
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await paintQueued();
    layers.length = 0;
    expect(view().querySelector(".page-selected")).toBeNull();
    // a word selected on the second page (the test view counts as focused)
    pageSelection.value = [{ page: 1, x: 80, y: 90, width: 50, height: 16 }];
    await paintQueued();
    const selected = view().querySelectorAll(".page-selected");
    expect(selected).toHaveLength(1);
    expect(selected[0].closest<HTMLElement>(".page-frame")!.dataset.page).toBe(
      "2",
    );
    expect(within).toEqual([[{ x: 80, y: 90, width: 50, height: 16 }]]);
    // the text itself isn't painted again for it
    expect(layers).toEqual(["2:selected"]);
    // and gone with the selection
    pageSelection.value = [];
    await paintQueued();
    expect(view().querySelector(".page-selected")).toBeNull();
  });

  it("keeps a dozen sheets or more at 2×", async () => {
    const { fake } = recorder();
    setPainter(fake);
    const ratio = window.devicePixelRatio;
    window.devicePixelRatio = 2;
    try {
      pageView.value = "pages";
      layOut();
      dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
      await paintQueued();
      // down the desk, a view at a time, so every sheet comes and goes
      const desk = view().querySelector<HTMLElement>(".page-desk")!;
      for (let top = 0; top < parseFloat(desk.style.height); top += 600) {
        await scrollTo(top);
        await paintQueued();
        await flushPromises();
      }
      const pages = new Set(
        [...pageBitmaps.keys()].map((key) => key.split("|")[2]),
      );
      expect(pages.size).toBeGreaterThanOrEqual(12);
    } finally {
      window.devicePixelRatio = ratio;
    }
  });

  it("forgets the kept pages once the engine is missing", async () => {
    const { fake } = recorder();
    setPainter(fake);
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await paintQueued();
    const desk = view().querySelector<HTMLElement>(".page-desk")!;
    await scrollTo(parseFloat(desk.style.height));
    await flushPromises();
    expect(pageBitmaps.size).toBeGreaterThan(0);
    try {
      engineMissing.value = true;
      await nextTick();
      expect(pageBitmaps.size).toBe(0);
    } finally {
      engineMissing.value = false;
    }
  });

  it("drops a paint asked for by a change undone before it ran", async () => {
    const { fake, painted } = recorder();
    setPainter(fake);
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await paintQueued();
    painted.length = 0;
    try {
      // dark and back within one frame: the pages show light already
      theme.value = "dark";
      await nextTick();
      theme.value = "light";
      await nextTick();
      expect(paintQueue.pending).toBe(0);
      await paintQueued();
      expect(painted).toEqual([]);
    } finally {
      theme.value = "light";
    }
  });

  it("paints again when the pages are shown at another size", async () => {
    const { fake, painted } = recorder();
    setPainter(fake);
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await paintQueued();
    painted.length = 0;
    pageView.value = "pages";
    await paintQueued();
    expect(painted).toContain(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { type PageEngine, setPageEngine } from "../engine/engine";
import { documentFields } from "../layout/bands";
import { pageLayoutState, pageView } from "../state";
import { createState, createTestHandle, doc, h, p } from "../test/editor";
import { testEngine } from "../test/engine";
import { flushPromises } from "../test/async";
import { testLayout } from "../test/layout";
import { bootApp } from "./mount";
import { pageBitmaps } from "./pageBitmaps";
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
  canvas.classList.contains("page-bands") ? "bands" : "body";

// a painter that records the pages it paints and shows: the pages of the
// text, and the layers as "page:layer"
const recorder = () => {
  const painted: number[] = [];
  const layers: string[] = [];
  const shown: number[] = [];
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
  };
  return { fake, painted, layers, shown };
};

// what the editor's plugin publishes once the engine laid out `laidOut`
const publish = (engine: PageEngine) => {
  pageLayoutState.value = {
    width: 595.28,
    height: 841.89,
    margins: { top: 70.87, right: 70.87, bottom: 70.87, left: 70.87 },
    pages: engine.pages(),
    versions: engine.raw.versions(),
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
    pageBitmaps.clear();
    document.body.replaceChildren();
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
    // "Title" becomes "Titles", then "Titless"; the first edit after the
    // first layout still gives every page a new version (reported to the
    // engine), the second is what typing does
    let typed = createState(node, { cursor: 7 });
    for (const step of [0, 1]) {
      if (step === 1) {
        await paintQueued();
        layers.length = 0;
      }
      typed = typed.apply(typed.tr.insertText("s", 7 + step));
      engine.sync(typed.doc, () => undefined);
      publish(engine);
    }
    const renders = frameRenders.count;
    await paintQueued();
    expect(layers).toEqual(["1:body"]);
    // and only its frame rendered again
    expect(frameRenders.count - renders).toBeLessThanOrEqual(1);
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
    // the pages in view: page 1 and those after it, near the top
    expect(layers).toContain("1:bands");
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

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { setPageEngine } from "../engine/engine";
import { documentFields } from "../layout/bands";
import { pageLayoutState, pageView } from "../state";
import { createState, createTestHandle, doc, h, p } from "../test/editor";
import { testEngine } from "../test/engine";
import { flushPromises } from "../test/async";
import { testLayout } from "../test/layout";
import { bootApp } from "./mount";
import { pageBitmaps } from "./pageBitmaps";
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

// a painter that records the pages it paints and shows
const recorder = () => {
  const painted: number[] = [];
  const shown: number[] = [];
  const fake: Painter = {
    snapshots: true,
    surface: (canvas) => ({ canvas }),
    paint: (surface) => painted.push(pageOf(surface.canvas)),
    clear: () => {},
    snapshot: async (surface) => ({
      width: surface.canvas.width,
      height: surface.canvas.height,
    }),
    show: (surface) => shown.push(pageOf(surface.canvas)),
  };
  return { fake, painted, shown };
};

const layOut = () => {
  const engine = testEngine();
  engine.setSettings(testLayout(), documentFields(node));
  engine.sync(node, () => undefined);
  setPageEngine(engine);
  pageLayoutState.value = {
    width: 595.28,
    height: 841.89,
    margins: { top: 70.87, right: 70.87, bottom: 70.87, left: 70.87 },
    pages: engine.pages(),
    versions: engine.raw.versions(),
    bottoms: engine.raw.bottoms(),
  };
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
    const versions = state.versions.slice();
    versions[1] += 1;
    pageLayoutState.value = { ...state, versions };
    await paintQueued();
    expect(painted).toEqual([2]);
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

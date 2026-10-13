import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, shallowRef } from "vue";

import {
  anchorTop,
  type FrameLayout,
  sheetLayout,
  viewAnchor,
  type ViewAnchor,
} from "../../engine/frames";
import { tabSwitch, zoomAnchor } from "../../state";
import { type DeskScrollOptions, useDeskScroll } from "./useDeskScroll";

const a4 = { width: 595, height: 842 };
const sheets = (count: number, width = 800) =>
  sheetLayout(Array(count).fill(a4), width);

describe("useDeskScroll", () => {
  let unmount = () => {};
  afterEach(() => {
    unmount();
    tabSwitch.value = null;
  });

  // a view of `first` with the options given, and what it scrolls
  const mount = (
    first: FrameLayout | null,
    options: Partial<DeskScrollOptions> = {},
  ) => {
    const layout = shallowRef(first);
    const scrollTop = shallowRef(0);
    const element = document.createElement("div");
    const App = defineComponent(() => {
      useDeskScroll({
        scroller: () => element,
        layout,
        scrollTop,
        viewHeight: shallowRef(600),
        measure: () => (scrollTop.value = element.scrollTop),
        ...options,
      });
      return () => h("div");
    });
    const app = createApp(App);
    app.mount(document.createElement("div"));
    unmount = () => app.unmount();
    return { layout, element };
  };

  const spot = (layout: FrameLayout, anchor: ViewAnchor) =>
    anchorTop(layout, anchor)!;

  it("starts at the tab's spot, and goes back to a tab's once its page is laid out", async () => {
    const start = { page: 2, y: 100 };
    const { layout, element } = mount(null, { startAt: () => start });
    layout.value = sheets(5);
    await nextTick();
    await nextTick();
    expect(element.scrollTop).toBeCloseTo(spot(layout.value, start), 0);

    // a switch to a tab on its fourth page, whose layout comes in chunks
    let laying = true;
    unmount();
    const next = mount(sheets(5), { laying: () => laying });
    next.element.scrollTop = 500;
    tabSwitch.value = { id: "b", anchor: { page: 3, y: 50 } };
    next.layout.value = sheets(2);
    await nextTick();
    await nextTick();
    // the page isn't there yet: the view waits for it
    expect(next.element.scrollTop).toBe(500);
    laying = false;
    next.layout.value = sheets(6);
    await nextTick();
    await nextTick();
    expect(next.element.scrollTop).toBeCloseTo(
      spot(next.layout.value, { page: 3, y: 50 }),
      0,
    );
  });

  it("keeps the spot at the top on every new layout, unless `moves` says the pages stay", async () => {
    const { layout, element } = mount(sheets(5));
    element.scrollTop = layout.value!.frames[2].top + 30;
    const before = viewAnchor(layout.value!, element.scrollTop)!;
    layout.value = sheets(5, 500);
    await nextTick();
    await nextTick();
    expect(viewAnchor(layout.value, element.scrollTop)).toMatchObject({
      page: 2,
      y: expect.closeTo(before.y, 0),
    });

    unmount();
    const still = mount(sheets(5), { moves: () => false });
    still.element.scrollTop = 1234;
    still.layout.value = sheets(5, 500);
    await nextTick();
    await nextTick();
    expect(still.element.scrollTop).toBe(1234);
  });

  it("keeps the spot a zoom asked for where it was in the view, across too", async () => {
    const { layout, element } = mount(sheets(3), { moves: () => false });
    zoomAnchor.value = { page: 1, x: 300, y: 400, viewX: 100, viewY: 200 };
    layout.value = sheetLayout(Array(3).fill(a4), 800, 2);
    await nextTick();
    await nextTick();
    const page = layout.value.frames[1];
    const scale = layout.value.scale;
    expect(element.scrollTop).toBeCloseTo(page.top + 400 * scale - 200, 0);
    expect(element.scrollLeft).toBeCloseTo(page.left + 300 * scale - 100, 0);
  });
});

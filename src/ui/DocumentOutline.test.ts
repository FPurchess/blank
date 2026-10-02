import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import {
  scrollState,
  scrollTops,
  scrollToText,
  scrollViewBy,
} from "../engine/geometry";
import {
  headings,
  outlinePeek,
  outlinePinned,
  pageView,
  pageViewport,
  publishHeadings,
} from "../state";
import { createState, createTestHandle, doc, h, p } from "../test/editor";
import { bootApp } from "./mount";
import { OUTLINE_DOCK } from "./outlineModel";
import { READING_LINE } from "./readingLine";

// what the outline measures and scrolls with, which needs laid out pages
vi.mock("../engine/geometry", async (original) => {
  const module = await original<typeof import("../engine/geometry")>();
  return {
    ...module,
    scrollTops: vi.fn((positions: readonly number[]) =>
      positions.map(() => null),
    ),
    scrollState: vi.fn(() => null),
    scrollToText: vi.fn(),
    scrollViewBy: vi.fn(),
  };
});

const text = doc(h(1, "One"), p("text"), h(2, "Two"), h(3, "Three"));

let dispose = () => {};
let handle = createTestHandle();

const mount = async (width = 800, node = text) => {
  window.innerWidth = width;
  publishHeadings(node);
  handle = createTestHandle(createState(node));
  dispose = bootApp(handle);
  await nextTick();
};

const outline = () => document.querySelector<HTMLElement>("#outline");
const dashes = () => document.querySelector<HTMLElement>(".outline-dashes");
const list = () => document.querySelector<HTMLElement>(".outline-list");
const entries = () => [
  ...document.querySelectorAll<HTMLElement>(".outline-entry"),
];
const resize = async (width: number) => {
  window.innerWidth = width;
  window.dispatchEvent(new Event("resize"));
  await nextTick();
};

beforeEach(() => {
  document.body.innerHTML = "";
});

afterEach(() => {
  dispose();
  dispose = () => {};
  vi.useRealTimers();
  headings.value = [];
  outlinePinned.value = false;
  outlinePeek.value = null;
  pageView.value = "page-ends";
  pageViewport.value = null;
  // jsdom's
  window.innerWidth = 1024;
});

describe("the outline", () => {
  it("shows nothing with fewer than two headings", async () => {
    await mount(1200, doc(h(1, "One"), h(2), p("text")));
    expect(outline()).toBeNull();
    outlinePinned.value = true;
    await nextTick();
    expect(outline()).toBeNull();
    expect(document.body.classList.contains("outline-docked")).toBe(false);
  });

  it("shows a dash for each heading, as long as its level is high", async () => {
    await mount();
    const shown = [...document.querySelectorAll(".outline-dash")];
    expect(shown.map((dash) => dash.className)).toEqual([
      "outline-dash level-1 current",
      "outline-dash level-2",
      "outline-dash level-3",
    ]);
    expect(dashes()?.title).toBe("Outline (Ctrl+Alt+O)");
    expect(list()).toBeNull();
  });

  it("peeks while the pointer is over the dashes or the list", async () => {
    await mount();
    vi.useFakeTimers();
    dashes()!.dispatchEvent(new MouseEvent("mouseenter"));
    await nextTick();
    expect(list()?.classList.contains("peek")).toBe(true);
    expect(entries().map((entry) => entry.textContent?.trim())).toEqual([
      "One",
      "Two",
      "Three",
    ]);
    // only a click opens it with a button to close it
    expect(document.querySelector(".outline-collapse")).toBeNull();

    // on the way from the dashes to the list
    dashes()!.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(100);
    list()!.dispatchEvent(new MouseEvent("mouseenter"));
    vi.advanceTimersByTime(500);
    await nextTick();
    expect(list()).not.toBeNull();

    list()!.dispatchEvent(new MouseEvent("mouseleave"));
    vi.advanceTimersByTime(200);
    await nextTick();
    expect(list()).toBeNull();
  });

  it("indents the headings by their level", async () => {
    await mount();
    outlinePeek.value = "hover";
    await nextTick();
    expect(entries().map((entry) => entry.className)).toEqual([
      "outline-entry level-1 current",
      "outline-entry level-2",
      "outline-entry level-3",
    ]);
  });

  it("stays open beside the pages after a click on a wide window", async () => {
    await mount(1200);
    dashes()!.click();
    await nextTick();
    expect(outlinePinned.value).toBe(true);
    expect(dashes()).toBeNull();
    expect(list()?.classList.contains("peek")).toBe(false);
    // nothing is laid out, so there's no room beside the pages
    expect(outline()?.className).toBe("docked");
    expect(document.body.classList.contains("outline-docked")).toBe(true);

    // the pointer over the open list opens no peek, which would stay
    list()!.dispatchEvent(new MouseEvent("mouseenter"));
    document.querySelector<HTMLElement>(".outline-collapse")!.click();
    await nextTick();
    expect(outlinePinned.value).toBe(false);
    expect(outlinePeek.value).toBeNull();
    expect(list()).toBeNull();
    expect(dashes()).not.toBeNull();
    expect(document.body.classList.contains("outline-docked")).toBe(false);
  });

  it("floats over the pages after a click on a narrow window", async () => {
    await mount(800);
    dashes()!.click();
    await nextTick();
    expect(outlinePinned.value).toBe(false);
    expect(outlinePeek.value).toBe("sticky");
    expect(list()?.classList.contains("peek")).toBe(true);
    expect(document.querySelector(".outline-collapse")).not.toBeNull();

    // a click elsewhere closes it, one in it doesn't
    list()!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(outlinePeek.value).toBe("sticky");
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    expect(outlinePeek.value).toBeNull();
  });

  it("closes the floating list when the window grows wide enough", async () => {
    await mount(800);
    dashes()!.click();
    await resize(1200);
    expect(outlinePeek.value).toBeNull();
  });

  it("shows the dashes on a narrow window even when kept open", async () => {
    outlinePinned.value = true;
    await mount(800);
    expect(dashes()).not.toBeNull();
    await resize(1200);
    expect(dashes()).toBeNull();
    expect(list()).not.toBeNull();
  });

  it("scrolls to a heading, and leaves the cursor where it was", async () => {
    await mount(800);
    dashes()!.click();
    await nextTick();
    const selection = handle.state.value.selection;
    entries()[1].click();
    // the second heading, "Two", after "One" (5) and "text" (6)
    expect(scrollToText).toHaveBeenCalledWith(12, READING_LINE);
    expect(handle.state.value.selection).toBe(selection);
    // the list a click opened closes after the jump
    expect(outlinePeek.value).toBeNull();
  });

  it("keeps the list the pointer opened after a jump", async () => {
    await mount(800);
    outlinePeek.value = "hover";
    await nextTick();
    entries()[0].click();
    expect(scrollToText).toHaveBeenCalledWith(1, READING_LINE);
    expect(outlinePeek.value).toBe("hover");
  });

  it("marks the heading of the section in view", async () => {
    vi.mocked(scrollTops).mockReturnValue([100, 800, 1600]);
    vi.mocked(scrollState).mockReturnValue({ top: 0, height: 600, max: 3000 });
    pageViewport.value = {
      left: 0,
      top: 0,
      width: 800,
      height: 600,
      scrollTop: 0,
    };
    await mount(800);
    outlinePeek.value = "hover";
    await nextTick();
    const current = () =>
      entries().findIndex((entry) => entry.classList.contains("current"));
    expect(current()).toBe(0);
    expect(entries()[0].getAttribute("aria-current")).toBe("location");

    const measured = vi.mocked(scrollTops).mock.calls.length;
    vi.mocked(scrollState).mockReturnValue({
      top: 800,
      height: 600,
      max: 3000,
    });
    pageViewport.value = { ...pageViewport.value!, scrollTop: 800 };
    await nextTick();
    expect(current()).toBe(1);
    // a scroll measures no heading again
    expect(vi.mocked(scrollTops).mock.calls.length).toBe(measured);
  });

  it("keeps clear of the page view's scrollbar, docked or not", async () => {
    await mount(800);
    // after the page view, which measures jsdom's
    const viewport = { left: 0, top: 0, height: 600, scrollTop: 0 };
    pageViewport.value = { ...viewport, width: 785 };
    await nextTick();
    expect(outline()?.style.getPropertyValue("--scrollbar")).toBe("15px");
    outlinePinned.value = true;
    await resize(1200);
    // the docked view is narrower by the dock, not by a wider scrollbar
    pageViewport.value = { ...viewport, width: 1200 - OUTLINE_DOCK - 15 };
    await nextTick();
    expect(outline()?.className).toBe("docked");
    expect(outline()?.style.getPropertyValue("--scrollbar")).toBe("15px");
  });

  it("scrolls the pages with a wheel over the dashes", async () => {
    await mount();
    dashes()!.dispatchEvent(
      new WheelEvent("wheel", { deltaY: 3, deltaMode: 1 }),
    );
    expect(scrollViewBy).toHaveBeenCalledWith(48);
  });

  it("keeps the focus where it is", async () => {
    await mount();
    const press = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    dashes()!.dispatchEvent(press);
    expect(press.defaultPrevented).toBe(true);
  });

  it("lies on the desk's colour in Pages, and cleans up after itself", async () => {
    pageView.value = "pages";
    outlinePinned.value = true;
    await mount(1200);
    expect(document.body.classList.contains("outline-desk")).toBe(true);
    expect(document.body.classList.contains("outline-docked")).toBe(true);
    dispose();
    dispose = () => {};
    expect(document.body.classList.contains("outline-desk")).toBe(false);
    expect(document.body.classList.contains("outline-docked")).toBe(false);
  });
});

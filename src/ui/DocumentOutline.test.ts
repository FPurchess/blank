import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import {
  scrollState,
  scrollTops,
  scrollToHeading,
  scrollViewBy,
} from "../engine/geometry";
import {
  headings,
  outlinePeek,
  outlinePinned,
  pageView,
  pageViewport,
  publishHeadings,
  toggleOutline,
} from "../state";
import { createState, createTestHandle, doc, h, p } from "../test/editor";
import { bootApp } from "./mount";
import { OUTLINE_DOCK } from "./outlineModel";

// what the outline measures and scrolls with, which needs laid out pages
vi.mock("../engine/geometry", async (original) => {
  const module = await original<typeof import("../engine/geometry")>();
  return {
    ...module,
    scrollTops: vi.fn((positions: readonly number[]) =>
      positions.map(() => null),
    ),
    scrollState: vi.fn(() => null),
    scrollToHeading: vi.fn(),
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
// the pane's button that hides it, by its name
const hideButton = () =>
  document.querySelector<HTMLElement>('button[aria-label="Hide outline"]');
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
    expect(dashes()?.dataset.tip).toBe("Outline");
    expect(dashes()?.dataset.tipKey).toBe("Ctrl+Alt+O");
    expect(list()).toBeNull();
  });

  it("peeks while the pointer is over the dashes or the list", async () => {
    await mount();
    vi.useFakeTimers();
    dashes()!.dispatchEvent(new MouseEvent("mouseenter"));
    await nextTick();
    expect(list()?.className).toBe("outline-list peek");
    // the dashes say what they opened, so their tooltip keeps out of the way
    expect(dashes()?.getAttribute("aria-expanded")).toBe("true");
    // a glance has no title to name the outline by
    expect(outline()?.hasAttribute("aria-labelledby")).toBe(false);
    expect(entries().map((entry) => entry.textContent?.trim())).toEqual([
      "One",
      "Two",
      "Three",
    ]);
    // a glance, not a pane: no head with a button to close it
    expect(document.querySelector(".side-pane-head")).toBeNull();

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
    expect(list()?.className).toBe("outline-list open");
    // the pane is named by its title
    expect(outline()?.getAttribute("aria-labelledby")).toBe("outline-title");
    expect(document.querySelector("#outline-title")?.textContent).toBe(
      "Outline",
    );
    // nothing is laid out, so there's no room beside the pages
    expect(outline()?.className).toBe("docked");
    expect(document.body.classList.contains("outline-docked")).toBe(true);

    // the pointer over the open list opens no peek, which would stay
    list()!.dispatchEvent(new MouseEvent("mouseenter"));
    const collapse = hideButton()!;
    expect(collapse.getAttribute("aria-label")).toBe("Hide outline");
    expect(collapse.getAttribute("aria-keyshortcuts")).toBe("Control+Alt+O");
    expect(collapse.tabIndex).toBe(-1);
    collapse.click();
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
    // a side pane with a shadow, over the dashes, which it hides
    expect(list()?.className).toBe("outline-list floating");
    expect(hideButton()).not.toBeNull();
    expect(dashes()).toBeNull();

    // a click elsewhere closes it, one in it doesn't
    list()!.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    expect(outlinePeek.value).toBe("sticky");
    document.body.dispatchEvent(
      new PointerEvent("pointerdown", { bubbles: true }),
    );
    expect(outlinePeek.value).toBeNull();
  });

  it.each([
    ["its ×", () => hideButton()!.click()],
    ["the shortcut", () => toggleOutline(800)],
    [
      "a click elsewhere",
      () =>
        document.body.dispatchEvent(
          new PointerEvent("pointerdown", { bubbles: true }),
        ),
    ],
  ])(
    "brings the dashes back when %s closes the floating list",
    async (_, close) => {
      await mount(800);
      dashes()!.click();
      await nextTick();
      expect(dashes()).toBeNull();
      close();
      await nextTick();
      expect(list()).toBeNull();
      expect(dashes()).not.toBeNull();
    },
  );

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
    expect(scrollToHeading).toHaveBeenCalledWith(11);
    expect(handle.state.value.selection).toBe(selection);
    // the list a click opened closes after the jump
    expect(outlinePeek.value).toBeNull();
  });

  it("keeps the list the pointer opened after a jump", async () => {
    await mount(800);
    outlinePeek.value = "hover";
    await nextTick();
    entries()[0].click();
    expect(scrollToHeading).toHaveBeenCalledWith(0);
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

  it("keeps the current heading in sight, scrolling its entries, never the window", async () => {
    vi.mocked(scrollTops).mockReturnValue([100, 800, 1600]);
    vi.mocked(scrollState).mockReturnValue({ top: 0, height: 600, max: 3000 });
    outlinePinned.value = true;
    await mount(1200);
    // jsdom lays nothing out: three entries of 30 px in a body 50 px high
    const body = document.querySelector<HTMLElement>(".outline-entries")!;
    let scrolled = 0;
    Object.defineProperty(body, "clientHeight", { value: 50 });
    Object.defineProperty(body, "scrollTop", {
      get: () => scrolled,
      set: (value: number) => (scrolled = value),
    });
    entries().forEach((entry, index) => {
      Object.defineProperty(entry, "offsetTop", { value: index * 30 });
      Object.defineProperty(entry, "offsetHeight", { value: 30 });
    });
    const scrollTo = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
    const scrollBy = vi.spyOn(window, "scrollBy").mockImplementation(() => {});

    vi.mocked(scrollState).mockReturnValue({
      top: 1600,
      height: 600,
      max: 3000,
    });
    pageViewport.value = {
      left: 0,
      top: 0,
      width: 1200,
      height: 600,
      scrollTop: 1600,
    };
    await nextTick();
    await nextTick();
    // the third entry ends at 90 px: the body scrolls it into its 50 px
    expect(scrolled).toBe(40);
    expect(scrollTo).not.toHaveBeenCalled();
    expect(scrollBy).not.toHaveBeenCalled();
    expect(window.scrollY).toBe(0);
  });

  it("makes the dashes a button the keys never reach", async () => {
    await mount();
    expect(dashes()?.getAttribute("role")).toBe("button");
    expect(dashes()?.tabIndex).toBe(-1);
    expect(dashes()?.getAttribute("aria-label")).toBe("Outline");
    expect(dashes()?.getAttribute("aria-expanded")).toBe("false");
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

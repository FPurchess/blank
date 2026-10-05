import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, watch } from "vue";

import {
  contextMenu,
  headings,
  type MenuItem,
  type PageScrollRequest,
  pageLayoutState,
  pageScrollRequest,
} from "../state";
import { READING_LINE } from "../chrome";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

// where the pages start and which page a heading is on, which needs laid out
// pages: two pages, the second starting 1000 px down, with the headings
// before position 50 on the first
vi.mock("../engine/geometry", async (original) => {
  const module = await original<typeof import("../engine/geometry")>();
  return {
    ...module,
    pageTops: vi.fn(() => [0, 1000]),
    scrollState: vi.fn(() => ({ top: 0, height: 600, max: 1400 })),
    caretPage: vi.fn((pos: number) => (pos < 50 ? 0 : 1)),
  };
});

let dispose = () => {};
const counter = () => document.getElementById("ui-page-number")!;
const entries = () => contextMenu.value!.items as Exclude<MenuItem, string>[];

describe("page number", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    contextMenu.value = null;
    headings.value = [
      { level: 1, text: "Introduction", pos: 0 },
      { level: 2, text: "Method", pos: 20 },
      { level: 1, text: "Results", pos: 60 },
    ];
    pageLayoutState.value = {
      width: 595,
      height: 842,
      margins: { top: 72, right: 72, bottom: 72, left: 72 },
      pages: 2,
      bodyVersions: new Uint32Array(2),
      bandVersions: new Uint32Array(2),
      bottoms: new Float32Array(2),
    };
    dispose = bootApp(createTestHandle());
  });
  afterEach(() => {
    dispose();
    contextMenu.value = null;
    headings.value = [];
    pageLayoutState.value = null;
  });

  it("shows the page in view among the pages", () => {
    expect(counter().textContent).toBe("Page 1 of 2");
    expect(counter().getAttribute("aria-haspopup")).toBe("menu");
  });

  it("opens a menu of the pages with the first heading on each", async () => {
    counter().click();
    await nextTick();

    expect(entries().map(({ label, detail }) => [label, detail])).toEqual([
      ["Page 1", "Introduction"],
      ["Page 2", "Results"],
    ]);
    expect(counter().getAttribute("aria-expanded")).toBe("true");
    const menu = document.getElementById("context-menu")!;
    expect(menu.querySelector(".detail")?.textContent).toBe("Introduction");
    expect(menu.querySelectorAll("svg.icon")).toHaveLength(2);
  });

  it("goes to the page chosen", async () => {
    const requests: PageScrollRequest[] = [];
    // the page view serves and clears the request right after
    const stop = watch(
      pageScrollRequest,
      (request) => request && requests.push(request),
      { flush: "sync" },
    );
    counter().click();
    await nextTick();
    entries()[1].run!();
    stop();

    expect(requests).toEqual([expect.objectContaining({ page: 1, y: 0 })]);
    expect(requests[0].at).toBeLessThan(READING_LINE);
  });

  it("closes its menu when clicked again, even though the press was outside the menu", async () => {
    counter().click();
    await nextTick();
    counter().dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(contextMenu.value).not.toBeNull();

    counter().click();
    await nextTick();
    expect(contextMenu.value).toBeNull();
    expect(counter().getAttribute("aria-expanded")).toBe("false");
  });

  it("leaves a menu it didn't open to its press", async () => {
    contextMenu.value = {
      items: [{ id: "a", label: "A" }],
      anchor: { left: 0, top: 0, bottom: 0 },
      keyboard: false,
      close: () => (contextMenu.value = null),
    };
    await nextTick();
    counter().dispatchEvent(new Event("pointerdown", { bubbles: true }));
    expect(contextMenu.value).toBeNull();
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { showWordCount } from "../editor/commands";
import { formatShortcut } from "../editor/keyBindings";
import {
  activeTabId,
  announcement,
  engineMissing,
  pageView,
  pageZoom,
  spellcheck,
  spellcheckMessage,
  spellcheckStatus,
  tabs,
  textContent,
  wordCountCard,
} from "../state";
import { createState, createTestHandle, doc, p } from "../test/editor";
import { hidePages, showPages } from "../test/engine";
import { bootApp } from "./mount";

// The items of the status bar that only a click reaches: the word count's
// card, the previous and next misspelling, and the view

let dispose = () => {};
afterEach(() => dispose());

const byId = (id: string) => document.getElementById(id);
const card = () => byId("word-count-card");
const rowsOf = () =>
  [...card()!.querySelectorAll("dl > div")].map((row) => [
    row.querySelector("dt")!.textContent,
    row.querySelector("dd")!.textContent,
  ]);
const pointer = (type: string) => new Event(type);

describe("word count card", () => {
  const boot = (state = createState(doc(p("one two three")))) => {
    dispose = bootApp(createTestHandle(state));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = "";
    wordCountCard.value = false;
    tabs.value = [
      {
        id: "a",
        path: "/notes/field notes.md",
        importedFrom: null,
        untitledNumber: null,
        unsaved: false,
        viewAnchor: null,
      },
    ];
    activeTabId.value = "a";
    textContent.value = "one two three";
  });
  afterEach(() => {
    tabs.value = [];
    activeTabId.value = null;
    wordCountCard.value = false;
    vi.useRealTimers();
  });

  it("opens once the pointer rests on the count, and closes after it left", async () => {
    boot();
    byId("ui-stats")!.dispatchEvent(pointer("pointerenter"));
    vi.advanceTimersByTime(299);
    await nextTick();
    expect(card()).toBeNull();

    vi.advanceTimersByTime(1);
    await nextTick();
    expect(card()).not.toBeNull();
    expect(byId("ui-stats")!.getAttribute("aria-expanded")).toBe("true");

    byId("ui-stats")!.dispatchEvent(pointer("pointerleave"));
    card()!.dispatchEvent(pointer("pointerenter"));
    vi.advanceTimersByTime(1000);
    await nextTick();
    expect(card()).not.toBeNull();

    card()!.dispatchEvent(pointer("pointerleave"));
    vi.advanceTimersByTime(500);
    await nextTick();
    expect(card()).toBeNull();
  });

  it("opens on a click and closes on the next", async () => {
    boot();
    byId("ui-stats")!.dispatchEvent(
      new Event("pointerdown", { bubbles: true }),
    );
    byId("ui-stats")!.click();
    await nextTick();
    expect(card()).not.toBeNull();

    byId("ui-stats")!.dispatchEvent(
      new Event("pointerdown", { bubbles: true }),
    );
    byId("ui-stats")!.click();
    await nextTick();
    expect(card()).toBeNull();
  });

  it("shows the document's numbers", async () => {
    boot();
    byId("ui-stats")!.click();
    await nextTick();

    expect(card()!.querySelector(".name")!.textContent).toBe("field notes");
    expect(rowsOf()).toEqual([
      ["Words", "3"],
      ["Characters", "13"],
      // these tests lay out no pages
      ["Pages", "—"],
      ["Reading time", "1 min"],
      ["Selection", "—"],
    ]);
  });

  it("counts the words selected", async () => {
    boot(createState(doc(p("one two three")), { cursor: [1, 8] }));
    wordCountCard.value = true;
    await nextTick();

    expect(rowsOf()[4]).toEqual(["Selection", "2 words"]);
  });

  it("never takes the focus, and a key or a press elsewhere closes it", async () => {
    boot();
    const before = document.activeElement;
    wordCountCard.value = true;
    await nextTick();
    expect(document.activeElement).toBe(before);
    expect(card()!.getAttribute("role")).toBe("group");

    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    await nextTick();
    expect(card()).toBeNull();

    wordCountCard.value = true;
    await nextTick();
    card()!.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(card()).not.toBeNull();
    document.body.dispatchEvent(new Event("pointerdown", { bubbles: true }));
    await nextTick();
    expect(card()).toBeNull();
  });

  it("opens with the Word count command, which reads it out", async () => {
    boot();
    const state = createState(doc(p("one two three")));
    expect(showWordCount()(state)).toBe(true);
    await nextTick();

    expect(card()).not.toBeNull();
    expect(announcement.value?.text).toBe(
      "3 words, 13 characters, 1 min to read",
    );
  });
});

describe("misspelling buttons", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    spellcheck.value = false;
    spellcheckMessage.value = null;
    spellcheckStatus.value = { state: "loading", tag: "de" };
    dispose = bootApp(createTestHandle());
  });
  afterEach(() => {
    spellcheck.value = false;
  });

  it("show only while spell check is on", async () => {
    expect(byId("ui-misspelling-next")).toBeNull();

    spellcheck.value = true;
    await nextTick();
    expect(byId("ui-misspelling-previous")!.getAttribute("aria-label")).toBe(
      "Previous misspelling",
    );
    expect(byId("ui-misspelling-next")!.dataset).toMatchObject({
      tip: "Next misspelling",
      tipKey: formatShortcut("Mod-Alt-n"),
    });
  });

  it("go to a misspelling", async () => {
    spellcheck.value = true;
    await nextTick();
    byId("ui-misspelling-next")!.click();

    // the dictionary is still loading
    expect(spellcheckMessage.value?.text).toBe("Spell check isn't ready");
  });
});

describe("view button", () => {
  const view = () => byId("ui-view")!;

  beforeEach(() => {
    document.body.innerHTML = "";
    pageView.value = "page-ends";
    engineMissing.value = false;
    dispose = bootApp(createTestHandle());
  });
  afterEach(() => {
    pageView.value = "page-ends";
    engineMissing.value = false;
  });

  it("names the view shown and switches to the other", async () => {
    expect(view().getAttribute("aria-label")).toBe(
      "View: page ends. Switch to pages",
    );
    expect(view().dataset).toMatchObject({
      tip: "View: page ends",
      tipKey: formatShortcut("Mod-Alt-v"),
    });

    view().click();
    await nextTick();
    expect(pageView.value).toBe("pages");
    expect(view().getAttribute("aria-label")).toBe(
      "View: pages. Switch to page ends",
    );
  });

  it("isn't there without the layout engine", async () => {
    engineMissing.value = true;
    await nextTick();
    expect(byId("ui-view")).toBeNull();
    expect(document.querySelector("#ui-bottom .status-sep")).toBeNull();
  });
});

describe("zoom", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    showPages("pages");
    engineMissing.value = false;
    dispose = bootApp(createTestHandle());
  });
  afterEach(() => {
    hidePages();
    pageZoom.value = "fit";
    engineMissing.value = false;
  });

  it("zooms in and out, and a click on the zoom fits the pages again", async () => {
    expect(byId("ui-zoom")!.textContent).toBe("Fit");
    expect(byId("ui-zoom")!.dataset.tip).toMatch(/^Fit to window \(\d+%\)$/);

    byId("ui-zoom-in")!.click();
    await nextTick();
    expect(pageZoom.value).not.toBe("fit");
    byId("ui-zoom-out")!.click();
    pageZoom.value = 1.25;
    await nextTick();
    expect(byId("ui-zoom")!.textContent).toBe("125%");
    expect(byId("ui-zoom")!.getAttribute("aria-label")).toBe(
      "Zoom: 125%. Fit to window",
    );
    expect(byId("ui-zoom-in")!.dataset.tipKey).toBe(formatShortcut("Mod-="));

    byId("ui-zoom")!.click();
    expect(pageZoom.value).toBe("fit");
  });

  it("gives way on a narrow window with its − and +, but not the zoom", () => {
    expect(byId("ui-zoom-in")!.parentElement!.className).toBe("status-narrow");
    expect(byId("ui-zoom")!.parentElement!.id).toBe("ui-bottom");
  });

  it("isn't there without the layout engine", async () => {
    engineMissing.value = true;
    await nextTick();
    expect(byId("ui-zoom")).toBeNull();
  });
});

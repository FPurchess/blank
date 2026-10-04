import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { setPageEngine } from "../engine/engine";
import { schema } from "../markdown";
import { pageLayoutState } from "../state";
import { createState, createTestHandle, doc, p } from "../test/editor";
import { laidOutState, layOutPages } from "../test/engine";
import { bootApp } from "./mount";

// The marks over the text (page breaks, misspellings) show on the pages
// near the view only, like the pages themselves.

const LONG =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";
const BREAKS = 12;

// a page break after every few paragraphs, each starting a page
const node = doc(
  ...Array.from({ length: BREAKS }, () => [
    p(LONG),
    p(LONG),
    schema.nodes.page_break.create(),
  ]).flat(),
  p(LONG),
);

describe("the marks on the pages", () => {
  let dispose = () => {};

  beforeEach(() => {
    document.body.innerHTML = '<div id="ui-bottom"></div>';
  });

  afterEach(() => {
    dispose();
    setPageEngine(null);
    pageLayoutState.value = null;
    document.body.replaceChildren();
  });

  it("shows the page breaks of the pages near the view, not all", async () => {
    const engine = layOutPages(node);
    setPageEngine(engine);
    pageLayoutState.value = laidOutState(engine);
    expect(engine.pages()).toBeGreaterThan(BREAKS);
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await nextTick();
    const view = document.getElementById("page-view")!;
    const shown = view.querySelectorAll(".page-frame").length;
    const marks = view.querySelectorAll(".page-break-mark").length;
    expect(marks).toBeGreaterThan(0);
    expect(marks).toBeLessThan(BREAKS);
    // a break on each page shown but the last
    expect(marks).toBeLessThanOrEqual(shown);
  });
});

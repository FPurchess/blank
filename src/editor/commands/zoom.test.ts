import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as geometry from "../../engine/geometry";
import { forgetEngineFailure, useFallbackEditor } from "../../engine/engine";
import {
  announcement,
  pageZoom,
  ZOOM_NEEDS_PAGES,
  zoomAnchor,
  zoomFactor,
} from "../../state";
import { createState, doc, p } from "../../test/editor";
import { hidePages, showPages } from "../../test/engine";
import { nextZoom, zoomBy, zoomFit, zoomStep } from "./zoom";

describe("nextZoom", () => {
  it("steps to the next step in or out", () => {
    expect(nextZoom(1, 1)).toBe(1.1);
    expect(nextZoom(1, -1)).toBe(0.9);
    // from Fit's factor, to the step next to it
    expect(nextZoom(0.87, 1)).toBe(0.9);
    expect(nextZoom(0.87, -1)).toBe(0.8);
  });

  it("stays at the ends", () => {
    expect(nextZoom(2, 1)).toBe(2);
    expect(nextZoom(0.5, -1)).toBe(0.5);
  });
});

describe("the zoom commands", () => {
  const state = createState(doc(p("text")));
  const run = (command: ReturnType<typeof zoomFit>) => command(state, () => {});

  beforeEach(() => {
    showPages("pages");
  });

  afterEach(() => {
    hidePages();
    pageZoom.value = "fit";
    zoomAnchor.value = null;
  });

  it("zoom in and out a step, keeping the caret or the view's middle", () => {
    const anchor = { page: 0, x: 1, y: 2, viewX: 3, viewY: 4 };
    vi.spyOn(geometry, "zoomAnchorNow").mockReturnValue(anchor);
    // only asked, nothing changes
    expect(zoomBy(1)(state)).toBe(true);
    expect(pageZoom.value).toBe("fit");

    pageZoom.value = 1;
    run(zoomBy(1));
    expect(pageZoom.value).toBe(1.1);
    expect(zoomAnchor.value).toBe(anchor);
    expect(announcement.value?.text).toBe("110%");

    run(zoomBy(-1));
    run(zoomBy(-1));
    expect(pageZoom.value).toBe(0.9);
  });

  it("fit the pages to the window again, saying the size that gives", () => {
    pageZoom.value = 1.5;
    run(zoomFit());
    expect(pageZoom.value).toBe("fit");
    expect(announcement.value?.text).toBe(
      `Fit, ${Math.round(zoomFactor.value * 100)}%`,
    );
  });

  it("say the zoom is at its end, and keep no spot for later", () => {
    pageZoom.value = 2;
    run(zoomStep(1, { page: 0, x: 0, y: 0, viewX: 0, viewY: 0 }));
    expect(pageZoom.value).toBe(2);
    expect(zoomAnchor.value).toBeNull();
    expect(announcement.value?.text).toBe("The zoom is at 200%");
  });

  it("keep no spot for later when the zoom stays, e.g. Fit again", () => {
    run(zoomFit());
    expect(pageZoom.value).toBe("fit");
    expect(zoomAnchor.value).toBeNull();
    expect(announcement.value?.text).toMatch(/^The zoom is at Fit, \d+%$/);
  });

  it("say they need the pages without the engine", () => {
    useFallbackEditor("failed");
    run(zoomBy(1));
    expect(pageZoom.value).toBe("fit");
    expect(announcement.value?.text).toBe(ZOOM_NEEDS_PAGES);
    forgetEngineFailure();
  });
});

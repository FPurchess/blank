import { afterEach, describe, expect, it } from "vitest";

import {
  announcement,
  headings,
  outlinePeek,
  outlinePinned,
  publishHeadings,
} from "../../state";
import { createState, doc, h } from "../../test/editor";
import { showOutline } from "./outline";

describe("showOutline", () => {
  afterEach(() => {
    headings.value = [];
    outlinePinned.value = false;
    outlinePeek.value = null;
    // jsdom's
    window.innerWidth = 1024;
  });

  it("opens and closes the outline", () => {
    publishHeadings(doc(h(1, "One"), h(2, "Two")));
    window.innerWidth = 1200;
    const state = createState(doc(h(1, "One"), h(2, "Two")));
    expect(showOutline()(state)).toBe(true);
    expect(outlinePinned.value).toBe(true);
    expect(announcement.value?.text).toBe("Outline shown");
    showOutline()(state);
    expect(outlinePinned.value).toBe(false);
  });

  it("floats it over the pages on a narrow window", () => {
    publishHeadings(doc(h(1, "One"), h(2, "Two")));
    window.innerWidth = 800;
    showOutline()(createState(doc(h(1, "One"))));
    expect(outlinePeek.value).toBe("sticky");
  });
});

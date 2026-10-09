import { afterEach, describe, expect, it } from "vitest";

import { announcement, pageView } from "../../state";
import { createState, doc, p } from "../../test/editor";
import { togglePageView } from "./pageView";

describe("togglePageView", () => {
  afterEach(() => {
    pageView.value = "page-ends";
  });

  it("switches between the page ends and the pages", () => {
    const state = createState(doc(p("a")));
    expect(togglePageView()(state, () => {})).toBe(true);
    expect(pageView.value).toBe("pages");
    expect(announcement.value?.text).toBe("Pages");
    togglePageView()(state, () => {});
    expect(pageView.value).toBe("page-ends");
    expect(announcement.value?.text).toBe("Page ends");
  });

  it("only says it can when asked, without switching", () => {
    pageView.value = "page-ends";
    expect(togglePageView()(createState(doc(p("x"))))).toBe(true);
    expect(pageView.value).toBe("page-ends");
  });
});

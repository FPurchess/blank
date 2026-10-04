import { afterEach, describe, expect, it } from "vitest";

import { frameLayout } from "../engine/frames";
import { schema } from "../markdown";
import { pageLayoutState } from "../state";
import { doc } from "../test/editor";
import { laidOutState, layOutPages } from "../test/engine";
import { edgeStep, targetAt } from "./pagePointer";

describe("edgeStep", () => {
  it("scrolls near and beyond the edges, the farther the faster", () => {
    expect(edgeStep(300, 0, 600)).toBe(0);
    expect(edgeStep(10, 0, 600)).toBeLessThan(0);
    expect(edgeStep(-100, 0, 600)).toBeLessThan(edgeStep(10, 0, 600));
    expect(edgeStep(590, 0, 600)).toBeGreaterThan(0);
    expect(edgeStep(5000, 0, 600)).toBe(40);
  });
});

describe("targetAt", () => {
  afterEach(() => {
    pageLayoutState.value = null;
  });

  it("finds the position and the link under a point", () => {
    const link = schema.marks.link.create({ href: "https://example.com" });
    const node = doc(
      schema.node("paragraph", null, [
        schema.text("see "),
        schema.text("the site", [link]),
        schema.text(" here"),
      ]),
    );
    const engine = layOutPages(node);
    const state = laidOutState(engine);
    pageLayoutState.value = state;
    const layout = frameLayout(state, "pages", 800);
    const frame = layout.frames[0];
    // the middle of the link's text, on the desk
    const caret = engine.caret(8)!;
    const x = frame.left + caret.x * layout.scale;
    const y = frame.top + (caret.y + caret.height / 2) * layout.scale;
    expect(targetAt({ engine, layout }, x, y)).toEqual({
      pos: 8,
      link: "https://example.com",
    });
    const before = engine.caret(2)!;
    expect(
      targetAt(
        { engine, layout },
        frame.left + before.x * layout.scale,
        frame.top + (before.y + before.height / 2) * layout.scale,
      ),
    ).toEqual({ pos: 2, link: null });
  });
});

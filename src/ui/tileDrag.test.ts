import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { gapAt } from "../engine/geometry";
import { pageDropGap } from "../state";
import { doc, p } from "../test/editor";
import { tileDrag } from "./tileDrag";

vi.mock("../engine/geometry", async (original) => ({
  ...(await original<typeof import("../engine/geometry")>()),
  gapAt: vi.fn(),
}));

// a pointer event at `x`; jsdom has no PointerEvent
const pointer = (x: number, init: Partial<PointerEvent> = {}) =>
  ({
    clientX: x,
    clientY: 10,
    button: 0,
    buttons: 1,
    pointerId: 1,
    currentTarget: null,
    ...init,
  }) as unknown as PointerEvent;

describe("dragging a tile onto the pages", () => {
  const drop = vi.fn();
  // the pages are right of x 100
  const dragOn = () =>
    tileDrag({
      doc: () => doc(p("a"), p("b")),
      onPages: (x) => x > 100,
      drop,
    });

  beforeEach(() => {
    drop.mockReset();
    vi.mocked(gapAt).mockReturnValue(3);
  });
  afterEach(() => (pageDropGap.value = null));

  it("shows where the block goes, and inserts it there", () => {
    const drag = dragOn();
    drag.down(pointer(10), "toc");
    drag.move(pointer(12));
    // not yet: a click may move a pixel or two
    expect(drag.dragging).toBe(false);
    drag.move(pointer(50));
    expect(drag.dragging).toBe(true);
    // over the pane, nowhere yet
    expect(pageDropGap.value).toBeNull();
    drag.move(pointer(200));
    expect(pageDropGap.value).toBe(3);
    expect(drag.up(pointer(200))).toBe(true);
    expect(drop).toHaveBeenCalledWith("toc", 3);
    expect(pageDropGap.value).toBeNull();
  });

  it("keeps the pointer's events only once it drags", () => {
    // the webview sends the click to the element holding the capture, which
    // would take it from the tile
    const setPointerCapture = vi.fn();
    const drag = dragOn();
    drag.down(
      pointer(10, { currentTarget: { setPointerCapture } } as never),
      "toc",
    );
    drag.move(pointer(12));
    expect(setPointerCapture).not.toHaveBeenCalled();
    drag.move(pointer(50, { pointerId: 7 }));
    drag.move(pointer(200, { pointerId: 7 }));
    expect(setPointerCapture).toHaveBeenCalledExactlyOnceWith(7);
  });

  it("leaves a click a click", () => {
    const drag = dragOn();
    drag.down(pointer(10), "toc");
    expect(drag.up(pointer(10))).toBe(false);
    expect(drop).not.toHaveBeenCalled();
  });

  it("inserts nothing when let go off the pages, or cancelled", () => {
    const drag = dragOn();
    drag.down(pointer(10), "toc");
    drag.move(pointer(200));
    drag.move(pointer(50));
    expect(drag.up(pointer(50))).toBe(true);
    drag.down(pointer(10), "toc");
    drag.move(pointer(200));
    drag.cancel();
    expect(drag.up(pointer(200))).toBe(false);
    drag.down(pointer(10), "toc");
    drag.move(pointer(200, { buttons: 0 }));
    expect(drag.up(pointer(200))).toBe(false);
    expect(drop).not.toHaveBeenCalled();
  });

  it("starts with the first button only", () => {
    const drag = dragOn();
    drag.down(pointer(10, { button: 2 }), "toc");
    drag.move(pointer(200));
    expect(drag.dragging).toBe(false);
  });
});

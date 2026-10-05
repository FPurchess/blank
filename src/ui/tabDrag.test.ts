import { describe, expect, it, vi } from "vitest";

import { dragBy, edgesOf, tabDrag, type TabDragTarget } from "./tabDrag";

describe("dragBy", () => {
  // three tabs 100 px wide
  const edges = [0, 100, 200, 300];

  it("moves a tab to the nearest line between the others", () => {
    expect(dragBy(edges, 0, 40)).toBe(0);
    expect(dragBy(edges, 0, 190)).toBe(1);
    expect(dragBy(edges, 0, 290)).toBe(2);
    expect(dragBy(edges, 2, 10)).toBe(-2);
  });
});

describe("edgesOf", () => {
  it("returns each tab's left edge and the last one's right", () => {
    expect(
      edgesOf([
        { left: 0, right: 100 },
        { left: 102, right: 180 },
      ]),
    ).toEqual([0, 102, 180]);
    expect(edgesOf([])).toEqual([]);
  });
});

describe("tabDrag", () => {
  // three tabs 100 px wide, at 0, 100 and 200
  const ids = ["a", "b", "c"];
  const target = (): TabDragTarget & { move: ReturnType<typeof vi.fn> } => ({
    boxes: () => ids.map((_, i) => ({ left: i * 100, right: (i + 1) * 100 })),
    indexOf: (id) => ids.indexOf(id),
    move: vi.fn(async () => {}),
    capture: vi.fn(),
  });
  const pointer = (clientX: number, buttons = 1, button = 0) =>
    ({ clientX, buttons, button, pointerId: 1 }) as PointerEvent;

  it("moves a tab once its middle passes the next one's", async () => {
    const row = target();
    const drag = tabDrag(row);

    // pressed 20 px right of its middle
    drag.down(pointer(70), "a");
    drag.move(pointer(72));
    expect(row.capture).not.toHaveBeenCalled();
    drag.move(pointer(150));
    expect(row.move).not.toHaveBeenCalled();
    drag.move(pointer(175));

    expect(row.capture).toHaveBeenCalledWith(1);
    expect(row.move).toHaveBeenCalledWith("a", 1);
  });

  it("asks for one move at a time", async () => {
    const row = target();
    let done = () => {};
    row.move.mockReturnValue(new Promise<void>((resolve) => (done = resolve)));
    const drag = tabDrag(row);

    drag.down(pointer(50), "a");
    drag.move(pointer(160));
    drag.move(pointer(170));
    expect(row.move).toHaveBeenCalledOnce();

    done();
    await Promise.resolve();
    await Promise.resolve();
    drag.move(pointer(170));
    expect(row.move).toHaveBeenCalledTimes(2);
  });

  it("skips the click that ends a drag, and only that one", () => {
    const drag = tabDrag(target());

    drag.down(pointer(50), "a");
    drag.move(pointer(90));
    drag.up();
    expect(drag.clicked()).toBe(false);
    expect(drag.clicked()).toBe(true);

    // a drag let go off the row, whose click went elsewhere
    drag.down(pointer(50), "a");
    drag.move(pointer(90));
    drag.up();
    drag.down(pointer(50), "b");
    drag.up();
    expect(drag.clicked()).toBe(true);
  });

  it("drags nothing with another button, or once the button is up", () => {
    const row = target();
    const drag = tabDrag(row);

    drag.down(pointer(50, 2, 2), "a");
    drag.move(pointer(250, 2));
    drag.down(pointer(50), "a");
    drag.move(pointer(250, 0));
    drag.move(pointer(250));

    expect(row.move).not.toHaveBeenCalled();
  });
});

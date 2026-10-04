import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tableHandles, type TableHandlesState } from "../state";
import { flushPromises } from "../test/async";
import { createTestHandle } from "../test/editor";
import { fakeTableHandles } from "../test/tables";
import { bootApp } from "./mount";

describe("TableHandles", () => {
  const root = () => document.getElementById("table-handles")!;
  const get = (selector: string) =>
    root().querySelector<HTMLElement>(selector)!;
  // lets Vue render what changed
  const settle = () => flushPromises();
  const show = async (table: TableHandlesState | null) => {
    tableHandles.value = table;
    await settle();
  };
  const mouse = async (x: number, y: number) => {
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: x, clientY: y }),
    );
    await settle();
  };
  const pointer = async (
    target: HTMLElement,
    type: string,
    x: number,
    y: number,
  ) => {
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 0,
      }),
    );
    await settle();
  };
  const drag = async (
    target: HTMLElement,
    from: [number, number],
    to: [number, number],
  ) => {
    await pointer(target, "pointerdown", ...from);
    await pointer(target, "pointermove", ...to);
    await pointer(target, "pointerup", 0, 0);
  };

  let dispose: () => void;

  beforeEach(() => {
    document.body.innerHTML = "";
    dispose = bootApp(createTestHandle());
  });

  afterEach(() => {
    dispose();
    tableHandles.value = null;
  });

  it("shows the handles of the row and column under the mouse", async () => {
    await show(fakeTableHandles());
    expect(root().hidden).toBe(false);
    await mouse(250, 150);

    expect(get(".grip.row").hidden).toBe(false);
    expect(get(".grip.row").style.top).toBe("146px");
    expect(get(".grip.column").style.left).toBe("206px");
    expect(get(".insert").hidden).toBe(true);
    expect(root().querySelectorAll(".resizer")).toHaveLength(2);

    await show(null);
    expect(root().hidden).toBe(true);
  });

  it("keeps the row handles in view on a table scrolled sideways", async () => {
    tableHandles.value = fakeTableHandles({
      box: { left: 20, top: 100, right: 400, bottom: 220 },
      visible: { left: 100, right: 400 },
      columns: [20, 200, 300, 400],
    });
    await mouse(150, 150);
    expect(get(".grip.row").style.left).toBe("94px");

    await mouse(101, 179);
    expect(get(".insert").style.left).toBe("91px");
  });

  it("inserts a row with the + on the line between rows", async () => {
    const table = fakeTableHandles();
    await show(table);
    await mouse(101, 179);
    expect(get(".insert").hidden).toBe(false);
    expect(get(".grip.row").hidden).toBe(true);

    await pointer(get(".insert"), "pointerdown", 101, 179);
    expect(table.insertRow).toHaveBeenCalledWith(2);
  });

  it("inserts a column with the + on the line between columns", async () => {
    const table = fakeTableHandles();
    await show(table);
    await mouse(301, 101);

    await pointer(get(".insert"), "pointerdown", 301, 101);
    expect(table.insertColumn).toHaveBeenCalledWith(2);
  });

  it("selects a row and opens the table menu on a click on its handle", async () => {
    const table = fakeTableHandles();
    await show(table);
    await mouse(100, 150);
    await pointer(get(".grip.row"), "pointerdown", 100, 150);
    await pointer(get(".grip.row"), "pointerup", 100, 150);

    expect(table.hold).toHaveBeenCalledWith(true);
    expect(table.selectRows).toHaveBeenCalledWith([1, 2], expect.any(Object));
    expect(table.hold).toHaveBeenLastCalledWith(false);
  });

  it("moves the selected rows by dragging a handle among them", async () => {
    const table = fakeTableHandles({
      rows: [100, 140, 180, 220, 260],
      box: { left: 100, top: 100, right: 400, bottom: 260 },
      selected: { rows: [2, 4], columns: [0, 3] },
    });
    await show(table);
    await mouse(100, 190);
    await drag(get(".grip.row"), [100, 190], [100, 142]);

    expect(table.moveRows).toHaveBeenCalledWith([2, 4], -1);
  });

  it("moves a column by dragging its handle", async () => {
    const table = fakeTableHandles();
    await show(table);
    await mouse(150, 100);
    await drag(get(".grip.column"), [150, 100], [395, 100]);

    expect(table.moveColumns).toHaveBeenCalledWith([0, 1], 2);
  });

  it("resizes columns by dragging the line between them", async () => {
    const table = fakeTableHandles();
    await show(table);
    await mouse(200, 150);
    await drag(get('.resizer[data-index="1"]'), [200, 150], [230, 150]);

    expect(table.setWidths).toHaveBeenCalledWith([40, 20, 40]);
  });

  it("sizes columns by content again on a double click on a line", async () => {
    const table = fakeTableHandles();
    await show(table);
    const line = get(".resizer");
    for (let i = 0; i < 2; i++) {
      await pointer(line, "pointerdown", 200, 150);
      await pointer(line, "pointerup", 200, 150);
    }

    expect(table.setWidths).toHaveBeenCalledOnce();
    expect(table.setWidths).toHaveBeenCalledWith(null);
  });

  it("adds rows and columns by dragging the corner, showing the new size", async () => {
    const table = fakeTableHandles();
    await show(table);
    const corner = get(".edge.corner");
    await pointer(corner, "pointerdown", 400, 220);
    await pointer(corner, "pointermove", 460, 260);
    expect(get(".ghost").hidden).toBe(false);
    expect(get(".size").textContent).toBe("4 × 4");
    await pointer(corner, "pointerup", 0, 0);

    expect(table.resize).toHaveBeenCalledWith(4, 4);
    expect(get(".ghost").hidden).toBe(true);
  });

  it("drags the right edge sideways only and the bottom edge down only", async () => {
    const table = fakeTableHandles();
    await show(table);
    await drag(get(".edge.right"), [400, 150], [460, 300]);
    expect(table.resize).toHaveBeenLastCalledWith(4, 3);

    await drag(get(".edge.bottom"), [250, 220], [400, 300]);
    expect(table.resize).toHaveBeenLastCalledWith(3, 5);
  });

  it("cancels a drag with Esc", async () => {
    const table = fakeTableHandles();
    await show(table);
    const corner = get(".edge.corner");
    await pointer(corner, "pointerdown", 400, 220);
    await pointer(corner, "pointermove", 500, 260);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    await settle();
    await pointer(corner, "pointerup", 0, 0);

    expect(table.resize).not.toHaveBeenCalled();
    expect(table.hold).toHaveBeenLastCalledWith(false);
  });

  it("goes away once disposed", async () => {
    dispose();
    expect(document.getElementById("table-handles")).toBeNull();

    // renders no more, and a second dispose does no harm
    await show(fakeTableHandles());
    await mouse(250, 150);
    expect(document.getElementById("table-handles")).toBeNull();
    dispose = () => {};
  });

  it("keeps the focus in the editor when a handle is pressed", async () => {
    await show(fakeTableHandles());
    const down = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    get(".edge.corner").dispatchEvent(down);

    expect(down.defaultPrevented).toBe(true);
  });
});

describe("TableHandles (more)", () => {
  const root = () => document.getElementById("table-handles")!;
  const get = (selector: string) =>
    root().querySelector<HTMLElement>(selector)!;
  const settle = () => flushPromises();
  const show = async (table: TableHandlesState) => {
    tableHandles.value = table;
    await settle();
  };
  const mouse = async (x: number, y: number) => {
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: x, clientY: y }),
    );
    await settle();
  };
  const pointer = async (
    target: HTMLElement,
    type: string,
    x: number,
    y: number,
    button = 0,
  ) => {
    target.dispatchEvent(
      new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button }),
    );
    await settle();
  };

  let dispose = () => {};
  beforeEach(() => {
    document.body.innerHTML = "";
    dispose = bootApp(createTestHandle());
  });
  afterEach(() => {
    dispose();
    tableHandles.value = null;
    vi.restoreAllMocks();
  });

  it("opens the table menu below the grip that was clicked", async () => {
    const table = fakeTableHandles();
    await show(table);
    await mouse(250, 150);
    await pointer(get(".grip.row"), "pointerdown", 100, 150);
    await pointer(get(".grip.row"), "pointerup", 100, 150);
    expect(table.selectRows).toHaveBeenCalledWith([1, 2], {
      left: 94,
      top: 146,
      bottom: 174,
    });

    await pointer(get(".grip.column"), "pointerdown", 250, 100);
    await pointer(get(".grip.column"), "pointerup", 250, 100);
    expect(table.selectColumns).toHaveBeenCalledWith([1, 2], {
      left: 206,
      top: 94,
      bottom: 106,
    });
  });

  it("takes a small slip of the mouse on a grip as a click", async () => {
    const table = fakeTableHandles();
    await show(table);
    await mouse(100, 150);
    await pointer(get(".grip.row"), "pointerdown", 100, 150);
    await pointer(get(".grip.row"), "pointermove", 102, 151);
    await pointer(get(".grip.row"), "pointerup", 102, 151);
    expect(table.selectRows).toHaveBeenCalledOnce();
    expect(table.moveRows).not.toHaveBeenCalled();
  });

  it("moves nothing for rows dropped where they were", async () => {
    const table = fakeTableHandles();
    await show(table);
    await mouse(100, 150);
    await pointer(get(".grip.row"), "pointerdown", 100, 150);
    await pointer(get(".grip.row"), "pointermove", 100, 160);
    await pointer(get(".grip.row"), "pointerup", 0, 0);
    expect(table.moveRows).not.toHaveBeenCalled();
    expect(table.selectRows).not.toHaveBeenCalled();
  });

  it("hides the handles while rows move, and the preview once dropped", async () => {
    const table = fakeTableHandles();
    await show(table);
    await mouse(100, 150);
    expect(get(".dragged").hidden).toBe(true);
    await pointer(get(".grip.row"), "pointerdown", 100, 150);
    await pointer(get(".grip.row"), "pointermove", 100, 210);
    expect(get(".grip.row").hidden).toBe(true);
    expect(get(".resizer").hidden).toBe(true);
    expect(get(".dragged").hidden).toBe(false);
    await pointer(get(".grip.row"), "pointerup", 0, 0);
    expect(get(".dragged").hidden).toBe(true);
    expect(get(".guide").hidden).toBe(true);
  });

  it("keeps the grips where the drag started while the mouse moves on", async () => {
    await show(fakeTableHandles());
    await mouse(399, 219);
    expect(get(".grip.row").style.top).toBe("186px");
    await pointer(get(".edge.corner"), "pointerdown", 400, 220);
    await mouse(250, 150);
    expect(get(".grip.row").style.top).toBe("186px");
  });

  it("moves the column grip along the row under the mouse", async () => {
    await show(fakeTableHandles());
    await mouse(250, 150);
    expect(get(".grip.column").style.left).toBe("206px");
    await mouse(150, 150);
    expect(get(".grip.column").style.left).toBe("106px");
  });

  it("marks the grip of selected rows", async () => {
    await show(
      fakeTableHandles({ selected: { rows: [1, 2], columns: [0, 3] } }),
    );
    await mouse(250, 150);
    expect(get(".grip.row").classList).toContain("selected");
    expect(get(".grip.column").classList).not.toContain("selected");
  });

  it("resizes at the line that was dragged", async () => {
    const table = fakeTableHandles();
    await show(table);
    await pointer(get('.resizer[data-index="2"]'), "pointerdown", 300, 150);
    await pointer(get('.resizer[data-index="2"]'), "pointermove", 330, 150);
    await pointer(get('.resizer[data-index="2"]'), "pointerup", 0, 0);
    expect(table.setWidths).toHaveBeenCalledWith([30, 40, 30]);
  });

  it("changes nothing on a click on an edge", async () => {
    const table = fakeTableHandles();
    await show(table);
    await pointer(get(".edge.corner"), "pointerdown", 400, 220);
    await pointer(get(".edge.corner"), "pointerup", 400, 220);
    expect(table.resize).not.toHaveBeenCalled();
  });

  it("ends a drag the webview cancels", async () => {
    const table = fakeTableHandles();
    await show(table);
    const corner = get(".edge.corner");
    await pointer(corner, "pointerdown", 400, 220);
    await pointer(corner, "pointermove", 460, 260);
    await pointer(corner, "pointercancel", 0, 0);
    expect(get(".ghost").hidden).toBe(true);
    expect(table.hold).toHaveBeenLastCalledWith(false);
    await pointer(corner, "pointerup", 0, 0);
    expect(table.resize).not.toHaveBeenCalled();
  });

  it("inserts a first row in a table without a header row", async () => {
    const table = fakeTableHandles({ headerRows: 0 });
    await show(table);
    await mouse(101, 101);
    await pointer(get(".insert"), "pointerdown", 101, 101);
    expect(table.insertRow).toHaveBeenCalledWith(0);
  });

  it("ignores presses of other buttons", async () => {
    const table = fakeTableHandles();
    await show(table);
    await mouse(101, 179);
    await pointer(get(".insert"), "pointerdown", 101, 179, 2);
    expect(table.insertRow).not.toHaveBeenCalled();
  });

  it("keeps Esc that cancels a drag from the editor", async () => {
    await show(fakeTableHandles());
    await pointer(get(".edge.corner"), "pointerdown", 400, 220);
    const esc = new KeyboardEvent("keydown", {
      key: "Escape",
      cancelable: true,
    });
    window.dispatchEvent(esc);
    expect(esc.defaultPrevented).toBe(true);
  });

  describe("double clicks on a line", () => {
    const click = async (line: HTMLElement) => {
      await pointer(line, "pointerdown", 200, 150);
      await pointer(line, "pointerup", 200, 150);
    };

    it("are two presses on the same line within 400ms", async () => {
      const table = fakeTableHandles();
      await show(table);
      const now = vi.spyOn(Date, "now").mockReturnValue(1000);
      await click(get('.resizer[data-index="1"]'));
      now.mockReturnValue(1500);
      await click(get('.resizer[data-index="1"]'));
      expect(table.setWidths).not.toHaveBeenCalled();

      await click(get('.resizer[data-index="2"]'));
      expect(table.setWidths).not.toHaveBeenCalled();
    });

    it("start over after one", async () => {
      const table = fakeTableHandles();
      await show(table);
      for (let i = 0; i < 3; i++) await click(get(".resizer"));
      expect(table.setWidths).toHaveBeenCalledOnce();
    });
  });

  it("keeps placing the handles while a table published mid-drag lost the column", async () => {
    await show(fakeTableHandles());
    await mouse(350, 150);
    await pointer(get('.resizer[data-index="2"]'), "pointerdown", 300, 150);

    // fewer columns now, while the hover stays at the third
    await show(
      fakeTableHandles({
        columns: [100, 250, 400],
        percents: [50, 50],
      }),
    );

    expect(get(".grip.column").hidden).toBe(true);
    const styles = [...root().querySelectorAll<HTMLElement>("[style]")].map(
      (element) => element.getAttribute("style"),
    );
    expect(styles.join()).not.toContain("NaN");
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { resizePicker } from "../editor/commands/table/pickerSize";
import { tablePicker, type TablePickerState } from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

/**
 * open opens the picker for a table of `cols` × `rows`, as the table key
 * does, and waits until Vue has rendered it
 */
const open = async (cols = 3, rows = 3): Promise<TablePickerState> => {
  const picker: TablePickerState = {
    cols,
    rows,
    anchor: { left: 10, top: 20, bottom: 30 },
    submit: vi.fn(),
    cancel: vi.fn(),
  };
  tablePicker.value = picker;
  await nextTick();
  return picker;
};

const element = () => document.getElementById("table-picker")!;
const cells = () => [...element().querySelectorAll<HTMLElement>(".cell")];
const cellAt = (col: number, row: number) =>
  element().querySelector<HTMLElement>(
    `.cell[data-col="${col}"][data-row="${row}"]`,
  )!;

describe("table picker", () => {
  let dispose = () => {};

  beforeEach(() => {
    dispose = bootApp(createTestHandle());
  });

  afterEach(() => {
    tablePicker.value = null;
    dispose();
  });

  it("shows the chosen size in a grid of at least 10 × 8", async () => {
    await open(6, 2);

    expect(element().getAttribute("role")).toBe("dialog");
    expect(element().getAttribute("aria-label")).toBe("Insert table");
    expect(cells()).toHaveLength(10 * 8);
    expect(element().querySelectorAll(".cell.chosen")).toHaveLength(12);
    expect(element().querySelector(".size")!.textContent).toBe("6 × 2");
    expect(element().querySelector(".size")!.getAttribute("aria-live")).toBe(
      "polite",
    );
  });

  it("marks the first row as the header row, in a grid of its columns", async () => {
    await open();

    expect(element().querySelectorAll(".cell.header")).toHaveLength(10);
    expect(cellAt(1, 1).classList.contains("header")).toBe(true);
    expect(cellAt(1, 2).classList.contains("header")).toBe(false);
    expect(
      element().querySelector<HTMLElement>(".grid")!.style.gridTemplateColumns,
    ).toBe("repeat(10, auto)");
  });

  it("grows the grid one past the chosen size, up to 20", async () => {
    await open(12, 8);
    expect(cells()).toHaveLength(13 * 9);

    resizePicker(20, 20);
    await nextTick();
    expect(cells()).toHaveLength(20 * 20);
  });

  it("changes the size in place, without rendering the picker again", async () => {
    await open();
    const first = element();
    const firstCell = cells()[0];
    resizePicker(1, 0);
    await nextTick();

    expect(element()).toBe(first);
    expect(cells()[0]).toBe(firstCell);
    expect(cellAt(4, 1).classList.contains("chosen")).toBe(true);
    expect(element().querySelector(".size")!.textContent).toBe("4 × 3");
  });

  it("keeps its cells while the grid grows", async () => {
    await open(10, 3);
    const corner = cellAt(1, 1);
    resizePicker(1, 0);
    await nextTick();

    expect(cells()).toHaveLength(12 * 8);
    expect(cellAt(1, 1)).toBe(corner);
  });

  it("chooses the size under the mouse and inserts it on a click", async () => {
    const picker = await open();
    cellAt(4, 2).dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    await nextTick();

    expect(tablePicker.value).toMatchObject({ cols: 4, rows: 2 });
    cellAt(4, 2).click();
    expect(picker.submit).toHaveBeenCalledWith(4, 2);
  });

  it("keeps the focus in the editor when it's pressed anywhere", async () => {
    await open();
    const press = (target: Element) => {
      const event = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(press(cellAt(1, 1))).toBe(true);
    expect(press(document.querySelector("#table-picker .size")!)).toBe(true);
    expect(press(document.querySelector("#table-picker .hint")!)).toBe(true);
  });

  it("sits below the cursor, and moves when the cursor or its height does", async () => {
    // the picker is as high as it has cells, one pixel each
    const height = (element: HTMLElement) =>
      element.querySelectorAll(".cell").length;
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(220);
    vi.spyOn(HTMLElement.prototype, "offsetHeight", "get").mockImplementation(
      function (this: HTMLElement) {
        return height(this);
      },
    );
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        return { width: 200, height: height(this) } as DOMRect;
      },
    );
    const picker = await open();
    // below the anchor's bottom at 30
    expect(element().style.top).toBe("32px");

    tablePicker.value = {
      ...picker,
      anchor: { left: 10, top: 120, bottom: 130 },
    };
    await nextTick();
    expect(element().style.top).toBe("132px");

    // a row more makes it 90 high, which no longer fits below: it opens
    // above the anchor's top at 120
    resizePicker(0, 5);
    await nextTick();
    expect(element().style.top).toBe(`${120 - 90 - 2}px`);
  });

  it("stays in the window when the grid grows sideways", async () => {
    // the picker is 10 pixels wide per column
    vi.spyOn(window, "innerWidth", "get").mockReturnValue(200);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
      function (this: HTMLElement) {
        const columns =
          this.querySelector<HTMLElement>(".grid")?.style.gridTemplateColumns;
        const cols = Number(/repeat\((\d+)/.exec(columns ?? "")?.[1] ?? 0);
        return { width: cols * 10, height: 50 } as DOMRect;
      },
    );
    const picker = await open();
    tablePicker.value = {
      ...picker,
      anchor: { left: 150, top: 20, bottom: 30 },
    };
    await nextTick();
    // 10 columns, 100 wide: moved left to stay in the window
    expect(element().style.left).toBe(`${200 - 4 - 100}px`);

    resizePicker(10, 0);
    await nextTick();
    // 14 columns now, and further left, although the height stayed the same
    expect(element().style.left).toBe(`${200 - 4 - 140}px`);
  });

  it("keeps every cell while a column is added", async () => {
    await open(10, 3);
    const secondRow = cellAt(1, 2);

    resizePicker(1, 0);
    await nextTick();

    expect(cellAt(1, 2)).toBe(secondRow);
  });

  it("inserts the size of the clicked cell", async () => {
    const picker = await open();

    cellAt(5, 4).click();

    expect(picker.submit).toHaveBeenCalledWith(5, 4);
  });

  it("is removed once closed", async () => {
    await open();
    tablePicker.value = null;
    await nextTick();

    expect(document.getElementById("table-picker")).toBeNull();
  });

  it("goes away with the app once disposed", async () => {
    await open();
    dispose();
    dispose = () => {};

    expect(document.getElementById("table-picker")).toBeNull();
    await open();
    expect(document.getElementById("table-picker")).toBeNull();
  });
});

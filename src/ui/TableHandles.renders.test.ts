import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tableHandles } from "../state";
import { flushPromises } from "../test/async";
import { createTestHandle } from "../test/editor";
import { fakeTableHandles } from "../test/tables";
import { bootApp } from "./mount";
import * as rect from "./rect";
import * as model from "./tableHandlesModel";

// How much work the handles do for the pointer: they follow every move of
// the mouse over a table, so moves that change nothing must render nothing.
// handlesOf places the handles, and styleOf runs once per handle a render
// patches.

vi.mock("./tableHandlesModel", async (actual) => {
  const real = await actual<typeof import("./tableHandlesModel")>();
  return {
    ...real,
    handlesOf: vi.fn(real.handlesOf),
  };
});
vi.mock("./rect", async (actual) => {
  const real = await actual<typeof import("./rect")>();
  return { ...real, styleOf: vi.fn(real.styleOf) };
});

const placed = () => vi.mocked(model.handlesOf).mock.calls.length;
const rendered = () => vi.mocked(rect.styleOf).mock.calls.length;

const mouse = async (x: number, y: number) => {
  window.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y }));
  await flushPromises();
};
const pointer = async (
  target: HTMLElement,
  type: string,
  x: number,
  y: number,
) => {
  target.dispatchEvent(
    new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }),
  );
  await flushPromises();
};

describe("TableHandles' work for the pointer", () => {
  let dispose = () => {};

  beforeEach(async () => {
    document.body.innerHTML = "";
    dispose = bootApp(createTestHandle());
    tableHandles.value = fakeTableHandles();
    await flushPromises();
  });

  afterEach(() => {
    dispose();
    tableHandles.value = null;
  });

  it("renders nothing while the mouse moves within a cell", async () => {
    await mouse(250, 150);
    const [handles, renders] = [placed(), rendered()];

    await mouse(255, 152);
    await mouse(260, 155);

    expect(placed()).toBe(handles);
    expect(rendered()).toBe(renders);
  });

  it("places the handles once while an edge is dragged", async () => {
    await mouse(400, 220);
    const corner = document.querySelector<HTMLElement>(".edge.corner")!;
    await pointer(corner, "pointerdown", 400, 220);
    const handles = placed();

    for (let x = 401; x <= 405; x++) {
      await pointer(corner, "pointermove", x, 220);
    }

    expect(placed()).toBe(handles);
  });

  it("renders nothing while a grip press slips less than a drag", async () => {
    await mouse(100, 150);
    const grip = document.querySelector<HTMLElement>(".grip.row")!;
    await pointer(grip, "pointerdown", 100, 150);
    const renders = rendered();

    await pointer(grip, "pointermove", 101, 150);
    await pointer(grip, "pointermove", 102, 150);

    expect(rendered()).toBe(renders);
  });
});

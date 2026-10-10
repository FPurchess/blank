import { afterEach, describe, expect, it, onTestFinished, vi } from "vitest";

import { doc, p } from "../test/editor";
import { diagram, renderBox } from "../test/sources";
import { flushPromises } from "../test/async";
import { drawAll, drawingOf, forgetVectors, vectorOf } from "../engine/vectors";
import { setDiagramModuleLoader } from "../engine/diagramModule";
import { registerSource } from "./registry";
import {
  forgetRendered,
  keyOf,
  renderAll,
  renderedOf,
  renderStates,
  requestRender,
  sourceKeyOf,
} from "./store";

describe("rendered sources", () => {
  const stops: (() => void)[] = [];
  const register = (render: (source: string) => unknown, debounce?: number) =>
    stops.push(
      registerSource({
        node: "diagram",
        lang: "mermaid",
        label: () => "Diagram",
        render: render as never,
        debounce,
      }),
    );
  afterEach(() => {
    stops.splice(0).forEach((stop) => stop());
    forgetRendered();
    forgetVectors();
    vi.useRealTimers();
  });

  it("keys a source by its kind and text", () => {
    expect(keyOf("diagram", "A")).toMatch(
      /^blank-vector:diagram:[0-9a-f]{8}-1$/,
    );
    expect(keyOf("diagram", "A")).not.toBe(keyOf("diagram", "B"));
    expect(sourceKeyOf(diagram("A"))).toBe(keyOf("diagram", "A"));
  });

  it("renders a source once, and keeps its drawing", () => {
    const render = vi.fn(renderBox);
    register(render);
    const block = diagram("A --> B");
    const states = renderStates.value;
    requestRender(block);
    requestRender(block);
    expect(render).toHaveBeenCalledTimes(1);
    expect(renderedOf(block)).toMatchObject({ ok: true });
    expect(vectorOf(sourceKeyOf(block))).toMatchObject({ width: 70 });
    expect(renderStates.value).toBe(states + 1);
  });

  it("waits while a source is typed, and renders the last one", () => {
    vi.useFakeTimers();
    const render = vi.fn(renderBox);
    register(render);
    requestRender(diagram("A"), true);
    requestRender(diagram("A -"), true);
    requestRender(diagram("A --> B"), true);
    expect(render).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(render).toHaveBeenCalledExactlyOnceWith("A --> B");
  });

  it("renders slow sources one after the other, and keeps what failed", async () => {
    let running = 0;
    let most = 0;
    register(async (source: string) => {
      running++;
      most = Math.max(most, running);
      await flushPromises();
      running--;
      if (source === "throws") throw new Error("Mermaid broke");
      return renderBox(source);
    });
    const blocks = [diagram("one"), diagram("two"), diagram("throws")];
    await renderAll(doc(p("x"), ...blocks));
    expect(most).toBe(1);
    expect(renderedOf(blocks[0])).toMatchObject({ ok: true });
    expect(renderedOf(blocks[2])).toEqual({
      ok: false,
      error: "Mermaid broke",
    });
  });

  it("forgets the oldest drawings, the module's too, past the ones it keeps", async () => {
    register(renderBox);
    setDiagramModuleLoader(async () => ({
      addFont: () => {},
      draw: () => '{"width":1,"height":1,"ops":[]}',
      missing: () => "",
    }));
    onTestFinished(() => setDiagramModuleLoader(null));
    const first = diagram("first");
    requestRender(first);
    await drawAll([sourceKeyOf(first)]);
    expect(drawingOf(sourceKeyOf(first))).toBeDefined();
    for (let index = 0; index < 200; index++) {
      requestRender(diagram(`next ${index}`));
    }
    expect(vectorOf(sourceKeyOf(first))).toBeUndefined();
    expect(drawingOf(sourceKeyOf(first))).toBeUndefined();
  });
});

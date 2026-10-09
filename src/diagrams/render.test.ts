import { beforeEach, describe, expect, it, vi } from "vitest";

import { errorOf, renderDiagram, sized } from "./render";
import { loadMermaid } from "./mermaid";
import { diagramType } from "./types";

vi.mock("./mermaid", () => ({ loadMermaid: vi.fn() }));

const SVG =
  '<svg id="blank-diagram" width="100%" xmlns="http://www.w3.org/2000/svg" style="max-width: 120px;" viewBox="0 0 120 40"><rect width="120" height="40" fill="#e8e8e8" stroke="#202020"/></svg>';

describe("drawing a diagram", () => {
  beforeEach(() => {
    vi.mocked(loadMermaid).mockResolvedValue({
      parse: vi.fn(async (source: string) => {
        if (source.includes("oops")) {
          throw new Error(
            "Parse error on line 2:\n...A --> oops\n-----^\nExpecting 'SEMI', got 'EOF'\nmore\nlines",
          );
        }
        return true;
      }),
      render: vi.fn(async () => ({ svg: SVG })),
    } as never);
  });

  it("draws it in ink, at its own size", async () => {
    const drawn = await renderDiagram("flowchart LR\n  A --> B");
    expect(drawn).toMatchObject({ ok: true, data: { width: 120, height: 40 } });
    const { svg } = (drawn as { data: { svg: string } }).data;
    expect(svg).toMatch(/^<svg width="120" height="40"/);
    expect(svg).not.toContain("max-width");
    expect(svg).toContain('fill="ink(0.09)"');
    expect(svg).toContain('stroke="ink(0.87)"');
  });

  it("says what is wrong, and where", async () => {
    expect(await renderDiagram("flowchart LR\n  A --> oops")).toEqual({
      ok: false,
      error: "Parse error on line 2:\n...A --> oops\n-----^",
      line: 2,
    });
    expect(errorOf("odd")).toEqual({ error: "odd" });
  });

  it("can't draw without Mermaid, and says so", async () => {
    vi.mocked(loadMermaid).mockRejectedValue(new Error("no WebAssembly"));
    expect(await renderDiagram("flowchart LR")).toEqual({
      ok: "unavailable",
      reason: "Diagrams can't be drawn here: no WebAssembly",
    });
  });

  it("gives a drawing without a viewBox no size", () => {
    expect(sized('<svg width="100%"></svg>')).toBeNull();
  });

  it.each([
    ["flowchart LR\n  A --> B", "Flowchart"],
    ["graph TD\n  A", "Flowchart"],
    ["%%{init: {}}%%\nsequenceDiagram\n  A->>B: hi", "Sequence diagram"],
    ["---\ntitle: Plan\n---\ngantt\n  title x", "Gantt chart"],
    ["erDiagram", "Entity relationship diagram"],
    ["mindmap\n  root", "Mind map"],
    ["", "Diagram"],
    ["nonsense", "Diagram"],
  ])("names %j", (source, name) => {
    expect(diagramType(source)).toBe(name);
  });
});

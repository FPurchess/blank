import { schema } from "../markdown";
import { createSourceBlock } from "../markdown/blocks/sourceBlock";
import { registerSource, type Rendered } from "../sources/registry";

// A kind of source for tests that renders at once: a box as wide as its
// source is long, or an error for a source that says "error".

export const SVG_OF = (source: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${source.length * 10}" height="20"><rect width="10" height="10" fill="ink(1)"/></svg>`;

export const renderBox = (source: string): Rendered =>
  source.includes("error")
    ? { ok: false, error: "Parse error on line 1", line: 1 }
    : {
        ok: true,
        data: { svg: SVG_OF(source), width: source.length * 10, height: 20 },
      };

/**
 * registerBoxes makes diagrams render as boxes, at once; it returns what
 * undoes it
 */
export const registerBoxes = () =>
  registerSource({
    node: "diagram",
    lang: "mermaid",
    label: () => "Flowchart",
    render: renderBox,
  });

/**
 * diagram makes a diagram of `source`
 */
export const diagram = (source: string, attrs?: Record<string, unknown>) =>
  createSourceBlock(schema, "diagram", source, attrs);

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { doc, p } from "../test/editor";
import { diagram, registerBoxes } from "../test/sources";
import { forgetRendered, requestRender, sourceKeyOf } from "../sources/store";
import { forgetVectors, isVector, vectorOf } from "./vectors";
import { flatten, type ImageSizes } from "./flatten";

// the size of a drawing of the store, at its own size
const sizes: ImageSizes = (src) => {
  const drawing = isVector(src) ? vectorOf(src) : undefined;
  return drawing && { width: drawing.width, height: drawing.height };
};

const items = (
  node: ReturnType<typeof doc>,
  view: Parameters<typeof flatten>[3] = {},
) => flatten(node, sizes, null, view).map((record) => record.build());

describe("source blocks on the pages", () => {
  let unregister: () => void;
  beforeEach(() => {
    unregister = registerBoxes();
  });
  afterEach(() => {
    unregister();
    forgetRendered();
    forgetVectors();
  });

  it("shows a closed one as its drawing, with its settings", () => {
    const block = diagram("A --> B", {
      width: "50%",
      caption: "The plan",
      align: "center",
    });
    const document = doc(p("before"), block);
    requestRender(block);
    const [, drawing] = items(document);
    expect(drawing).toMatchObject({
      kind: "image",
      pos: 8,
      src: sourceKeyOf(block),
      width: 70,
      height: 20,
      alt: "Flowchart",
      align: "center",
      share: 0.5,
      caption: "The plan",
    });
  });

  it("stands for it with its description until it's drawn", () => {
    const block = diagram("A --> B", { alt: "Two steps" });
    const [drawing] = items(doc(block));
    expect(drawing).toMatchObject({
      kind: "image",
      width: 0,
      alt: "Two steps",
    });
  });

  it("shows an open one as its source, as code, with its drawing below", () => {
    const block = diagram("A --> B");
    const document = doc(block, p("after"));
    requestRender(block);
    const [source, drawing] = items(document, { open: 0 });
    expect(source).toMatchObject({
      kind: "text",
      pos: 2,
      text: "A --> B",
      style: "code",
      top: false,
    });
    expect(drawing).toMatchObject({ kind: "image", pos: block.nodeSize - 1 });
    // positions in order, as the engine needs them
    expect(drawing.pos).toBeGreaterThan(source.pos);
  });

  it("shows what is wrong under the source, and the drawing it made last", () => {
    const good = diagram("A --> B");
    requestRender(good);
    const broken = diagram("A --> error");
    requestRender(broken);
    const shown = items(doc(broken), { open: 0, preview: sourceKeyOf(good) });
    expect(shown.map((item) => item.kind)).toEqual(["text", "image", "boxed"]);
    expect(shown[1]).toMatchObject({ src: sourceKeyOf(good) });
    expect(shown[2]).toMatchObject({ label: "Parse error on line 1" });
    // closed, it still shows its source and what is wrong
    expect(items(doc(broken)).map((item) => item.kind)).toEqual([
      "text",
      "boxed",
    ]);
  });

  it("exports a drawing, or the source of one that can't be drawn", () => {
    const good = diagram("A --> B");
    const broken = diagram("error");
    requestRender(good);
    requestRender(broken);
    const shown = items(doc(good, broken), { open: 0, export: true });
    expect(shown.map((item) => item.kind)).toEqual(["image", "text"]);
  });
});

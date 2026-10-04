import { Fragment, type Node, Slice } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import { afterEach, describe, expect, it } from "vitest";

import { type EmbedType, registerEmbedType } from "../../embeds/registry";
import { schema } from "../../markdown";
import { announcement, blockPicker } from "../../state";
import { flushPromises } from "../../test/async";
import { createState, createTestView, doc, p } from "../../test/editor";
import { box, boxType } from "../../test/embeds";
import { withNewIds } from "../plugins/embeds";
import { insertTopBlock } from "./contentBlocks";
import { editEmbed, makeEmbed } from "./embeds";

let unregister = () => {};
afterEach(() => {
  unregister();
  blockPicker.value = null;
  announcement.value = null;
});

/**
 * insertEmbed puts in a new embed of `type`, as the block picker does
 */
const insertEmbed = async (
  view: ReturnType<typeof createTestView>,
  type: EmbedType,
) => {
  const embed = await makeEmbed(type);
  if (embed) insertTopBlock(view, embed);
};

// the document's embed and where it is, or null
const embedOf = (view: ReturnType<typeof createTestView>) => {
  let found: { node: Node; pos: number } | null = null;
  view.state.doc.forEach((node, pos) => {
    if (node.type.name === "embed") found = { node, pos };
  });
  return found as { node: Node; pos: number } | null;
};

describe("makeEmbed", () => {
  it("puts in what its type makes", async () => {
    const type = boxType(["red"]);
    const view = createTestView(createState(doc(p())));
    await insertEmbed(view, type);
    expect(embedOf(view)!.node.attrs).toMatchObject({
      type: "org.blank.test/box@1",
      data: '{"color":"red"}',
      svg: box("red"),
      alt: "A red box",
    });
  });

  it("puts in nothing when the user gave up", async () => {
    const view = createTestView(createState(doc(p())));
    await insertEmbed(view, boxType([]));
    expect(embedOf(view)).toBeNull();
  });

  it("says when its type gave a drawing Blank can't show", async () => {
    const view = createTestView(createState(doc(p())));
    await insertEmbed(view, {
      ...boxType([]),
      edit: async () => ({ data: "{}", svg: "<html/>" }),
    });
    expect(embedOf(view)).toBeNull();
    expect(announcement.value?.text).toBe(
      "Box gave a drawing Blank can't show",
    );
  });
});

describe("editEmbed", () => {
  const selected = async (colors: string[]) => {
    const view = createTestView(createState(doc(p("a"), p())));
    await insertEmbed(view, boxType(["red"]));
    const { pos } = embedOf(view)!;
    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)),
    );
    return { view, type: boxType(colors) };
  };

  it("edits the selected embed with its type, keeping its id", async () => {
    const { view, type } = await selected(["blue"]);
    const id = embedOf(view)!.node.attrs.id;
    unregister = registerEmbedType(type);
    expect(editEmbed()(view.state, view.dispatch, view)).toBe(true);
    await flushPromises();
    expect(embedOf(view)!.node.attrs).toMatchObject({ id, svg: box("blue") });
    expect(view.state.selection).toBeInstanceOf(NodeSelection);
  });

  it("leaves an embed of a type Blank doesn't have alone", async () => {
    const { view } = await selected(["blue"]);
    expect(editEmbed()(view.state, view.dispatch, view)).toBe(false);
  });
});

describe("withNewIds", () => {
  it("gives a pasted embed a new id when the document has its id", () => {
    const embed = schema.nodes.embed.create({
      type: "a.b/c@1",
      id: "k3x9",
      svg: box("red"),
    });
    const slice = new Slice(Fragment.from(embed), 0, 0);
    const pasted = withNewIds(slice, new Set(["k3x9"])).content.child(0);
    expect(pasted.attrs.id).not.toBe("k3x9");
    expect(pasted.attrs.svg).toBe(box("red"));
    expect(withNewIds(slice, new Set(["other"]))).toBe(slice);
  });
});

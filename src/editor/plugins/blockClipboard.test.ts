import { describe, expect, it } from "vitest";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { createForm, schema } from "../../markdown";
import { doc, p, table, td, tr } from "../../test/editor";
import { RECIPE, RECIPE_KEY } from "../../test/forms";
import { blocksMarkdown } from "./blockClipboard";
import { tableClipboard } from "./tables/clipboard";

/**
 * copied returns the plain text the editor copies of `doc` from `from` to
 * `to`, or of the node at `from` when `to` is left out
 */
const copied = (node: ReturnType<typeof doc>, from: number, to?: number) => {
  const state = EditorState.create({ doc: node, plugins: [tableClipboard()] });
  const view = new EditorView(document.createElement("div"), { state });
  const selection =
    to === undefined
      ? NodeSelection.create(state.doc, from)
      : TextSelection.create(state.doc, from, to);
  const { text } = view.serializeForClipboard(selection.content());
  view.destroy();
  return text;
};

const recipeDoc = () =>
  schema.node("doc", { definitions: { [RECIPE_KEY]: RECIPE } }, [
    p("a"),
    createForm(RECIPE, RECIPE_KEY),
    p("b"),
  ]);

describe("the plain text of a copy", () => {
  it("is a table of contents' markdown", () => {
    const node = doc(p("a"), schema.node("toc", { depth: 2 }), p("b"));
    expect(copied(node, 3)).toBe(
      '<!-- blank:toc@1 depth="2" title="Contents" -->',
    );
  });

  it("is a form's markdown, with its definition", () => {
    const text = copied(recipeDoc(), 3);
    expect(text).toMatch(/^<!-- blank:form@1 /);
    expect(text).toContain("<!-- /blank:form -->");
    expect(text).toContain("<!-- blank:definitions@1 -->");
  });

  it("is the markdown of text around a block, with the text", () => {
    const node = doc(p("ab"), schema.node("toc"), p("cd"));
    expect(copied(node, 2, 7)).toBe(
      'b\n\n<!-- blank:toc@1 depth="3" title="Contents" -->\n\nc',
    );
  });

  it("is plain text, as before, for text and for text in a form", () => {
    const node = doc(p("ab"), p("cd"));
    expect(copied(node, 1, 7)).toBe("ab\n\ncd");
    // text inside the recipe's title, not the recipe
    const recipe = recipeDoc();
    let title = -1;
    recipe.descendants((child, pos) => {
      if (title < 0 && child.type.name === "heading") title = pos;
      return title < 0;
    });
    expect(
      blocksMarkdown(recipe.slice(title + 1, title + 1), recipe),
    ).toBeNull();
  });

  it("is tab-separated values for cells, as before", () => {
    const node = doc(table(tr(td("a"), td("b"))), p("x"));
    expect(copied(node, 0, node.child(0).nodeSize)).toBe("a\tb");
  });
});

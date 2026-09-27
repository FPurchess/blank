import { schema as stock } from "prosemirror-markdown";
import { Schema } from "prosemirror-model";

// Blank's markdown schema: the stock prosemirror-markdown schema, whose doc
// also keeps the file's frontmatter (the YAML block at its top) as it was
// written, or null if the file has none. Node types of two schemas can't be
// mixed, so the whole app uses this one (see ./index.ts).
export const schema = new Schema({
  nodes: stock.spec.nodes.update("doc", {
    ...stock.spec.nodes.get("doc"),
    attrs: { frontmatter: { default: null } },
  }),
  marks: stock.spec.marks,
});

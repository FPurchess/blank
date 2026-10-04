import type { TextSelection } from "prosemirror-state";

import { schema } from "../../../../markdown";

import type { BlockTransformer } from "../types";
import { replaceLineWith } from "./util";

// `[toc]` then Enter inserts a table of contents, as in Typora and Joplin;
// GitLab's `[[_TOC_]]` too
const reToc = /^(\[toc\]|\[\[_toc_\]\])$/i;

const _transformer: BlockTransformer<boolean> = {
  trigger: "enter",
  activate: (line: string) => reToc.test(line) || undefined,
  transform: (view) => {
    // a content block stands only at the top of the document
    const { $cursor } = view.state.selection as TextSelection;
    if ($cursor?.depth !== 1) return false;
    return replaceLineWith(view, schema.nodes.toc);
  },
};

export default _transformer;

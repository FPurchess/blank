import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { schema } from "prosemirror-markdown";

import type { BlockTransformer } from "../types";

const reHorizontalRule = /^(---|\*\*\*|___)$/;

type Props = boolean;

const _transformer: BlockTransformer<Props> = {
  trigger: "enter",
  activate: (line: string): Props | undefined =>
    reHorizontalRule.test(line) || undefined,
  transform: (view: EditorView): boolean => {
    const { $cursor } = view.state.selection as TextSelection;
    if (!$cursor || $cursor.parent.type !== schema.nodes.paragraph) {
      return false;
    }

    // replace the paragraph with the rule and an empty paragraph after it
    const from = $cursor.before();
    const tr = view.state.tr.replaceWith(from, $cursor.after(), [
      schema.nodes.horizontal_rule.create(),
      schema.nodes.paragraph.create(),
    ]);
    // the new paragraph starts after the rule (size 1) and its own opening
    tr.setSelection(TextSelection.create(tr.doc, from + 2));
    view.dispatch(tr.scrollIntoView());
    return true;
  },
};

export default _transformer;

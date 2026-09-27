import type { NodeType } from "prosemirror-model";
import { type Command, NodeSelection, TextSelection } from "prosemirror-state";
import { chainCommands, exitCode } from "prosemirror-commands";

import { schema } from "../../markdown";

/**
 * insertBlock inserts a block like a rule or a page break at the cursor,
 * splitting its paragraph, and puts the cursor in the paragraph after it, so
 * typing goes on below it instead of replacing it. A code block is left
 * first, as Mod-Enter always did there.
 */
export default (type: NodeType): Command =>
  chainCommands(exitCode, (state, dispatch) => {
    if (!dispatch) return true;
    const tr = state.tr.replaceSelectionWith(type.create());
    // the block ends up selected when nothing follows it in its parent
    if (tr.selection instanceof NodeSelection) {
      const after = tr.selection.to;
      if (!tr.doc.resolve(after).nodeAfter?.isTextblock) {
        tr.insert(after, schema.nodes.paragraph.create());
      }
      tr.setSelection(TextSelection.create(tr.doc, after + 1));
    }
    dispatch(tr.scrollIntoView());
    return true;
  });

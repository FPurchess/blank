import type { NodeType } from "prosemirror-model";
import type { Command } from "prosemirror-state";
import { chainCommands, exitCode } from "prosemirror-commands";

export default (node: NodeType): Command =>
  chainCommands(exitCode, (state, dispatch) => {
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(node.create()).scrollIntoView());
    }
    return true;
  });

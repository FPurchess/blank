import { NodeSpec } from 'prosemirror-model';
import { Command, Transaction } from 'prosemirror-state';
import { chainCommands, exitCode } from 'prosemirror-commands';

export default (node: NodeSpec): Command =>
  chainCommands(exitCode, (state, dispatch: (tr: Transaction) => void) => {
    if (dispatch) {
      dispatch(state.tr.replaceSelectionWith(node.create()).scrollIntoView());
    }
    return true;
  });

import { NodeSpec } from 'prosemirror-model';
import { Command } from 'prosemirror-state';
import { chainCommands, exitCode } from 'prosemirror-commands';

export default (node: NodeSpec): Command =>
  chainCommands(exitCode, (state, dispatch) => {
    if (dispatch) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      dispatch(state.tr.replaceSelectionWith(node.create()).scrollIntoView());
    }
    return true;
  });

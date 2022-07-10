import { Command } from 'prosemirror-state';

import { path } from '../state';

export default (): Command => (state, dispatch) => {
  if (dispatch) {
    dispatch(state.tr.delete(0, state.doc.content.size));
    path.value = null;
    return true;
  }

  return false;
};

import type { TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

import { displayMathFor, mathAllowedAt } from "../../../../math/commands";
import { dispatchCorrection } from "../history";
import type { BlockTransformer } from "../types";

// `$$` alone, or a formula between `$$`s on one line, e.g. "$$x^2$$"
const reDollars = /^\$\$$|^\$\$(.+)\$\$$/;

interface Props {
  source: string;
}

/**
 * `$$` + Enter (or `$$x$$` + Enter) makes display math, with its source
 * open for typing; a single undo restores the line as typed
 */
const _transformer: BlockTransformer<Props> = {
  trigger: "enter",
  activate: (line: string): undefined | Props => {
    const match = reDollars.exec(line);
    return match ? { source: (match[1] ?? "").trim() } : undefined;
  },
  transform: (view: EditorView, _line, { source }: Props): boolean => {
    const { $cursor } = view.state.selection as TextSelection;
    if (!$cursor || !mathAllowedAt(view.state)) return false;
    dispatchCorrection(
      view,
      displayMathFor(view.state, $cursor.before(), $cursor.after(), source),
    );
    return true;
  },
};

export default _transformer;

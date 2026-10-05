import type { Node, NodeType, ResolvedPos } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

/**
 * rangeIn returns the range of the selected blocks in the innermost node
 * around the whole selection that `test` takes, e.g. a list or a quote, or
 * null if there is none
 */
export const rangeIn = (state: EditorState, test: (node: Node) => boolean) => {
  const { $from, $to } = state.selection;
  return $from.blockRange($to, test);
};

/**
 * within tells whether `$pos` is inside a node of `type`
 */
export const within = ($pos: ResolvedPos, type: NodeType) => {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if ($pos.node(depth).type === type) return true;
  }
  return false;
};

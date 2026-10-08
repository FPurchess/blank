import { Plugin } from "prosemirror-state";
import { Decoration } from "prosemirror-view";

import { findPanel } from "../../../state";
import { closeFind } from "./commands";
import { findApply, findIdle, findKey, type FindState } from "./state";

/**
 * find looks for what the find panel asks for in the text of the tab, and
 * marks what it found (see ./state.ts); Esc in the text closes the panel
 */
export const find = () =>
  new Plugin<FindState>({
    key: findKey,
    state: { init: () => findIdle, apply: findApply },
    props: {
      // the matches show in the editor itself only without the engine; the
      // page view paints them from the same set (src/ui/pageMarks.ts)
      decorations: (state) => {
        const value = findKey.getState(state);
        if (!value?.active) return null;
        const current = value.matches[value.current];
        return current
          ? value.decorations.add(state.doc, [
              Decoration.inline(current.from, current.to, {
                class: "find-current",
              }),
            ])
          : value.decorations;
      },
      handleKeyDown: (view, event) => {
        if (event.key !== "Escape" || !findPanel.value) return false;
        return closeFind(false)(view.state, view.dispatch, view);
      },
    },
  });

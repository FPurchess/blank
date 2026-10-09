import { Plugin } from "prosemirror-state";

import { engineless } from "../../../engine/engine";
import { findPanel } from "../../../state";
import { closeFind } from "./commands";
import {
  currentDecorations,
  findApply,
  findIdle,
  findKey,
  type FindState,
} from "./state";

/**
 * find looks for what the find panel asks for in the text of the tab, and
 * marks what it found (see ./state.ts); Esc in the text closes the panel
 */
export const find = () =>
  new Plugin<FindState>({
    key: findKey,
    state: { init: () => findIdle, apply: findApply },
    props: {
      // the matches show in the editor itself only without the engine, and
      // while the panel is open; the page view paints them from the same
      // set (src/ui/pageMarks.ts)
      decorations: (state) => {
        const value = findKey.getState(state);
        if (!value?.active || !findPanel.value || !engineless()) return null;
        return value.decorations.add(state.doc, currentDecorations(value));
      },
      handleKeyDown: (view, event) => {
        if (event.key !== "Escape" || !findPanel.value) return false;
        return closeFind(false)(view.state, view.dispatch, view);
      },
    },
  });

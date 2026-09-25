import { Plugin, TextSelection } from "prosemirror-state";

import transformers from "./transformers";

export default () => {
  return new Plugin({
    props: {
      handleKeyDown: (view, event) => {
        if (
          event.key !== " " ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey
        ) {
          return;
        }

        if (!view.state.selection.empty) {
          return false;
        }
        const { $cursor } = view.state.selection as TextSelection;
        // transformers edit the text right before the cursor, so they only
        // apply when the cursor is at the end of its block
        if (!$cursor || $cursor.parentOffset !== $cursor.parent.content.size) {
          return false;
        }

        const text = $cursor.node().textContent;

        for (const name in transformers) {
          const transformer = transformers[name];
          const props = transformer.activate(text);
          if (props !== undefined) {
            console.log(`applying ${name}...`);
            if (transformer.transform(view, text, props)) {
              return true;
            }
          }
        }

        return false;
      },
    },
  });
};

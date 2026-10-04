import type { Command } from "prosemirror-state";

import { announce, wordCountCard } from "../../state";
import { wordCountOf, wordCountSummary } from "../../wordCount";

/**
 * showWordCount opens the word count card above the counter in the bottom
 * bar, which the next key closes again, and reads its numbers out to screen
 * readers, since the card never takes the focus
 */
export const showWordCount = (): Command => (state) => {
  wordCountCard.value = true;
  announce(wordCountSummary(wordCountOf(state)));
  return true;
};

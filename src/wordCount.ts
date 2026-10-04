import type { EditorState } from "prosemirror-state";

import { pageLayoutState, textContent } from "./state";

// How Blank counts a document: the words in the bottom bar, and the numbers
// of the word count card (src/ui/WordCountCard.vue), which the Word count
// command (src/editor/commands/wordCount.ts) also reads out. Not in src/ui,
// since editor code uses it too.

// words a minute, a common average for reading prose
const READING_SPEED = 230;

/**
 * countWords returns how many words `text` has: its runs of characters
 * between whitespace
 */
export const countWords = (text: string) => text.match(/\S+/g)?.length ?? 0;

/**
 * formatCount writes a number as the UI does, with thousands separated:
 * 1,498
 */
export const formatCount = (count: number) => count.toLocaleString("en");

/**
 * readingMinutes returns how long `words` take to read, at least a minute
 */
export const readingMinutes = (words: number) =>
  Math.max(1, Math.round(words / READING_SPEED));

export interface WordCount {
  words: number;
  // the characters of the text, spaces included
  characters: number;
  // how many pages it has, null without pages (without the layout engine)
  pages: number | null;
  // the words selected, none for a caret
  selected: number;
}

/**
 * wordCountOf counts the document of `state` as it is now: its text (as
 * textContent has it), its pages and the words of its selection
 */
export const wordCountOf = (state: EditorState): WordCount => {
  const { doc, selection } = state;
  return {
    words: countWords(textContent.value),
    characters: textContent.value.length,
    pages: pageLayoutState.value?.pages ?? null,
    selected: countWords(
      doc.textBetween(selection.from, selection.to, " ", " "),
    ),
  };
};

/**
 * wordCountRows returns the rows of the word count card: what each shows and
 * its value, "—" for what there is none of
 */
export const wordCountRows = (count: WordCount) =>
  [
    ["Words", formatCount(count.words)],
    ["Characters", formatCount(count.characters)],
    ["Pages", count.pages === null ? "—" : formatCount(count.pages)],
    ["Reading time", `${readingMinutes(count.words)} min`],
    [
      "Selection",
      count.selected ? `${formatCount(count.selected)} words` : "—",
    ],
  ] as const;

/**
 * wordCountSummary returns the card's numbers as one sentence for screen
 * readers, e.g. "348 words, 1,498 characters, 2 pages, 2 min to read"
 */
export const wordCountSummary = (count: WordCount) =>
  [
    `${formatCount(count.words)} words`,
    `${formatCount(count.characters)} characters`,
    ...(count.pages === null ? [] : [`${formatCount(count.pages)} pages`]),
    `${readingMinutes(count.words)} min to read`,
    ...(count.selected ? [`${formatCount(count.selected)} selected`] : []),
  ].join(", ");

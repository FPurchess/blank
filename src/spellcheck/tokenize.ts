import type { Node } from "prosemirror-model";
import { schema } from "prosemirror-markdown";

import type { SpellcheckConfig } from "../config";
import { isUrlLike, LEAF } from "../editor/plugins/autocomplete/context";

export interface Word {
  text: string;
  // doc positions of the word
  from: number;
  to: number;
  // the parts of a hyphenated word, e.g. "est" and "ce" of "est-ce". The word
  // is spelled correctly if either the whole word or all its parts are.
  parts?: Word[];
}

// chars that join two words into one the dictionary checks as a whole, e.g.
// "well-known", "don't" or "l’homme"
const JOINERS = new Set(["-", "'", "’"]);

const reWordChars = /[\p{L}\p{M}\p{N}]+/gu;
const reDigit = /\p{N}/u;
const reLetter = /\p{L}/u;

const segmenters = new Map<string, Intl.Segmenter | null>();

/**
 * segmenter returns a word segmenter for `lang`, or null if the webview has
 * none
 */
const segmenter = (lang: string) => {
  if (!segmenters.has(lang)) {
    let value: Intl.Segmenter | null = null;
    if (typeof Intl.Segmenter === "function") {
      try {
        value = new Intl.Segmenter(lang, { granularity: "word" });
      } catch {
        value = new Intl.Segmenter(undefined, { granularity: "word" });
      }
    }
    segmenters.set(lang, value);
  }
  return segmenters.get(lang)!;
};

/**
 * segments returns the words in `text` as [index, word] pairs
 */
const segments = (text: string, lang: string): [number, string][] => {
  const words = segmenter(lang);
  if (words) {
    return [...words.segment(text)]
      .filter((segment) => segment.isWordLike)
      .map((segment) => [segment.index, segment.segment]);
  }
  return [...text.matchAll(reWordChars)].map((m) => [m.index, m[0]]);
};

/**
 * blockText returns the text of a textblock where every char matches one doc
 * position: leaf nodes become LEAF, and inline code becomes spaces, since it is
 * never checked
 */
export const blockText = (block: Node) => {
  let text = "";
  block.forEach((child) => {
    if (child.isText) {
      const content = child.text ?? "";
      text += schema.marks.code.isInSet(child.marks)
        ? " ".repeat(content.length)
        : content;
    } else {
      text += LEAF.repeat(child.nodeSize);
    }
  });
  return text;
};

/**
 * urlRanges returns the [from, to] ranges of the whitespace separated tokens
 * in `text` that look like URLs or email addresses
 */
const urlRanges = (text: string) =>
  [...text.matchAll(/[^\s￼]+/g)]
    .filter((m) => isUrlLike(m[0]))
    .map((m) => [m.index, m.index + m[0].length]);

/**
 * checkable returns whether spelling applies to `word`
 */
const checkable = (word: string, config: SpellcheckConfig) => {
  if (!reLetter.test(word)) return false;
  if (config.ignoreWordsWithNumbers && reDigit.test(word)) return false;
  if (
    config.ignoreUppercase &&
    word.length > 1 &&
    word === word.toUpperCase() &&
    word !== word.toLowerCase()
  ) {
    return false;
  }
  return true;
};

/**
 * words returns the words to check in the textblock `block`, whose content
 * starts at the doc position `start`
 */
export const words = (
  block: Node,
  start: number,
  lang: string,
  config: SpellcheckConfig,
): Word[] => {
  if (!block.isTextblock || block.type.spec.code) return [];
  const text = blockText(block);

  // join words separated by a single hyphen or apostrophe
  const joined: [number, number][][] = [];
  for (const [index, word] of segments(text, lang)) {
    const last = joined[joined.length - 1];
    const end = last?.[last.length - 1][1];
    if (end !== undefined && index === end + 1 && JOINERS.has(text[end])) {
      last.push([index, index + word.length]);
    } else {
      joined.push([[index, index + word.length]]);
    }
  }

  const urls = urlRanges(text);
  const toWord = ([from, to]: [number, number]): Word => ({
    text: text.slice(from, to),
    from: start + from,
    to: start + to,
  });
  return joined
    .map((pieces): [number, number][] => {
      // apostrophes join into one word: "rock’n’roll", "l’homme"
      const parts: [number, number][] = [];
      for (const piece of pieces) {
        const previous = parts[parts.length - 1];
        if (previous && text[piece[0] - 1] !== "-") previous[1] = piece[1];
        else parts.push([...piece]);
      }
      return parts;
    })
    .filter((parts) => {
      const [from, to] = [parts[0][0], parts[parts.length - 1][1]];
      return !urls.some(([a, b]) => from < b && to > a);
    })
    .map((parts): Word => {
      const word = toWord([parts[0][0], parts[parts.length - 1][1]]);
      if (parts.length === 1) return word;
      return { ...word, parts: parts.map(toWord) };
    })
    .filter((word) => checkable(word.text, config))
    .map((word) =>
      word.parts
        ? {
            ...word,
            parts: word.parts.filter((p) => checkable(p.text, config)),
          }
        : word,
    );
};

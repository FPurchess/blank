import type { Transaction } from "prosemirror-state";

import {
  CLOSERS,
  OPENERS,
  PUNCTUATION,
  isUrlLike,
  strip,
  tokenSpan,
  type Context,
} from "../context";
import type { InlineTransformer } from "../types";

// Markdown emphasis markers around a word, e.g. "**bold**"
const markers = "*_`";
const reWord = /^\p{L}+(?:['’-]\p{L}+)*$/u;
const reLower = /^\p{Ll}/u;
const reTwoCapitals = /^\p{Lu}{2}\p{Ll}+$/u;
const rePluralAcronym = /^\p{Lu}{2,}s$/u;
const reSentenceEnd = /[.!?]$/;

/**
 * startsSentence returns whether the text `before` a word ends a sentence,
 * i.e. is empty or ends with . ! or ? after anything but an abbreviation
 */
const startsSentence = (ctx: Context, before: string) => {
  const text = before.trimEnd();
  if (!text) return true;
  // a line break isn't a sentence end
  if (text.endsWith("￼")) return false;

  const end = strip({ text, index: 0 }, "", CLOSERS).text;
  if (!reSentenceEnd.test(end)) return false;
  if (end.endsWith("..")) return false;

  const previous = strip(
    { text: /\S*$/.exec(end)![0], index: 0 },
    OPENERS + markers,
    "",
  ).text.toLowerCase();
  // ordinals and list numbers such as "1." or "3."
  if (/^\p{N}+\.$/u.test(previous)) return false;
  return !ctx.rules.abbreviations.some(
    (abbreviation) => abbreviation.toLowerCase() === previous,
  );
};

/**
 * capitalize capitalizes the first word of a sentence and corrects TWo
 * INitial CApitals once the word is complete
 */
const capitalize: InlineTransformer = (ctx: Context) => {
  if (!ctx.config.capitalize || !ctx.whitespace || isUrlLike(ctx.token)) {
    return;
  }

  const word = strip(
    tokenSpan(ctx),
    OPENERS + markers,
    CLOSERS + PUNCTUATION + markers,
  );
  if (!reWord.test(word.text)) return;

  let fix: ((tr: Transaction, pos: number) => void) | undefined;
  if (
    reLower.test(word.text) &&
    startsSentence(ctx, ctx.textBefore.slice(0, ctx.tokenIndex))
  ) {
    const upper = word.text[0].toLocaleUpperCase(ctx.lang);
    fix = (tr, pos) => tr.insertText(upper, pos, pos + 1);
  } else if (
    reTwoCapitals.test(word.text) &&
    !rePluralAcronym.test(word.text) &&
    !ctx.rules.twoCapitalsExceptions.includes(word.text)
  ) {
    const lower = word.text[1].toLocaleLowerCase(ctx.lang);
    fix = (tr, pos) => tr.insertText(lower, pos + 1, pos + 2);
  }
  if (!fix) return;

  const pos = ctx.start + word.index;
  return (tr) => {
    // earlier corrections in the same transaction may have moved the word
    const mapped = tr.mapping.map(pos, -1);
    const current = tr.doc.textBetween(mapped, mapped + word.text.length);
    if (current === word.text) fix(tr, mapped);
  };
};

export default capitalize;

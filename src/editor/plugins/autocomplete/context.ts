import type { EditorState, TextSelection } from "prosemirror-state";
import type { ResolvedPos } from "prosemirror-model";
import { schema } from "prosemirror-markdown";

import { config, type AutocorrectConfig } from "../../../config";
import { language } from "../../../state";
import type { LanguageRules } from "./languages/types";
import { getRules } from "./languages/lookup";

// placeholder for leaf inline nodes (hard_break, image), so every char of the
// text before the cursor matches one doc position
export const LEAF = "￼";

// chars typed into the text that apply autocorrect, following LibreOffice's
// IsAutoCorrectChar minus the chars that only drive features Blank lacks and
// minus "-", ">" and "=", which continue tokens like "<-" into "<--"
export const TEXT_TRIGGERS = new Set([" ", ".", ",", ";", ":", "?", "!"]);

// quotes and brackets ignored around a token, see LibreOffice's
// sImplSttSkipChars and sImplEndSkipChars
export const OPENERS = "\"'([{„“‚‘«‹»›";
export const CLOSERS = "\"')]}”’“‘»›«‹";
export const PUNCTUATION = ".,;:!?";

/**
 * charClass returns a regular expression character class matching any of
 * `chars`
 */
export const charClass = (chars: string) =>
  `[${chars.replace(/[\\\]^-]/g, "\\$&")}]`;

/**
 * count returns how often `char` occurs in `text`
 */
export const count = (text: string, char: string) =>
  text.split(char).length - 1;

/**
 * Trigger is a char from TEXT_TRIGGERS, "Enter" or "Tab"
 */
export type Trigger = string;

export interface Context {
  state: EditorState;
  $cursor: ResolvedPos;
  // doc position of the start of the cursor's textblock content
  start: number;
  // text of the textblock before the cursor
  textBefore: string;
  // text since the last whitespace before the cursor
  token: string;
  // index of `token` in `textBefore`
  tokenIndex: number;
  trigger: Trigger;
  // whether the trigger ends a word: Space, Tab or Enter
  whitespace: boolean;
  lang: string;
  rules: LanguageRules;
  config: AutocorrectConfig;
}

const reToken = /[^\s￼]*$/;

/**
 * inCode returns whether the cursor is in a code block or inline code
 */
const inCode = (state: EditorState, $cursor: ResolvedPos) =>
  !!$cursor.parent.type.spec.code ||
  !!schema.marks.code.isInSet(state.storedMarks ?? $cursor.marks());

/**
 * createContext returns the context autocorrect works in when `trigger` is
 * typed, or undefined if autocorrect doesn't apply at the cursor
 */
export const createContext = (
  state: EditorState,
  trigger: Trigger,
): Context | undefined => {
  const { $cursor } = state.selection as TextSelection;
  if (!$cursor || !$cursor.parent.isTextblock || inCode(state, $cursor)) {
    return undefined;
  }

  const textBefore = $cursor.parent.textBetween(
    0,
    $cursor.parentOffset,
    undefined,
    LEAF,
  );
  const token = reToken.exec(textBefore)![0];

  return {
    state,
    $cursor,
    start: $cursor.start(),
    textBefore,
    token,
    tokenIndex: textBefore.length - token.length,
    trigger,
    whitespace: trigger === " " || trigger === "Enter" || trigger === "Tab",
    lang: language.value,
    rules: getRules(language.value),
    config: config.value.autocorrect,
  };
};

export interface Span {
  text: string;
  // index of `text` in `textBefore`
  index: number;
}

/**
 * strip removes the leading chars in `lead` and trailing chars in `trail`
 * from `span`
 */
export const strip = (span: Span, lead: string, trail: string): Span => {
  let from = 0;
  let to = span.text.length;
  while (from < to && lead.includes(span.text[from])) from++;
  while (to > from && trail.includes(span.text[to - 1])) to--;
  return { text: span.text.slice(from, to), index: span.index + from };
};

/**
 * tokenSpan returns the token of `ctx` as a span
 */
export const tokenSpan = (ctx: Context): Span => ({
  text: ctx.token,
  index: ctx.tokenIndex,
});

/**
 * isUrlLike returns whether `text` looks like a URL or an email address,
 * which autocorrect must leave alone
 */
export const isUrlLike = (text: string) => /:\/\/|^www\.|@/i.test(text);

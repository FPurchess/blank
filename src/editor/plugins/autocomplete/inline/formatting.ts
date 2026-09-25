import { schema } from "prosemirror-markdown";
import type { MarkType } from "prosemirror-model";

import { CLOSERS, strip, type Context } from "../context";
import type { InlineTransformer } from "../types";

// what may come right before an opening marker, so snake_case and 2*3*4 stay
const before = "(?:^|(?<=[\\s\\ufffc([{\"'„“‚‘«‹]))";

interface Format {
  re: RegExp;
  marker: string;
  mark: MarkType;
}

const formats: Format[] = [
  {
    // `code` may hold other markers
    re: new RegExp(
      `${before}\`([^\`\\s\\ufffc](?:[^\`\\ufffc]*[^\`\\s\\ufffc])?)\`$`,
    ),
    marker: "`",
    mark: schema.marks.code,
  },
  {
    // **strong** must not contain "**"
    re: new RegExp(
      `${before}\\*\\*([^*\\s\\ufffc](?:(?:(?!\\*\\*)[^\\ufffc])*[^*\\s\\ufffc])?)\\*\\*$`,
    ),
    marker: "**",
    mark: schema.marks.strong,
  },
  {
    re: new RegExp(
      `${before}\\*([^*\\s\\ufffc](?:[^*\\ufffc]*[^*\\s\\ufffc])?)\\*$`,
    ),
    marker: "*",
    mark: schema.marks.em,
  },
  {
    re: new RegExp(
      `${before}_([^_\\s\\ufffc](?:[^_\\ufffc]*[^_\\s\\ufffc])?)_$`,
    ),
    marker: "_",
    mark: schema.marks.em,
  },
];

/**
 * formatting applies Markdown emphasis typed around text: **strong**,
 * *em*, _em_ and `code`. The markers are removed.
 */
const formatting: InlineTransformer = (ctx: Context) => {
  if (!ctx.config.formatting) return;

  // the closing marker may be followed by quotes and brackets: (*em*)
  const text = strip({ text: ctx.textBefore, index: 0 }, "", CLOSERS).text;
  for (const { re, marker, mark } of formats) {
    const match = re.exec(text);
    if (!match) continue;

    const from = ctx.start + match.index;
    const content = match[1];
    const contentTo = from + marker.length + content.length;
    return (tr) => {
      tr.delete(contentTo, contentTo + marker.length);
      tr.delete(from, from + marker.length);
      tr.addMark(from, from + content.length, mark.create());
      // stop typing on in the mark after a trigger that inserts no char
      tr.removeStoredMark(mark);
    };
  }
};

export default formatting;

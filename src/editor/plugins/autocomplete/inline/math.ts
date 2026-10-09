import {
  escaped,
  MATH_REACH,
  scanDollarMath,
} from "../../../../markdown/math/scan";
import { LEAF } from "../../../text";
import { mathInlineKey } from "../../mathInline";
import type { Context } from "../context";
import type { InlineTransformer } from "../types";

/**
 * math turns `$…$` into inline math once the trigger after its closing `$`
 * is typed, where pandoc's rules read it as math (see
 * src/markdown/math/scan.ts): "$5 and $10" stays text. Not math that was
 * just turned back into its text, until it is changed.
 */
const math: InlineTransformer = (ctx: Context) => {
  if (!ctx.config.math) return;
  const text = ctx.textBefore;
  if (!text.endsWith("$") || escaped(text, text.length - 1)) return;
  for (
    let at = text.length - 2;
    at >= Math.max(0, text.length - MATH_REACH);
    at--
  ) {
    if (text[at] !== "$") continue;
    const match = scanDollarMath(text, at);
    if (!match || match.to !== text.length) continue;
    // never across a hard break, a picture or another formula
    if (match.source.includes(LEAF)) return;
    const from = ctx.start + match.from;
    const to = ctx.start + match.to;
    const unwrapped = mathInlineKey.getState(ctx.state);
    if (
      unwrapped?.from === from &&
      unwrapped.to === to &&
      ctx.state.doc.textBetween(from, to) === unwrapped.text
    ) {
      return;
    }
    const { schema } = ctx.state;
    return (tr) => {
      const marks = ctx.state.doc.resolve(from + 1).marks();
      tr.replaceWith(
        from,
        to,
        schema.nodes.math_inline.create(
          null,
          match.source ? schema.text(match.source) : null,
          marks,
        ),
      );
    };
  }
};

export default math;

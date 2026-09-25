import { schema } from "prosemirror-markdown";

import { OPENERS, strip, tokenSpan, type Context } from "../context";
import type { InlineTransformer } from "../types";

const reUrl =
  /^(https?:\/\/[^\s/?#]+\.[^\s]+|https?:\/\/localhost\S*|www\.[^\s.]+\.[^\s]+)$/i;
const reEmail = /^[\w.+-]+@[\w-]+(\.[\w-]+)+$/;
// chars after a URL that belong to the sentence rather than the URL
const trailing = ".,;:!?\"'”’»›";

/**
 * trimUrl removes trailing punctuation from `url`. A closing parenthesis only
 * stays when it closes one inside the URL, as in Wikipedia URLs.
 */
const trimUrl = (url: string) => {
  let end = url.length;
  for (;;) {
    const char = url[end - 1];
    const text = url.slice(0, end);
    if (trailing.includes(char)) {
      end--;
    } else if (
      char === ")" &&
      text.split("(").length - 1 < text.split(")").length - 1
    ) {
      end--;
    } else {
      return text;
    }
  }
};

/**
 * autolink links a URL or an email address when the word after it starts
 */
const autolink: InlineTransformer = (ctx: Context) => {
  if (!ctx.config.links || !ctx.whitespace) return;

  const span = strip(tokenSpan(ctx), OPENERS, "");
  const text = trimUrl(span.text);
  let href: string;
  if (reUrl.test(text)) {
    href = /^www\./i.test(text) ? `https://${text}` : text;
  } else if (reEmail.test(text)) {
    href = `mailto:${text}`;
  } else {
    return;
  }

  const from = ctx.start + span.index;
  const to = from + text.length;
  if (ctx.state.doc.rangeHasMark(from, to, schema.marks.link)) return;
  return (tr) => {
    tr.addMark(from, to, schema.marks.link.create({ href }));
  };
};

export default autolink;

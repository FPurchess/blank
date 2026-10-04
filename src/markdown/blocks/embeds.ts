import type { Attrs, Node } from "prosemirror-model";

import { parseLength } from "../../layout/units";
import { extraArgs } from "./atoms";
import { closeMarker, fenceFor, formatMarker } from "./args";
import { sanitizeSvg } from "./svg";

// Embeds: content of another app, such as a drawing of draw.io or
// Excalidraw, which a plugin (later) makes and edits. In the file:
//
//   <!-- blank:embed@1 type="org.excalidraw/scene@1" id="k3x9" width="120mm" -->
//
//   ````json
//   { the app's own data, uncompressed }
//   ````
//
//   ````svg
//   <svg …>how it looks, cleaned (./svg.ts)</svg>
//   ````
//
//   <!-- /blank:embed -->
//
// The data is the app's to read; Blank keeps it as written. The drawing is
// what Blank shows, prints and exports, so an embed looks the same with or
// without its plugin. One whose drawing is missing or can't be kept is a
// block Blank can't show, kept as written.

// the arguments an embed knows, in the order they're written
export const EMBED_ARGS = ["type", "id", "width", "alt"] as const;

// a type of embed: the plugin's reverse-DNS namespace, a name and the
// version of its data
const TYPE = /^[a-z0-9][a-z0-9.-]{0,60}\/[a-z0-9][a-z0-9-]{0,60}@\d{1,4}$/;

// the languages of the data an embed keeps
const DATA_LANGS = ["json", "xml"] as const;

export interface EmbedAttrs {
  type: string;
  // tells the embeds of a document apart, e.g. in Word
  id: string;
  // how wide it is shown, e.g. "120mm"; "" for as wide as the drawing
  width: string;
  // what it shows, for screen readers and where it can't be shown
  alt: string;
  data: string;
  lang: (typeof DATA_LANGS)[number];
  svg: string;
  extra: Record<string, string>;
}

/**
 * newEmbedId returns an id for an embed: a few letters and digits
 */
export const newEmbedId = () =>
  Math.random().toString(36).slice(2, 8).padEnd(6, "0");

/**
 * checkEmbed returns the attributes of an embed from what was read, or null
 * if they can't be one: no type, no drawing, or a width that isn't a
 * length
 */
export const checkEmbed = (
  args: Record<string, string>,
  data: { text: string; lang: string } | null,
  svg: string,
): EmbedAttrs | null => {
  const { type, id = "", width = "", alt = "" } = args;
  if (!type || !TYPE.test(type)) return null;
  if (width && parseLength(width) === undefined) return null;
  if (data && !(DATA_LANGS as readonly string[]).includes(data.lang)) {
    return null;
  }
  const clean = sanitizeSvg(svg);
  if (!clean) return null;
  return {
    type,
    id: /^[a-z0-9-]{1,32}$/i.test(id) ? id : newEmbedId(),
    width,
    alt,
    data: data?.text ?? "",
    lang: (data?.lang as EmbedAttrs["lang"] | undefined) ?? "json",
    svg: clean,
    extra: extraArgs(args, EMBED_ARGS),
  };
};

/**
 * writeEmbed writes an embed as the file holds it, see the comment on top
 */
export const writeEmbed = (attrs: Attrs) => {
  const embed = attrs as EmbedAttrs;
  const args: Record<string, string> = {
    ...extraArgs(embed.extra, EMBED_ARGS),
    type: embed.type,
    id: embed.id,
    ...(embed.width ? { width: embed.width } : {}),
    ...(embed.alt ? { alt: embed.alt } : {}),
  };
  const fence = (lang: string, text: string) => {
    const marks = fenceFor(text);
    return `${marks}${lang}\n${text.replace(/\n$/, "")}\n${marks}`;
  };
  return [
    formatMarker({ name: "embed", format: 1, args }, EMBED_ARGS),
    ...(embed.data ? [fence(embed.lang, embed.data)] : []),
    fence("svg", embed.svg),
    closeMarker("embed"),
  ].join("\n\n");
};

/**
 * embedSrc returns the drawing of an embed as an image's src, a data: URL,
 * which the page view, the PDF and Word show as they show images
 */
export const embedSrc = (node: Node) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(node.attrs.svg as string)}`;

/**
 * embedLabel returns what an embed is called, for screen readers and its
 * box: its alt text, or its type
 */
export const embedLabel = (node: Node) =>
  (node.attrs.alt as string) || `Embedded ${node.attrs.type as string}`;

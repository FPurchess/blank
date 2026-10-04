// The marker lines of Blank's content blocks: a whole line holding an HTML
// comment, `<!-- blank:NAME@FORMAT key="value" … -->` to open a block (or to
// be one), `<!-- /blank:NAME -->` to close it. FORMAT versions the block's own
// syntax. Values are always in double quotes, with `& " < >`, line breaks
// and dashes next to each other written as character references, so `--`
// and `-->` never appear inside one, and a marker stays on its line.

export interface Marker {
  // a closing marker, `<!-- /blank:NAME -->`
  close: boolean;
  name: string;
  // the version of the block's syntax, null if the marker has none
  format: number | null;
  args: Record<string, string>;
}

const MARKER = /^<!--\s*(\/?)blank:([a-z][a-z-]*)(?:@(\d+))?(.*?)\s*-->\s*$/;
const ARG = /\s+([a-z][a-z0-9-]*)="([^"]*)"/gy;

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  '"': "&quot;",
  "<": "&lt;",
  ">": "&gt;",
  "-": "&#45;",
  "\n": "&#10;",
  "\r": "&#13;",
};
const UNESCAPES: Record<string, string> = Object.fromEntries(
  Object.entries(ESCAPES).map(([char, reference]) => [reference, char]),
);

// a dash only next to another, as a comment ends at `--`: `recipe-simple`
// stays as it is
const escape = (value: string) =>
  value.replace(/[&"<>\n\r]|-(?=-)|(?<=-)-/g, (char) => ESCAPES[char]);
const unescape = (value: string) =>
  value.replace(
    /&(?:amp|quot|lt|gt|#45|#10|#13);/g,
    (reference) => UNESCAPES[reference],
  );

/**
 * parseArgs reads the arguments of a marker, ` key="value" …`, or returns
 * null if they aren't all of that form
 */
export const parseArgs = (text: string): Record<string, string> | null => {
  const args: Record<string, string> = {};
  ARG.lastIndex = 0;
  let end = 0;
  for (let match = ARG.exec(text); match; match = ARG.exec(text)) {
    // a key given twice makes the marker unreadable, not its last value win
    if (Object.hasOwn(args, match[1])) return null;
    args[match[1]] = unescape(match[2]);
    end = ARG.lastIndex;
  }
  return text.slice(end).trim() === "" ? args : null;
};

/**
 * formatArgs writes arguments as a marker holds them: in the order of `order`
 * first, then the others in theirs
 */
export const formatArgs = (
  args: Record<string, string>,
  order: readonly string[] = [],
): string => {
  const keys = [
    ...order.filter((key) => Object.hasOwn(args, key)),
    ...Object.keys(args).filter((key) => !order.includes(key)),
  ];
  return keys.map((key) => ` ${key}="${escape(args[key])}"`).join("");
};

/**
 * parseMarker reads a marker line, or returns null if `line` isn't one
 */
export const parseMarker = (line: string): Marker | null => {
  const match = MARKER.exec(line);
  if (!match) return null;
  const [, slash, name, format, rest] = match;
  const args = parseArgs(rest);
  if (!args) return null;
  const close = slash === "/";
  // a closing marker has neither a format nor arguments
  if (close && (format !== undefined || Object.keys(args).length > 0)) {
    return null;
  }
  return {
    close,
    name,
    format: format === undefined ? null : Number(format),
    args,
  };
};

/**
 * closeMarker writes the line that closes the block `name`
 */
export const closeMarker = (name: string) => `<!-- /blank:${name} -->`;

/**
 * formatMarker writes the line that opens a block, or is one
 */
export const formatMarker = (
  marker: Omit<Marker, "close">,
  order: readonly string[] = [],
): string =>
  `<!-- blank:${marker.name}${marker.format === null ? "" : `@${marker.format}`}${formatArgs(marker.args, order)} -->`;

/**
 * looksLikeMarker tells whether `line` is meant as a marker, readable or not:
 * a comment that starts with a name after `blank:` or `/blank:`, unlike a
 * note such as `<!-- blank: fill in later -->`. Such a line always ends the
 * block before it, so a marker can't become part of a paragraph.
 */
export const looksLikeMarker = (line: string) =>
  /^<!--\s*\/?blank:[a-z]/.test(line) && /-->\s*$/.test(line);

/**
 * fenceFor returns a code fence for `content`: at least four backticks, and
 * more than any run of backticks in it, so that the content can't close it
 */
export const fenceFor = (content: string): string => {
  const longest = Math.max(
    0,
    ...Array.from(content.matchAll(/`+/g), (match) => match[0].length),
  );
  return "`".repeat(Math.max(4, longest + 1));
};

// The placeholders of headers and footers: {page}, {pages}, {title},
// {author}, {chapter} (the heading 1 of the page), {date} and {file}. The
// PDF writes in their values, the Word export fields Word fills in itself.
// `{{` writes a `{`.

export const FIELDS = [
  "page",
  "pages",
  "title",
  "author",
  "chapter",
  "date",
  "file",
] as const;
export type Field = (typeof FIELDS)[number];

// a run of text, or a placeholder
export type Segment = string | { field: Field };

const TOKEN = new RegExp(`\\{\\{|\\{(${FIELDS.join("|")})\\}`, "g");

/**
 * segments splits the text of a header or footer slot into text and
 * placeholders; anything else in braces stays text
 */
export const segments = (text: string): Segment[] => {
  const result: Segment[] = [];
  let run = "";
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    run += text.slice(last, match.index);
    last = match.index + match[0].length;
    if (match[1] === undefined) {
      run += "{";
      continue;
    }
    if (run) result.push(run);
    run = "";
    result.push({ field: match[1] as Field });
  }
  run += text.slice(last);
  if (run) result.push(run);
  return result;
};

/**
 * expand writes the values into the placeholders of a slot
 */
export const expand = (text: string, values: Record<Field, string>) =>
  segments(text)
    .map((segment) =>
      typeof segment === "string" ? segment : values[segment.field],
    )
    .join("");

/**
 * escape makes text a slot shows as it is, with its braces
 */
export const escape = (text: string) => text.replace(/\{/g, "{{");

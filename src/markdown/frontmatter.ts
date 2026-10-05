import type { Node } from "prosemirror-model";
import { type Document, isMap, parse, parseDocument } from "yaml";

// Frontmatter is the YAML block between two `---` lines at the very top of a
// markdown file, which pandoc, Obsidian and static site generators read. Blank
// keeps it exactly as written, and reads a few properties from it.

// the opening line, the YAML and the closing `---` (or `...`) line
const FENCE =
  /^\uFEFF?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/;

/**
 * isFrontmatter checks whether `yaml` is a frontmatter block: a mapping of
 * keys, or nothing at all. Anything else (e.g. a rule followed by a line of
 * text) is markdown. A mapping with errors is frontmatter too, so saving
 * keeps it as it was instead of turning it into text; readFrontmatter reports
 * that it can't be read.
 */
const isFrontmatter = (yaml: string) => {
  if (yaml.trim() === "") return true;
  return isMap(parseDocument(yaml).contents);
};

/**
 * frontmatterOf returns the frontmatter of a document as written, without
 * its `---` lines, or null if it has none
 */
export const frontmatterOf = (doc: Node): string | null =>
  (doc.attrs.frontmatter as string | null | undefined) ?? null;

/**
 * splitFrontmatter separates the frontmatter of a markdown file from its body
 * @param text the markdown file
 * @returns the frontmatter with LF line endings, or null if there is none,
 *   and the markdown after it
 */
export const splitFrontmatter = (
  text: string,
): { frontmatter: string | null; body: string } => {
  const match = FENCE.exec(text);
  const yaml = match?.[1] ?? "";
  if (!match || !isFrontmatter(yaml)) return { frontmatter: null, body: text };
  return {
    frontmatter: yaml.replace(/\r\n/g, "\n"),
    body: text.slice(match[0].length),
  };
};

/**
 * joinFrontmatter puts the frontmatter back on top of the markdown
 */
export const joinFrontmatter = (frontmatter: string | null, body: string) => {
  if (frontmatter === null) return body;
  const yaml = frontmatter === "" ? "" : `${frontmatter}\n`;
  return `---\n${yaml}---\n${body ? `\n${body}` : ""}`;
};

type Data = Record<string, unknown>;

const isData = (value: unknown): value is Data =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * readFrontmatter reads the keys of the frontmatter
 * @param frontmatter the frontmatter, or null
 * @returns its keys and values, none for no or empty frontmatter, or
 *   undefined if it can't be read
 */
export const readFrontmatter = (
  frontmatter: string | null,
): Data | undefined => {
  if (frontmatter === null || frontmatter.trim() === "") return {};
  let data: unknown;
  try {
    data = parse(frontmatter);
  } catch {
    return undefined;
  }
  // e.g. only comments
  if (data === null) return {};
  return isData(data) ? data : undefined;
};

export interface DocumentProperties {
  title?: string;
  author?: string;
}

// a text value, or the values of a list joined, e.g. several authors
const text = (value: unknown): string | undefined => {
  if (typeof value === "string" || typeof value === "number") {
    return String(value).trim() || undefined;
  }
  if (Array.isArray(value)) {
    return text(
      value
        .map((item) => text(item))
        .filter(Boolean)
        .join(", "),
    );
  }
};

/**
 * propertiesOf returns the title and author among the keys of the frontmatter
 */
const propertiesOf = (data: Data): DocumentProperties => {
  const title = text(data.title);
  const author = text(data.author);
  return { ...(title ? { title } : {}), ...(author ? { author } : {}) };
};

/**
 * readProperties reads the title and author from the frontmatter
 * @param frontmatter the frontmatter, or null
 * @returns the properties that are set; none if it can't be read
 */
export const readProperties = (
  frontmatter: string | null,
): DocumentProperties => propertiesOf(readFrontmatter(frontmatter) ?? {});

/**
 * frontmatterError checks frontmatter typed by the user
 * @param yaml the frontmatter, without the `---` lines around it
 * @returns what is wrong with it, or null if it can be written
 */
export const frontmatterError = (yaml: string): string | null => {
  // the file would end the frontmatter there
  if (/^(---|\.\.\.)\s*$/m.test(yaml)) {
    return "A line with only --- or ... would end the properties";
  }
  const document = parseDocument(yaml);
  const [error] = document.errors;
  if (error) return error.message.split("\n")[0];
  const { contents } = document;
  return contents === null || isMap(contents)
    ? null
    : "The properties must be names with values, like title: My text";
};

/**
 * updateFrontmatter changes the frontmatter as a YAML document, which keeps
 * its other keys, their order and its comments. Frontmatter that can't be
 * read is left as it is, since changing it could destroy what was written.
 * @param frontmatter the frontmatter, or null
 * @param change changes the document and returns whether it did
 * @returns the frontmatter, or null if nothing is left
 */
export const updateFrontmatter = (
  frontmatter: string | null,
  change: (document: Document) => boolean,
): string | null => {
  const document = parseDocument(frontmatter ?? "");
  const { contents } = document;
  if (document.errors.length || (contents !== null && !isMap(contents))) {
    return frontmatter;
  }
  if (!change(document)) return frontmatter;
  const map = document.contents;
  // no `---` lines around nothing are left behind
  if (isMap(map) && map.items.length === 0) return null;
  return document
    .toString({ lineWidth: 0, flowCollectionPadding: false })
    .replace(/\n$/, "");
};

/**
 * setProperties sets or removes top-level keys of the frontmatter, see
 * updateFrontmatter
 * @param frontmatter the frontmatter, or null
 * @param values the keys to set; undefined removes a key
 */
export const setProperties = (
  frontmatter: string | null,
  values: Record<string, unknown>,
): string | null =>
  updateFrontmatter(frontmatter, (document) => {
    let changed = false;
    for (const [key, value] of Object.entries(values)) {
      if (value === undefined) {
        if (document.has(key)) {
          document.delete(key);
          changed = true;
        }
      } else if (document.get(key) !== value) {
        document.set(key, value);
        changed = true;
      }
    }
    return changed;
  });

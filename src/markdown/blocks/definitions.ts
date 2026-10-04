import type { Node } from "prosemirror-model";
import { parse, stringify } from "yaml";

import { closeMarker, fenceFor, formatMarker, parseMarker } from "./args";
import { parseLength } from "../../layout/units";
import { checkLayout, framedFields, type LayoutNode } from "./layout";

// The definitions of forms: what a template says a form holds, its fields in
// order, each with what it takes and what it says while it's empty. A form
// placed from a template keeps a copy of its definition in the document (in
// the definitions section at the end of the file), so it stays as it was
// placed whatever becomes of the template. Definitions are read from files
// someone else may have written, so they are checked before Blank uses them.

export type FieldKind = "text" | "rich" | "image" | "table";

export interface FieldDefinition {
  // [a-z][a-z0-9-]*, unique in its form
  name: string;
  kind: FieldKind;
  // what it is called, e.g. in Word and for screen readers
  label: string;
  // what the field says while it's empty
  placeholder?: string;
  // a text field's style: p, or h1 to h6
  style?: string;
  // a table field's columns, its header row
  columns?: string[];
}

export interface Definition {
  // namespace/name: blank/… for Blank's templates, user/… for the user's
  id: string;
  version: number;
  name: string;
  description?: string;
  // the form starts on a new page
  newPage?: boolean;
  // where the fields that aren't in frames start on the form's first page,
  // from its top edge, e.g. a letter's text below its address
  flowTop?: string;
  fields: FieldDefinition[];
  // where its fields stand, see ./layout.ts; one after the other without
  layout?: LayoutNode[];
}

const KINDS: readonly string[] = ["text", "rich", "image", "table"];
const STYLES: readonly string[] = ["p", "h1", "h2", "h3", "h4", "h5", "h6"];
const MAX_FIELDS = 32;
const MAX_COLUMNS = 8;
const MAX_TEXT = 200;
// the most characters of a definition's YAML Blank reads
const MAX_YAML = 64 * 1024;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isText = (value: unknown, max = MAX_TEXT): value is string =>
  typeof value === "string" && value.length <= max;

/**
 * unknownKeys returns the keys of `value` not in `known`
 */
const unknownKeys = (value: Record<string, unknown>, known: string[]) =>
  Object.keys(value).filter((key) => !known.includes(key));

/**
 * checkField returns the field `value` describes, or what is wrong with it
 */
const checkField = (value: unknown): FieldDefinition | string => {
  if (!isRecord(value)) return "a field isn't a mapping";
  const extra = unknownKeys(value, [
    "name",
    "kind",
    "label",
    "placeholder",
    "style",
    "columns",
  ]);
  if (extra.length) return `a field has unknown keys: ${extra.join(", ")}`;
  const { name, kind, label, placeholder, style, columns } = value;
  if (typeof name !== "string" || !/^[a-z][a-z0-9-]{0,40}$/.test(name)) {
    return "a field's name must be lowercase letters, digits and dashes";
  }
  if (typeof kind !== "string" || !KINDS.includes(kind)) {
    return `the field ${name} must be of the kind ${KINDS.join(", ")}`;
  }
  if (!isText(label) || !label.trim()) {
    return `the field ${name} needs a label`;
  }
  if (placeholder !== undefined && !isText(placeholder)) {
    return `the placeholder of the field ${name} must be text`;
  }
  if (
    style !== undefined &&
    (kind !== "text" || !STYLES.includes(style as string))
  ) {
    return `only a text field has a style: ${STYLES.join(", ")}`;
  }
  if (columns !== undefined) {
    if (
      kind !== "table" ||
      !Array.isArray(columns) ||
      columns.length === 0 ||
      columns.length > MAX_COLUMNS ||
      !columns.every((column) => isText(column))
    ) {
      return `only a table field has columns, 1 to ${MAX_COLUMNS} of them`;
    }
  }
  return {
    name,
    kind: kind as FieldKind,
    label,
    ...(placeholder === undefined ? {} : { placeholder }),
    ...(style === undefined ? {} : { style: style as string }),
    ...(columns === undefined ? {} : { columns: columns as string[] }),
  };
};

/**
 * checkDefinition returns the definition `value` describes, or what is wrong
 * with it
 */
export const checkDefinition = (value: unknown): Definition | string => {
  if (!isRecord(value)) return "a definition is a mapping";
  const extra = unknownKeys(value, [
    "id",
    "version",
    "name",
    "description",
    "newPage",
    "flowTop",
    "fields",
    "layout",
  ]);
  if (extra.length) return `unknown keys: ${extra.join(", ")}`;
  const { id, version, name, description, newPage, flowTop, fields, layout } =
    value;
  if (
    typeof id !== "string" ||
    !/^[a-z0-9][a-z0-9.-]{0,60}\/[a-z0-9][a-z0-9-]{0,60}$/.test(id)
  ) {
    return "the id must be a namespace and a name, e.g. user/recipe";
  }
  if (!Number.isInteger(version) || (version as number) < 1) {
    return "the version must be a whole number from 1";
  }
  if (!isText(name, 100) || !name.trim()) return "it needs a name";
  if (description !== undefined && !isText(description)) {
    return "the description must be text";
  }
  if (newPage !== undefined && typeof newPage !== "boolean") {
    return "newPage must be true or false";
  }
  if (!Array.isArray(fields) || fields.length === 0) {
    return "it needs fields";
  }
  if (fields.length > MAX_FIELDS)
    return `it has more than ${MAX_FIELDS} fields`;
  const checked: FieldDefinition[] = [];
  for (const field of fields) {
    const result = checkField(field);
    if (typeof result === "string") return result;
    if (checked.some((other) => other.name === result.name)) {
      return `two fields are called ${result.name}`;
    }
    checked.push(result);
  }
  const placed =
    layout === undefined
      ? undefined
      : checkLayout(
          layout,
          checked.map((field) => field.name),
        );
  if (typeof placed === "string") return placed;
  // frames and where the flow starts are on the form's own first page
  const framed = framedFields(placed);
  if ((framed.length || flowTop !== undefined) && newPage !== true) {
    return "a template with frames or a flowTop starts a new page: newPage: true";
  }
  if (
    flowTop !== undefined &&
    (typeof flowTop !== "string" || parseLength(flowTop) === undefined)
  ) {
    return "flowTop is a length, like 90mm";
  }
  const table = checked.find(
    (field) => field.kind === "table" && framed.includes(field.name),
  );
  if (table) return `the table field ${table.name} can't be in a frame`;
  return {
    id,
    version: version as number,
    name,
    ...(description === undefined ? {} : { description }),
    ...(newPage === undefined ? {} : { newPage }),
    ...(flowTop === undefined ? {} : { flowTop: flowTop as string }),
    fields: checked,
    ...(placed === undefined ? {} : { layout: placed }),
  };
};

/**
 * readDefinition reads a definition from YAML, or returns what is wrong with
 * it. A template's file has no id: its file gives it one, `id`.
 */
export const readDefinition = (
  yaml: string,
  id?: string,
): Definition | string => {
  if (yaml.length > MAX_YAML) return "it is too long";
  let value: unknown;
  try {
    value = parse(yaml, { maxAliasCount: 0 });
  } catch (error) {
    return `it isn't YAML: ${error instanceof Error ? error.message : error}`;
  }
  return checkDefinition(
    id !== undefined && isRecord(value) ? { ...value, id } : value,
  );
};

/**
 * canonical writes `value` as JSON with its keys sorted, the same for the
 * same definition however its YAML was written
 */
const canonical = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(canonical).join(",")}]`
    : isRecord(value)
      ? `{${Object.keys(value)
          .sort()
          .map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`)
          .join(",")}}`
      : JSON.stringify(value);

/**
 * hash8 returns 8 hex digits that tell texts apart (cyrb53)
 */
const hash8 = (text: string) => {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ char, 2654435761);
    h2 = Math.imul(h2 ^ char, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const hash = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return hash.toString(16).padStart(14, "0").slice(-8);
};

/**
 * definitionKey returns the key a form names its definition by: its id, its
 * version, and a hash of what it says, so that two templates of the same
 * name and version that say different things are told apart
 */
export const definitionKey = (definition: Definition) =>
  `${definition.id}@${definition.version}#${hash8(canonical(definition))}`;

/**
 * definitionsSection writes the definitions section of a file: `definitions`,
 * then the YAML Blank couldn't read, as it was; "" for none
 */
export const definitionsSection = (
  definitions: readonly Definition[],
  raw: readonly string[],
) => {
  if (definitions.length === 0 && raw.length === 0) return "";
  const fences = definitions.map((definition) => {
    const yaml = stringify(definition);
    const fence = fenceFor(yaml);
    return `${fence}yaml\n${yaml}${fence}`;
  });
  return [
    formatMarker({ name: "definitions", format: 1, args: {} }),
    ...fences,
    ...raw,
    closeMarker("definitions"),
  ].join("\n\n");
};

export type Definitions = Record<string, Definition>;

/**
 * definitionOf returns the definition of the key `key` among `definitions`,
 * one of their own: a form that names `constructor` has none
 */
export const definitionOf = (
  definitions: Definitions,
  key: string,
): Definition | undefined =>
  Object.hasOwn(definitions, key) ? definitions[key] : undefined;

/**
 * docDefinitions returns the definitions of the forms of `doc`, by their key
 */
export const docDefinitions = (doc: Node): Definitions =>
  doc.attrs.definitions as Definitions;

/**
 * formDefinition returns the definition of `form`, a form of `doc`, if the
 * document has it
 */
export const formDefinition = (doc: Node, form: Node): Definition | undefined =>
  definitionOf(docDefinitions(doc), form.attrs.def as string);

/**
 * usedDefinitions returns the definitions of `doc` its forms use, and those
 * blocks Blank can't show name: the others aren't written
 */
export const usedDefinitions = (doc: Node): Definition[] => {
  const keys = new Set<string>();
  doc.forEach((node) => {
    if (node.type.name === "form_block") keys.add(node.attrs.def as string);
    if (node.type.name !== "unknown_block") return;
    for (const line of (node.attrs.raw as string).split("\n")) {
      const def = parseMarker(line)?.args.def;
      if (def) keys.add(def);
    }
  });
  return [...keys].sort().flatMap((key) => {
    const definition = definitionOf(docDefinitions(doc), key);
    return definition ? [definition] : [];
  });
};

/**
 * writeDefinitionList writes definitions as a YAML list, as the Word export
 * keeps them
 */
export const writeDefinitionList = (definitions: readonly Definition[]) =>
  stringify(definitions);

/**
 * readDefinitionList reads a YAML list of definitions into the ones Blank
 * can read, by their key
 */
export const readDefinitionList = (yaml: string): Definitions => {
  const definitions: Definitions = {};
  if (yaml.length > MAX_YAML * MAX_FIELDS) return definitions;
  let values: unknown;
  try {
    values = parse(yaml, { maxAliasCount: 0 });
  } catch {
    return definitions;
  }
  for (const value of Array.isArray(values) ? values : []) {
    const definition = checkDefinition(value);
    if (typeof definition !== "string") {
      definitions[definitionKey(definition)] = definition;
    }
  }
  return definitions;
};

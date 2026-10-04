import { Fragment, type Node, type ResolvedPos } from "prosemirror-model";

import { schema } from "../schema";
import {
  type Definition,
  type FieldDefinition,
  formDefinition,
} from "./definitions";

// Forms: what a form placed from a definition holds, and what
// a field may hold by its kind (see src/markdown/blocks/definitions.ts):
// - a text field: one textblock, in the field's style;
// - an image field: one paragraph, for its picture;
// - a table field: a table, which it starts with the template's columns;
// - a rich field: any blocks a field holds.

const { paragraph, heading, table, table_row, table_header, table_cell } =
  schema.nodes;

/**
 * textblockOf returns the empty textblock of a text field's style, or a
 * paragraph
 */
const textblockOf = (spec: FieldDefinition, content?: Fragment) => {
  const level = /^h([1-6])$/.exec(spec.style ?? "")?.[1];
  return level
    ? heading.create({ level: Number(level) }, content)
    : paragraph.create(null, content);
};

/**
 * tableOf returns a table of a template's columns: its header row and an
 * empty row
 */
const tableOf = (columns: readonly string[]) => {
  const cell = (type: typeof table_cell, text = "") =>
    type.create(null, paragraph.create(null, text ? schema.text(text) : null));
  return table.create(null, [
    table_row.create(
      null,
      columns.map((column) => cell(table_header, column)),
    ),
    table_row.create(
      null,
      columns.map(() => cell(table_cell)),
    ),
  ]);
};

/**
 * emptyOf returns what an empty field of `spec` holds
 */
const emptyOf = (spec: FieldDefinition): Node =>
  spec.kind === "text"
    ? textblockOf(spec)
    : spec.kind === "table"
      ? tableOf(spec.columns ?? ["", ""])
      : paragraph.create();

/**
 * createField returns an empty field
 */
export const createField = (spec: FieldDefinition): Node =>
  schema.nodes.form_field.create({ name: spec.name }, emptyOf(spec));

/**
 * fieldSpec returns what the definition of a form says of one of its fields
 */
export const fieldSpec = (
  definition: Definition | undefined,
  field: Node,
): FieldDefinition | undefined =>
  definition?.fields.find((spec) => spec.name === field.attrs.name);

/**
 * isEmptyField tells whether `field` holds nothing but the empty textblock
 * its kind starts with: what an empty field is written as (nothing) and
 * read as, and what says its placeholder
 */
export const isEmptyField = (
  field: Node,
  spec: FieldDefinition | undefined,
) => {
  const only = field.childCount === 1 ? field.firstChild! : null;
  const empty = spec ? emptyOf(spec) : paragraph.create();
  return (
    !!only &&
    only.isTextblock &&
    only.content.size === 0 &&
    only.hasMarkup(empty.type, empty.attrs)
  );
};

/**
 * formBlocks returns the blocks a form's fields hold, one after the other:
 * what a form is without its fields
 */
export const formBlocks = (form: Node): Node[] => {
  const blocks: Node[] = [];
  form.forEach((field) => field.forEach((block) => blocks.push(block)));
  return blocks;
};

/**
 * createForm returns an empty form of a definition, whose key is `def`
 */
export const createForm = (definition: Definition, def: string): Node =>
  schema.nodes.form_block.create({ def }, definition.fields.map(createField));

/**
 * inlineOf returns the inline content of the textblocks in `node`, joined
 * by spaces
 */
const inlineOf = (node: Node) => {
  const parts: Node[] = [];
  node.descendants((child) => {
    if (!child.isTextblock) return true;
    if (parts.length && child.childCount) parts.push(schema.text(" "));
    child.forEach((inline) => parts.push(inline));
    return false;
  });
  return Fragment.fromArray(parts);
};

/**
 * withoutPageBreaks returns `node` without the page breaks in it, which a
 * field can't hold (a quote or a list in it could)
 */
const withoutPageBreaks = (node: Node): Node => {
  let breaks = false;
  node.descendants((child) => {
    if (child.type === schema.nodes.page_break) breaks = true;
    return !breaks;
  });
  if (!breaks) return node;
  const content: Node[] = [];
  node.forEach((child) => {
    if (child.type !== schema.nodes.page_break) {
      content.push(withoutPageBreaks(child));
    }
  });
  return node.copy(Fragment.fromArray(content));
};

/**
 * fitField returns `field` as its kind holds it (see the comment on top),
 * itself if it does already
 */
export const fitField = (field: Node, spec: FieldDefinition): Node => {
  const fitted = withoutPageBreaks(field);
  const only = fitted.childCount === 1 ? fitted.firstChild! : null;
  switch (spec.kind) {
    case "text": {
      const empty = textblockOf(spec);
      if (only?.hasMarkup(empty.type, empty.attrs)) return fitted;
      return fitted.copy(Fragment.from(textblockOf(spec, inlineOf(fitted))));
    }
    case "image":
      if (only?.type === paragraph) return fitted;
      return fitted.copy(
        Fragment.from(paragraph.create(null, inlineOf(fitted))),
      );
    case "table": {
      let tables = false;
      fitted.forEach((child) => {
        if (child.type === table) tables = true;
      });
      if (tables) return fitted;
      // the template's table, after what isn't empty
      const kept: Node[] = [];
      fitted.forEach((child) => {
        if (!child.isTextblock || child.content.size > 0) kept.push(child);
      });
      return fitted.copy(
        Fragment.fromArray([...kept, tableOf(spec.columns ?? ["", ""])]),
      );
    }
    default:
      return fitted;
  }
};

/**
 * fitForm returns `form` as its definition says: its fields in its order,
 * each as its kind holds it; and what was in fields it doesn't have, which
 * goes after it. Null if it is as it should be.
 */
export const fitForm = (
  form: Node,
  definition: Definition,
): { form: Node; rest: Node[] } | null => {
  const byName = new Map<string, Node>();
  const rest: Node[] = [];
  form.forEach((field) => {
    const name = field.attrs.name as string;
    if (fieldSpec(definition, field) && !byName.has(name)) {
      byName.set(name, field);
    } else field.forEach((child) => rest.push(child));
  });
  const fields = definition.fields.map((spec) => {
    const field = byName.get(spec.name);
    return field ? fitField(field, spec) : createField(spec);
  });
  const fitted = form.copy(Fragment.fromArray(fields));
  return fitted.eq(form) && rest.length === 0 ? null : { form: fitted, rest };
};

export interface FieldAt {
  // the form and where it starts
  form: Node;
  formPos: number;
  // the field's index in the form, and what its definition says of it
  index: number;
  spec: FieldDefinition | undefined;
}

/**
 * fieldAt returns the field a position is in, or null outside forms
 */
export const fieldAt = ($pos: ResolvedPos): FieldAt | null => {
  if ($pos.depth < 2 || $pos.node(1).type !== schema.nodes.form_block) {
    return null;
  }
  const form = $pos.node(1);
  return {
    form,
    formPos: $pos.before(1),
    index: $pos.index(1),
    spec: fieldSpec(formDefinition($pos.doc, form), $pos.node(2)),
  };
};
/**
 * settleForms returns `doc` with its forms as their definitions say (see
 * fitForm), and those whose definition it doesn't have as the blocks they
 * held
 */
export const settleForms = (doc: Node): Node => {
  const content: Node[] = [];
  let changed = false;
  doc.forEach((node) => {
    if (node.type !== schema.nodes.form_block) {
      content.push(node);
      return;
    }
    const definition = formDefinition(doc, node);
    const fitted = definition ? fitForm(node, definition) : null;
    if (definition && !fitted) {
      content.push(node);
      return;
    }
    changed = true;
    if (fitted) content.push(fitted.form, ...fitted.rest);
    else content.push(...formBlocks(node));
  });
  return changed ? doc.copy(Fragment.fromArray(content)) : doc;
};

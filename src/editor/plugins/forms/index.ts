import { chainCommands } from "prosemirror-commands";
import { Fragment, type Node, Slice } from "prosemirror-model";
import { liftListItem, sinkListItem } from "prosemirror-schema-list";
import {
  type Command,
  type EditorState,
  NodeSelection,
  Plugin,
  Selection,
  type Transaction,
} from "prosemirror-state";
import { goToNextCell, isInTable } from "prosemirror-tables";
import type { EditorView, NodeView } from "prosemirror-view";

import {
  type Definition,
  definitionOf,
  type Definitions,
  docDefinitions,
  fieldAt,
  fitForm,
  formBlocks,
  formDefinition,
  isEmptyField,
  schema,
} from "../../../markdown";
import { indentCode, outdentCode } from "../../commands/codeIndent";
import editImage from "../../commands/editImage";
import {
  PAGE_PRESS,
  type PagePointer,
  type PagePointerEvent,
} from "../../pagePointer";
import { blockBoxes } from "../../../engine/geometry";

// Forms in the editor (see src/markdown/blocks/forms.ts):
// - the guard keeps every form as its definition says, the cursor where it
//   was in it; it gives a form pasted from another document its definition,
//   which the copy took along, and a form whose definition is nowhere
//   becomes the blocks it held;
// - Tab and Shift Tab go from field to field, where a table, a list or code
//   don't take them; Enter goes on from a field of one line; Escape selects
//   the whole form;
// - a part of a form copied and pasted is its blocks, not a new form;
// - a field's view says what it is, for screen readers;
// - a press on an empty image field, which the pages show as a box for its
//   picture, opens the image dialog, and the pointer shows a hand over it
//   (pictureBoxAt, which the page view asks).

const { form_block: formBlock } = schema.nodes;

// the definitions of the forms copied since Blank started, by their key, so
// that a form pasted into another document gets its definition
const copied = new Map<string, Definition>();

/**
 * remember keeps the definitions of the forms a copy holds, see `copied`
 */
const remember = (slice: Slice, view: EditorView) => {
  slice.content.forEach((node) => {
    if (node.type !== formBlock) return;
    const definition = formDefinition(view.state.doc, node);
    if (definition) copied.set(node.attrs.def as string, definition);
  });
  return slice;
};

/**
 * textOffset returns how far into the text of the field it is in `pos` is,
 * to find the same place in the field once it was repaired (see `placeAt`)
 */
const textOffset = (doc: Node, pos: number) => {
  const $pos = doc.resolve(pos);
  return doc.textBetween($pos.start(2), pos, "\n", "\n").length;
};

/**
 * placeAt returns the first position in the field `index` of the form at
 * `formPos` that is at least `offset` into the field's text
 */
const placeAt = (doc: Node, formPos: number, index: number, offset: number) => {
  const form = doc.nodeAt(formPos);
  if (!form || index >= form.childCount) return null;
  let start = formPos + 1;
  for (let at = 0; at < index; at++) start += form.child(at).nodeSize;
  const from = start + 1;
  let low = from;
  let high = start + form.child(index).nodeSize - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (doc.textBetween(from, middle, "\n", "\n").length < offset) {
      low = middle + 1;
    } else high = middle;
  }
  return low;
};

/**
 * guard repairs the forms a transaction changed, see the comment on top
 */
const guard = (
  transactions: readonly Transaction[],
  old: EditorState,
  state: EditorState,
): Transaction | null => {
  if (!transactions.some((tr) => tr.docChanged)) return null;
  const definitions = docDefinitions(state.doc);
  // the forms that changed: the others are the same nodes as before
  const before = new Set<Node>();
  old.doc.forEach((node) => before.add(node));
  const forms: { node: Node; pos: number }[] = [];
  state.doc.forEach((node, pos) => {
    if (node.type === formBlock && !before.has(node)) forms.push({ node, pos });
  });
  if (forms.length === 0) return null;
  // where the cursor is in a form, to keep it there
  const head = state.selection.head;
  const at = fieldAt(state.doc.resolve(head));
  const place = at && {
    formPos: at.formPos,
    name: at.form.child(at.index).attrs.name as string,
    offset: textOffset(state.doc, head),
  };
  const tr = state.tr;
  let added: Definitions | null = null;
  // from the end, so that the positions before stay
  for (const { node, pos } of forms.reverse()) {
    const key = node.attrs.def as string;
    let definition: Definition | undefined =
      definitionOf(definitions, key) ??
      (added ? definitionOf(added, key) : undefined);
    if (!definition && copied.has(key)) {
      definition = copied.get(key)!;
      added = { ...(added ?? definitions), [key]: definition };
    }
    if (!definition) {
      tr.replaceWith(pos, pos + node.nodeSize, formBlocks(node));
      continue;
    }
    const fitted = fitForm(node, definition);
    if (fitted) {
      tr.replaceWith(pos, pos + node.nodeSize, [fitted.form, ...fitted.rest]);
    }
  }
  if (added) tr.setDocAttribute("definitions", added);
  if (!tr.docChanged) return null;
  if (
    place &&
    tr.doc.nodeAt(tr.mapping.map(place.formPos, -1))?.type === formBlock
  ) {
    const formPos = tr.mapping.map(place.formPos, -1);
    const form = tr.doc.nodeAt(formPos)!;
    let index = -1;
    form.forEach((field, _offset, at) => {
      if (field.attrs.name === place.name) index = at;
    });
    const pos =
      index < 0 ? null : placeAt(tr.doc, formPos, index, place.offset);
    if (pos !== null) tr.setSelection(Selection.near(tr.doc.resolve(pos)));
  }
  // the repairs aren't steps of their own to undo
  return tr.setMeta("addToHistory", false);
};

/**
 * unwrapForms returns a pasted slice without the forms it starts or ends in:
 * the blocks of a part of a form, which pasted elsewhere aren't a new form.
 * A whole form stays one.
 */
export const unwrapForms = (slice: Slice): Slice => {
  const { content, openStart, openEnd } = slice;
  const last = content.childCount - 1;
  const cut = (index: number) =>
    content.child(index).type === formBlock &&
    ((index === 0 && openStart > 0) || (index === last && openEnd > 0));
  if (!cut(0) && !cut(last)) return slice;
  const nodes: Node[] = [];
  // a form and its field fewer open at each end that was cut
  let start = openStart;
  let end = openEnd;
  content.forEach((node, _offset, index) => {
    if (!cut(index)) {
      nodes.push(node);
      return;
    }
    nodes.push(...formBlocks(node));
    if (index === 0) start = Math.max(0, openStart - 2);
    if (index === last) end = Math.max(0, openEnd - 2);
  });
  const fragment = Fragment.fromArray(nodes);
  const most = Slice.maxOpen(fragment);
  return new Slice(
    fragment,
    Math.min(start, most.openStart),
    Math.min(end, most.openEnd),
  );
};

/**
 * toField moves the cursor to the start of the field `step` fields from the
 * one it is in, or out of the form after its last field or before its first
 */
const toField =
  (step: 1 | -1): Command =>
  (state, dispatch) => {
    const at = fieldAt(state.selection.$from);
    if (!at) return false;
    const target = at.index + step;
    let pos = at.formPos + 1;
    for (let index = 0; index < target && index < at.form.childCount; index++) {
      pos += at.form.child(index).nodeSize;
    }
    const selection =
      target < 0
        ? Selection.findFrom(state.doc.resolve(at.formPos), -1, true)
        : target >= at.form.childCount
          ? Selection.findFrom(
              state.doc.resolve(at.formPos + at.form.nodeSize),
              1,
              true,
            )
          : Selection.findFrom(
              state.doc.resolve(entry(at.form.child(target), pos)),
              1,
              true,
            );
    // nowhere to go before a form at the start of the document
    if (!selection) return true;
    dispatch?.(state.tr.setSelection(selection).scrollIntoView());
    return true;
  };

/**
 * entry returns where the cursor goes into a field that starts at `pos`: its
 * start, or the first cell under a table's header row, which holds the
 * template's columns
 */
const entry = (field: Node, pos: number) => {
  const table = field.firstChild;
  if (table?.type !== schema.nodes.table || table.childCount < 2)
    return pos + 1;
  return pos + 1 + 1 + table.firstChild!.nodeSize + 1;
};

const indent = chainCommands(indentCode, sinkListItem(schema.nodes.list_item));
const outdent = chainCommands(
  outdentCode,
  liftListItem(schema.nodes.list_item),
);

/**
 * keys handles Tab, Shift Tab, Enter and Escape in a form, see the comment
 * on top
 */
const keys = (view: EditorView, event: KeyboardEvent) => {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const { state } = view;
  const at = fieldAt(state.selection.$from);
  if (!at) return false;
  const run = (command: Command) => command(state, view.dispatch, view);
  if (event.key === "Tab") {
    const step = event.shiftKey ? -1 : 1;
    // a table takes Tab up to its last cell, a list or code where it can
    if (isInTable(state) && goToNextCell(step)(state)) return false;
    if ((step > 0 ? indent : outdent)(state)) return false;
    return run(toField(step));
  }
  if (event.shiftKey) return false;
  if (event.key === "Enter") {
    // a field of one line goes on to the next one
    const oneLine = at.spec?.kind === "text" || at.spec?.kind === "image";
    return oneLine && state.selection.empty && run(toField(1));
  }
  if (event.key === "Escape") {
    view.dispatch(
      state.tr.setSelection(NodeSelection.create(state.doc, at.formPos)),
    );
    return true;
  }
  return false;
};

/**
 * FieldView names a field for screen readers, and without the engine, by
 * its label
 */
class FieldView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;

  constructor(
    private node: Node,
    private view: EditorView,
    private getPos: () => number | undefined,
  ) {
    this.dom = this.contentDOM = document.createElement("div");
    this.dom.className = "field";
    this.dom.setAttribute("role", "group");
    this.name();
  }

  private name() {
    this.dom.setAttribute("data-blank-field", this.node.attrs.name as string);
    const pos = this.getPos();
    const at =
      pos === undefined ? null : fieldAt(this.view.state.doc.resolve(pos + 1));
    const label = at?.spec?.label ?? (this.node.attrs.name as string);
    this.dom.setAttribute("aria-label", label);
  }

  update(node: Node) {
    if (node.type !== schema.nodes.form_field) return false;
    this.node = node;
    this.name();
    return true;
  }
}

/**
 * pictureBoxAt tells whether a point on the pages, with the position it
 * hits, is on the box an empty image field shows for its picture: where a
 * click opens the image dialog, and the pointer says so
 */
export const pictureBoxAt = (
  state: EditorState,
  { pos, x, y }: Pick<PagePointer, "pos" | "x" | "y">,
) => {
  if (pos === null) return false;
  const $pos = state.doc.resolve(pos);
  const at = fieldAt($pos);
  if (at?.spec?.kind !== "image" || $pos.depth < 3) return false;
  if (!isEmptyField(at.form.child(at.index), at.spec)) return false;
  return blockBoxes($pos.before(3), $pos.after(3)).some(
    (box) => x >= box.left && x <= box.right && y >= box.top && y <= box.bottom,
  );
};

/**
 * choosePicture opens the image dialog for a press on the box of an empty
 * image field, see pictureBoxAt
 */
const choosePicture = (view: EditorView, event: PagePointerEvent) => {
  const { pos, button, shiftKey, ctrlKey, metaKey, altKey } = event.detail;
  if (button !== 0 || shiftKey || ctrlKey || metaKey || altKey) return false;
  if (pos === null || !pictureBoxAt(view.state, event.detail)) return false;
  event.preventDefault();
  view.dispatch(
    view.state.tr.setSelection(Selection.near(view.state.doc.resolve(pos))),
  );
  editImage()(view.state, view.dispatch, view);
  return true;
};

/**
 * forms keeps forms as their definitions say and moves through their
 * fields, see the comment on top
 */
export const forms = () =>
  new Plugin({
    appendTransaction: guard,
    props: {
      handleKeyDown: keys,
      handleDOMEvents: { [PAGE_PRESS]: choosePicture },
      transformPasted: unwrapForms,
      transformCopied: remember,
      nodeViews: {
        form_field: (node, view, getPos) => new FieldView(node, view, getPos),
      },
    },
  });

export { createForm, fieldAt } from "../../../markdown/blocks/forms";

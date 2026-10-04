import { Fragment, type Node, Slice } from "prosemirror-model";
import {
  EditorState,
  NodeSelection,
  type Plugin,
  TextSelection,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createForm, schema } from "../../../markdown";
import { doc, h, keyEvent, li, p, ul } from "../../../test/editor";
import { field, RECIPE, RECIPE_KEY as KEY } from "../../../test/forms";
import { blockBoxes } from "../../../engine/geometry";
import { imageDialog } from "../../../state";
import { PAGE_PRESS } from "../../pagePointer";
import { tableGuard } from "../tables/guard";
import { tableKeys } from "../tables/keys";
import { forms, pictureBoxAt, unwrapForms } from ".";

// a document with a recipe, its definition, and a paragraph after it; the
// table guard keeps a paragraph before it, at the document's start
const recipeDoc = (form = createForm(RECIPE, KEY), definitions = true) =>
  schema.node("doc", { definitions: definitions ? { [KEY]: RECIPE } : {} }, [
    form,
    p("after"),
  ]);

// the first form of `node`
const formOf = (node: Node) => {
  let form: Node | null = null;
  node.forEach((child) => {
    if (!form && child.type.name === "form_block") form = child;
  });
  return form as Node | null;
};

// the pages show every block at the same box
vi.mock("../../../engine/geometry", () => ({ blockBoxes: vi.fn() }));

let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
});

const mount = (node: Node, plugins: Plugin[] = []) => {
  view = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      schema,
      doc: node,
      plugins: [forms(), ...plugins, tableKeys(), tableGuard()],
    }),
  });
  return view;
};

const press = (combo: string) =>
  view!.someProp("handleKeyDown", (f) => f(view!, keyEvent(combo))) ?? false;

// the field the cursor is in
const fieldName = () => {
  const { $from } = view!.state.selection;
  return $from.depth >= 2 && $from.node(1).type.name === "form_block"
    ? ($from.node(2).attrs.name as string)
    : null;
};

describe("the form guard", () => {
  it("repairs a form a change took a field from", () => {
    mount(recipeDoc());
    const { state } = view!;
    const form = state.doc.firstChild!;
    // the photo field, deleted as a whole
    const from = 1 + form.child(0).nodeSize;
    view!.dispatch(state.tr.delete(from, from + form.child(1).nodeSize));
    const repaired = formOf(view!.state.doc)!;
    expect(repaired.childCount).toBe(4);
    expect(repaired.child(1).attrs.name).toBe("photo");
  });

  it("gives a pasted form the definition the document it was copied from had", () => {
    mount(recipeDoc());
    const form = formOf(view!.state.doc)!;
    const copy = new Slice(Fragment.from(form), 0, 0);
    view!.someProp("transformCopied", (f) => f(copy, view!));
    view!.destroy();
    // another document, without the definition
    mount(doc(p("x")));
    view!.dispatch(view!.state.tr.insert(0, form));
    expect(view!.state.doc.attrs.definitions[KEY]).toEqual(RECIPE);
    expect(formOf(view!.state.doc)).not.toBeNull();
  });

  it("keeps the cursor where it was in a field it repairs", () => {
    mount(recipeDoc());
    // two lines in the title, which the guard joins into one
    const title = view!.state.doc.firstChild!.firstChild!;
    const from = 1 + 1;
    const tr = view!.state.tr.replaceWith(from, from + title.nodeSize - 2, [
      h(1, "Pan"),
      p("cakes"),
    ]);
    const end = from + 1 + h(1, "Pan").nodeSize + "cakes".length;
    view!.dispatch(tr.setSelection(TextSelection.create(tr.doc, end)));
    const { $from } = view!.state.selection;
    expect(fieldName()).toBe("title");
    expect($from.parent.textContent).toBe("Pan cakes");
    expect($from.parentOffset).toBe("Pan cakes".length);
  });

  it("makes a form whose definition is nowhere the blocks it held", () => {
    mount(doc(p("x")));
    const stray = schema.node("form_block", { def: "user/gone@1#00000000" }, [
      field("a", p("kept")),
    ]);
    view!.dispatch(view!.state.tr.insert(0, stray));
    expect(formOf(view!.state.doc)).toBeNull();
    expect(view!.state.doc.textContent).toBe("keptx");
  });
});

describe("the keys of a form", () => {
  const into = (name: string) => {
    let target = 0;
    view!.state.doc.descendants((node, pos) => {
      if (node.type.name === "form_field" && node.attrs.name === name) {
        target = pos + 2;
      }
      return !target;
    });
    view!.dispatch(
      view!.state.tr.setSelection(
        TextSelection.near(view!.state.doc.resolve(target)),
      ),
    );
  };

  it("goes from field to field with Tab and Shift Tab, through the table", () => {
    mount(recipeDoc());
    into("title");
    expect(press("Tab")).toBe(true);
    expect(fieldName()).toBe("photo");
    press("Tab");
    expect(fieldName()).toBe("ingredients");
    // into the first cell under the header row; the table takes Tab from
    // cell to cell, and its last cell goes on to the next field rather than
    // adding a row
    const row = () => view!.state.selection.$from.index(3);
    expect(row()).toBe(1);
    press("Tab");
    expect(fieldName()).toBe("ingredients");
    press("Tab");
    expect(fieldName()).toBe("steps");
    const rows = view!.state.doc.child(1).child(2).firstChild!.childCount;
    expect(rows).toBe(2);
    press("Shift-Tab");
    expect(fieldName()).toBe("ingredients");
  });

  it("leaves the form after its last field", () => {
    mount(recipeDoc());
    into("steps");
    press("Tab");
    expect(fieldName()).toBeNull();
    expect(view!.state.selection.$from.parent.textContent).toBe("after");
  });

  it("goes on from a field of one line with Enter", () => {
    mount(recipeDoc());
    into("title");
    expect(press("Enter")).toBe(true);
    expect(fieldName()).toBe("photo");
    into("steps");
    expect(press("Enter")).toBe(false);
  });

  it("leaves Tab to a list in a field", () => {
    const form = createForm(RECIPE, KEY);
    const steps = form
      .child(3)
      .copy(Fragment.from(ul(li(p("one")), li(p("two")))));
    mount(recipeDoc(form.copy(form.content.replaceChild(3, steps))));
    let second = 0;
    view!.state.doc.descendants((node, pos) => {
      if (node.textContent === "two" && node.isTextblock) second = pos + 1;
    });
    view!.dispatch(
      view!.state.tr.setSelection(
        TextSelection.create(view!.state.doc, second),
      ),
    );
    expect(press("Tab")).toBe(false);
  });

  it("selects the whole form with Escape", () => {
    mount(recipeDoc());
    into("photo");
    press("Escape");
    expect(view!.state.selection).toBeInstanceOf(NodeSelection);
    expect((view!.state.selection as NodeSelection).node.type.name).toBe(
      "form_block",
    );
  });
});

describe("an empty image field", () => {
  beforeEach(() => {
    vi.mocked(blockBoxes).mockReturnValue([
      { page: 0, left: 10, top: 10, right: 210, bottom: 130 },
    ]);
  });

  afterEach(() => {
    imageDialog.value = null;
  });

  // a press on the pages at the start of a field's first textblock, at
  // `x` and `y` in the window
  const pressIn = (name: string, button = 0, x = 50, y = 50) => {
    let pos = -1;
    view!.state.doc.descendants((node, at) => {
      if (node.type.name === "form_field" && node.attrs.name === name) {
        pos = at + 2;
      }
      return pos < 0;
    });
    const event = new CustomEvent(PAGE_PRESS, {
      cancelable: true,
      detail: {
        pos,
        link: null,
        x,
        y,
        button,
        shiftKey: false,
        ctrlKey: false,
        metaKey: false,
        altKey: false,
      },
    });
    view!.someProp("handleDOMEvents", (handlers) =>
      handlers[PAGE_PRESS]?.(view!, event),
    );
    return event.defaultPrevented;
  };

  it("opens the image dialog when it is clicked", () => {
    mount(recipeDoc());
    expect(pressIn("photo")).toBe(true);
    expect(imageDialog.value).toMatchObject({ isEdit: false });
    expect(fieldName()).toBe("photo");
  });

  it("leaves other fields and other buttons to the editor", () => {
    mount(recipeDoc());
    expect(pressIn("title")).toBe(false);
    expect(pressIn("photo", 2)).toBe(false);
    // beside its box
    expect(pressIn("photo", 0, 250, 50)).toBe(false);
    expect(imageDialog.value).toBeNull();
  });

  it("tells where the pointer is on its box", () => {
    mount(recipeDoc());
    let photo = -1;
    view!.state.doc.descendants((node, pos) => {
      if (node.attrs.name === "photo") photo = pos + 2;
      return photo < 0;
    });
    const at = (x: number, y: number) =>
      pictureBoxAt(view!.state, { pos: photo, x, y });
    expect(at(50, 50)).toBe(true);
    expect(at(50, 150)).toBe(false);
    expect(pictureBoxAt(view!.state, { pos: 2, x: 50, y: 50 })).toBe(false);
  });
});

describe("unwrapForms", () => {
  it("pastes a part of a field as its blocks, not as a form", () => {
    const slice = new Slice(
      Fragment.from(
        schema.node("form_block", { def: KEY }, [field("steps", p("Mix."))]),
      ),
      3,
      3,
    );
    const unwrapped = unwrapForms(slice);
    expect(unwrapped.content.firstChild!.type.name).toBe("paragraph");
    expect(unwrapped.openStart).toBe(1);
  });

  it("pastes a slice that ends in a form as blocks", () => {
    const slice = new Slice(
      Fragment.fromArray([
        p("a"),
        schema.node("form_block", { def: KEY }, [
          field("title", h(1, "Pan")),
          field("steps", p("Mix.")),
        ]),
      ]),
      1,
      3,
    );
    const unwrapped = unwrapForms(slice);
    const names: string[] = [];
    unwrapped.content.forEach((node) => names.push(node.type.name));
    expect(names).toEqual(["paragraph", "heading", "paragraph"]);
    expect([unwrapped.openStart, unwrapped.openEnd]).toEqual([1, 1]);
  });

  it("keeps a whole form", () => {
    const slice = new Slice(Fragment.from(createForm(RECIPE, KEY)), 0, 0);
    expect(unwrapForms(slice)).toBe(slice);
  });

  it("leaves other slices alone", () => {
    const slice = new Slice(Fragment.from(doc(h(1, "x")).firstChild!), 0, 0);
    expect(unwrapForms(slice)).toBe(slice);
  });
});

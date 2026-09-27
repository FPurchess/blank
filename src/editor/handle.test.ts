import { describe, expect, it, vi } from "vitest";
import { type Command, EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import {
  computed,
  createApp,
  defineComponent,
  h,
  isReactive,
  isRef,
  reactive,
} from "vue";

import { createState, createTestView, doc, p } from "../test/editor";
import { schema } from "../markdown";
import { createEditorHandle, EditorKey, syncPlugin, useEditor } from "./handle";

// inserts "x" at the start of the document
const insertX: Command = (state, dispatch) => {
  dispatch?.(state.tr.insertText("x", 1));
  return true;
};
const never: Command = () => false;

const setup = () => {
  const view = createTestView(createState(doc(p("text"))));
  view.focus = vi.fn();
  const { handle, sync } = createEditorHandle(view);
  return { view, handle, sync };
};

describe("createEditorHandle", () => {
  it("runs a command on the editor and gives it the focus back", () => {
    const { view, handle } = setup();

    expect(handle.run(insertX)).toBe(true);
    expect(view.state.doc.textContent).toBe("xtext");
    expect(view.focus).toHaveBeenCalledOnce();
  });

  it("leaves the focus alone when asked to", () => {
    const { view, handle } = setup();
    handle.run(insertX, { focus: false });

    expect(view.focus).not.toHaveBeenCalled();
  });

  it("tells whether a command can run, without running it", () => {
    const { view, handle } = setup();

    expect(handle.can(insertX)).toBe(true);
    expect(handle.can(never)).toBe(false);
    expect(view.state.doc.textContent).toBe("text");
  });

  it("gives the editor the focus", () => {
    const { view, handle } = setup();
    handle.focus();

    expect(view.focus).toHaveBeenCalledOnce();
  });

  it("follows the editor's state once synced", () => {
    const { handle, sync } = setup();
    const before = handle.state.value;
    handle.run(insertX);

    expect(handle.state.value).toBe(before);
    sync();
    expect(handle.state.value.doc.textContent).toBe("xtext");
  });

  it("tells in a computed whether a command can run, as the state changes", () => {
    const { handle, sync } = setup();
    const empty = computed(() =>
      handle.can((state) => state.doc.textContent === ""),
    );
    expect(empty.value).toBe(false);

    handle.run((state, dispatch) => {
      dispatch?.(state.tr.delete(1, state.doc.content.size - 1));
      return true;
    });
    sync();

    expect(empty.value).toBe(true);
  });

  it("is never made reactive, so the view stays a plain object", () => {
    const { handle } = setup();

    // reactive() leaves a raw object as it is, so the view is never proxied
    expect(isReactive(reactive({ handle }).handle)).toBe(false);
    expect(isRef(handle.state)).toBe(true);
  });
});

describe("useEditor", () => {
  const mountWith = (provide: boolean) => {
    const { handle } = setup();
    let used: unknown;
    const app = createApp(
      defineComponent({
        setup() {
          used = useEditor();
          return () => h("div");
        },
      }),
    );
    if (provide) app.provide(EditorKey, handle);
    app.config.warnHandler = () => {};
    const element = document.createElement("div");
    try {
      app.mount(element);
    } finally {
      app.unmount();
    }
    return { handle, used };
  };

  it("gives a component the editor provided above it", () => {
    const { handle, used } = mountWith(true);

    expect(used).toBe(handle);
  });

  it("fails without an editor", () => {
    expect(() => mountWith(false)).toThrow(/needs an editor/);
  });
});

describe("syncPlugin", () => {
  it("syncs after every change of the view's state, also a new document", () => {
    const sync = vi.fn();
    const state = EditorState.create({ schema, doc: doc(p("text")) });
    const view = new EditorView(document.createElement("div"), {
      state,
      plugins: [syncPlugin(sync)],
    });

    sync.mockClear();

    view.dispatch(view.state.tr.insertText("x", 1));
    expect(sync).toHaveBeenCalledTimes(1);
    // e.g. Open file sets a new state without a transaction, with the same
    // plugins or with others
    view.updateState(EditorState.create({ schema, doc: doc(p("new")) }));
    expect(sync).toHaveBeenCalledTimes(2);
    view.updateState(
      EditorState.create({ schema, doc: doc(p("other")), plugins: [] }),
    );
    expect(sync).toHaveBeenCalledTimes(3);
    view.destroy();
  });
});

import { type Command, type EditorState, Plugin } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import {
  inject,
  type InjectionKey,
  markRaw,
  type ShallowRef,
  shallowRef,
} from "vue";

// What a component gets to work with the editor, see useEditor. The UI never
// holds the EditorView itself, only this handle, so a component can work with
// whichever editor it's placed in (e.g. later a header's or a footnote's).
export interface EditorHandle {
  // the view, e.g. to run a command or give it the focus; measure the text
  // through src/engine/geometry.ts, and don't change its DOM
  readonly view: EditorView;
  // the editor's state, replaced on every transaction, for computeds such as
  // whether a command can run or a mark is active
  readonly state: Readonly<ShallowRef<EditorState>>;
  // runs `command` and, unless `focus` is false, gives the editor the focus
  // back, since a click on the UI shouldn't leave the text
  run(command: Command, options?: { focus?: boolean }): boolean;
  // whether `command` can run now, without running it. It reads `state`, so
  // it can be used in a computed.
  can(command: Command): boolean;
  focus(): void;
}

/**
 * createEditorHandle creates the handle of `view`. `sync` updates the handle's
 * state, see syncPlugin.
 */
export const createEditorHandle = (view: EditorView) => {
  const state = shallowRef(view.state);
  // markRaw: the handle holds the view, which must never become reactive
  const handle: EditorHandle = markRaw({
    view,
    state,
    run: (command, { focus = true } = {}) => {
      const done = command(view.state, view.dispatch, view);
      if (focus) view.focus();
      return done;
    },
    can: (command) => command(state.value),
    focus: () => view.focus(),
  });
  const sync = () => {
    state.value = view.state;
  };
  return { handle, sync };
};

/**
 * syncPlugin calls `sync` whenever the view's state changes: after a
 * transaction, and also when a new document is set with `updateState` (e.g.
 * Open file), which doesn't go through dispatchTransaction. A state with other
 * plugins makes the view create its plugin views again instead of updating
 * them, so it syncs when its view is created too.
 */
export const syncPlugin = (sync: () => void) =>
  new Plugin({
    view: () => {
      sync();
      return { update: sync };
    },
  });

export const EditorKey: InjectionKey<EditorHandle> = Symbol("editor");

/**
 * useEditor returns the handle of the editor the component is placed in
 */
export const useEditor = (): EditorHandle => {
  const editor = inject(EditorKey);
  if (!editor) throw new Error("useEditor needs an editor provided above it");
  return editor;
};

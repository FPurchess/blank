import type { Node } from "prosemirror-model";
import {
  type Command,
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
} from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import type { EditorView, NodeView } from "prosemirror-view";
import { watch } from "vue";

import { inked, isVector, vectorOf, withFonts } from "../../engine/vectors";
import { schema } from "../../markdown";
import { isSourceBlock } from "../../markdown/blocks/sourceBlock";
import { announce, engineMissing } from "../../state";
import { PAGE_PRESS, type PagePointerEvent } from "../pagePointer";
import {
  openSourceAt,
  type Rendered,
  sourceKind,
  type SourceKind,
} from "../../sources/registry";
import {
  renderedOf,
  renderStates,
  requestRender,
  sourceKeyOf,
} from "../../sources/store";

// Blocks that hold their source, e.g. diagrams (src/sources/registry.ts):
// selected like any content block, opened by Enter or by typing, which puts
// the cursor into their source, and closed by Esc, which selects them again,
// or by moving out. While one is open, the pages show its source as code
// above what it makes (`sourceBlock` in src/engine/flatten.ts), which follows
// the typing once it pauses; while it can't be drawn, what is wrong, which
// is also said once it stays for a moment.

export interface SourceBlocksState {
  // the position of the open source block
  open: number | null;
  // the key of what the open one made last that could be drawn, shown while
  // what is typed can't be, so the page doesn't jump
  preview: string | null;
}

export const sourceBlocksKey = new PluginKey<SourceBlocksState>("sourceBlocks");

// how long an error stays before it's said, so typing doesn't say each one
const ERROR_DELAY = 1000;

/**
 * openBlock returns the open source block, if one is
 */
export const openBlock = (state: EditorState) => {
  const open = openSourceAt(state);
  return open && isSourceBlock(open.node) ? open : null;
};

/**
 * selectedSourceBlock returns the source block that is selected, if one is
 */
const selectedSourceBlock = (state: EditorState) => {
  const { selection } = state;
  return selection instanceof NodeSelection && isSourceBlock(selection.node)
    ? { node: selection.node, pos: selection.from }
    : null;
};

/**
 * enterSource opens the selected source block, with the cursor at the end
 * of its source
 */
export const enterSource: Command = (state, dispatch) => {
  const block = selectedSourceBlock(state);
  if (!block) return false;
  if (dispatch) {
    const end = block.pos + 1 + block.node.firstChild!.nodeSize - 1;
    dispatch(
      state.tr
        .setSelection(TextSelection.create(state.doc, end))
        .scrollIntoView(),
    );
  }
  return true;
};

/**
 * leaveSource closes the open source block and selects it
 */
export const leaveSource: Command = (state, dispatch) => {
  const open = openBlock(state);
  if (!open) return false;
  if (dispatch) {
    dispatch(state.tr.setSelection(NodeSelection.create(state.doc, open.pos)));
  }
  return true;
};

/**
 * closedBlockAt returns the position of the source block at `pos` that
 * isn't open, or null
 */
const closedBlockAt = (state: EditorState, pos: number) => {
  const node = state.doc.nodeAt(pos);
  if (!node || !isSourceBlock(node)) return null;
  return openBlock(state)?.pos === pos ? null : pos;
};

const good = (rendered: Rendered | undefined) => rendered?.ok === true;

/**
 * SourceBlockView shows a source block in the editor's DOM: its source, and
 * what is wrong with it for screen readers; without the engine also what it
 * makes, under the source, which shows only while it's open
 */
class SourceBlockView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  // what it makes, without the engine: its own preview, or a picture
  private picture: HTMLElement;
  private status: HTMLElement;
  private stop: () => void;
  // the drawing and ink the picture shows
  private shown = "";

  constructor(private node: Node) {
    this.dom = document.createElement("figure");
    this.dom.className = `source-block ${node.type.name}`;
    this.contentDOM = document.createElement("pre");
    this.contentDOM.setAttribute("data-blank-source", node.type.name);
    this.picture = document.createElement("div");
    this.picture.className = "source-preview";
    this.picture.contentEditable = "false";
    this.status = document.createElement("div");
    this.status.className = "source-error";
    this.status.contentEditable = "false";
    this.dom.append(this.contentDOM, this.picture, this.status);
    this.stop = watch([renderStates, engineMissing], () => this.render(), {
      immediate: true,
      flush: "sync",
    });
  }

  private render() {
    const kind = sourceKind(this.node.type.name);
    const rendered = renderedOf(this.node);
    const label =
      (this.node.attrs.alt as string) ||
      kind?.label(this.node.textContent) ||
      "";
    this.dom.setAttribute("aria-label", label);
    this.picture.hidden = true;
    // only without the engine, where the editor itself shows: the picture
    // in the theme's ink, which follows the text's colour
    if (engineMissing.value) this.preview(kind, rendered, label);
    const said =
      rendered?.ok === false
        ? rendered.error
        : rendered?.ok === "unavailable"
          ? rendered.reason
          : "";
    this.status.textContent = said;
    this.status.hidden = !said;
  }

  /**
   * preview shows what it makes, built again only when that or the ink
   * changed
   */
  private preview(
    kind: SourceKind<unknown> | undefined,
    rendered: Rendered | undefined,
    label: string,
  ) {
    const key = sourceKeyOf(this.node);
    const ink = getComputedStyle(document.body).color || "#000";
    // built again only when what it shows, or its ink, changed
    const shown = `${key} ${ink} ${rendered?.ok}`;
    if (kind?.preview) {
      if (shown !== this.shown) {
        this.picture.replaceChildren(
          kind.preview(this.node.textContent, rendered),
        );
        this.shown = shown;
      }
      this.picture.hidden = false;
      return;
    }
    const drawing = good(rendered) && isVector(key) ? vectorOf(key) : undefined;
    if (!drawing) return;
    if (shown !== this.shown) {
      const image = document.createElement("img");
      image.alt = label;
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        withFonts(inked(drawing.svg, ink)),
      )}`;
      this.picture.replaceChildren(image);
      this.shown = shown;
    }
    this.picture.hidden = false;
  }

  update(node: Node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  ignoreMutation(mutation: MutationRecord | { type: "selection" }) {
    // only what is typed into the source is the editor's
    return (
      mutation.type !== "selection" &&
      !this.contentDOM.contains(mutation.target as globalThis.Node)
    );
  }

  destroy() {
    this.stop();
  }
}

/**
 * sourceBlocks keeps which source block is open, renders what the sources
 * make, and opens and closes them
 */
export const sourceBlocks = () =>
  new Plugin<SourceBlocksState>({
    key: sourceBlocksKey,
    state: {
      init: (_, state) => ({
        open: openBlock(state)?.pos ?? null,
        preview: null,
      }),
      apply: (_tr, value, before, after) => {
        const open = openBlock(after);
        if (!open) return { open: null, preview: null };
        // what it made last that could be drawn: now, or before the change
        const was = openBlock(before);
        const now = renderedOf(open.node);
        const preview = good(now)
          ? sourceKeyOf(open.node)
          : was && good(renderedOf(was.node))
            ? sourceKeyOf(was.node)
            : value.open === null
              ? null
              : value.preview;
        if (open.pos === value.open && preview === value.preview) return value;
        return { open: open.pos, preview };
      },
    },
    props: {
      nodeViews: Object.fromEntries(
        Object.values(schema.nodes)
          .filter((type) => type.spec.sourceBlock)
          .map((type) => [
            type.name,
            (node: Node) => new SourceBlockView(node),
          ]),
      ),
      decorations: (state) => {
        const open = sourceBlocksKey.getState(state)?.open;
        if (open === null || open === undefined) return null;
        const node = state.doc.nodeAt(open);
        if (!node) return null;
        return DecorationSet.create(state.doc, [
          Decoration.node(open, open + node.nodeSize, { class: "open" }),
        ]);
      },
      handleDOMEvents: {
        // a click on a closed source block opens it, the cursor at the end
        // of its source, as Enter on the selected block does; with a
        // modifier it's the page view's (e.g. Shift extends the selection)
        [PAGE_PRESS]: (view, event: PagePointerEvent) => {
          const { button, pos, shiftKey, ctrlKey, metaKey, altKey } =
            event.detail;
          if (button !== 0 || pos === null) return false;
          if (shiftKey || ctrlKey || metaKey || altKey) return false;
          const block = closedBlockAt(view.state, pos);
          if (block === null) return false;
          event.preventDefault();
          const selected = view.state.tr.setSelection(
            NodeSelection.create(view.state.doc, block),
          );
          return enterSource(view.state.apply(selected), (tr) =>
            view.dispatch(selected.setSelection(tr.selection).scrollIntoView()),
          );
        },
      },
      handleKeyDown: (view, event) => {
        if (
          event.key !== "Escape" ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          event.shiftKey
        )
          return false;
        return leaveSource(view.state, view.dispatch, view);
      },
    },
    view(view) {
      // what is wrong with the open block, said once it stays
      let timer: ReturnType<typeof setTimeout> | undefined;
      let said = "";
      const renderAround = (editor: EditorView, typing: Node | null) => {
        editor.state.doc.descendants((node) => {
          if (!sourceKind(node.type.name)) return !node.isTextblock;
          if (node !== typing) requestRender(node);
          return false;
        });
        if (typing) requestRender(typing, true);
      };
      const tell = (editor: EditorView) => {
        clearTimeout(timer);
        const open = openBlock(editor.state);
        const rendered = open && renderedOf(open.node);
        const error = rendered?.ok === false ? rendered.error : "";
        if (!error) {
          said = "";
          return;
        }
        if (error === said) return;
        timer = setTimeout(() => {
          said = error;
          const name = open?.kind.label(open.node.textContent) ?? "";
          announce(`${name}: ${error.split("\n")[0]}`, { quiet: true });
        }, ERROR_DELAY);
      };
      renderAround(view, null);
      const stop = watch(renderStates, () => tell(view), { flush: "sync" });
      return {
        update(editor, previous) {
          if (editor.state.doc === previous.doc) return;
          renderAround(editor, openBlock(editor.state)?.node ?? null);
          tell(editor);
        },
        destroy() {
          clearTimeout(timer);
          stop();
        },
      };
    },
  });

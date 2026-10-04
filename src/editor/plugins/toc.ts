import type { Node } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import type { EditorView, NodeView } from "prosemirror-view";
import { watch } from "vue";

import { scrollToHeading } from "../../engine/geometry";
import { listedHeadings } from "../../markdown/headings";
import { headings } from "../../state";
import { PAGE_PRESS, type PagePointerEvent } from "../pagePointer";
import { hasOpenModifier } from "./openLink";

// A table of contents in the editor. The layout engine lays it out on the
// pages with its page numbers, and its entries are links to their headings
// there (see src-tauri/layout/src/engine/display.rs, TOC_LINK). This plugin
// follows them on Ctrl+Click (Cmd+Click on macOS), as links open, and shows
// it in the editor's own DOM as a list of the headings: what screen readers
// read, and what shows without the engine. Enter on a selected one opens
// its settings (see ./blockTools.ts).

// the start of an entry's link, followed by the entry's number, as the
// engine writes it (TOC_LINK in src-tauri/layout/src/engine/display.rs)
const TOC_LINK = "#toc:";

// what an empty one says, as on the pages (src-tauri/layout/src/items/toc.rs)
const EMPTY = "The headings of the document will be listed here";

/**
 * followEntry scrolls to the heading of an entry of the table of contents at
 * `pos`, as the outline does, and leaves the selection where it is
 */
export const followEntry = (view: EditorView, pos: number, entry: number) => {
  const toc = view.state.doc.nodeAt(pos);
  if (toc?.type.name !== "toc") return false;
  const heading = listedHeadings(view.state.doc, toc.attrs.depth as number)[
    entry
  ];
  if (!heading) return false;
  scrollToHeading(heading.pos);
  return true;
};

/**
 * entryOf returns the number of the entry a link of a table of contents goes
 * to, or null for another link
 */
const entryOf = (href: string | null | undefined) =>
  href?.startsWith(TOC_LINK) ? Number(href.slice(TOC_LINK.length)) : null;

/**
 * TocView shows a table of contents in the editor's DOM: its title and the
 * headings it lists, as links to them
 */
class TocView implements NodeView {
  dom: HTMLElement;
  private stop: () => void;

  constructor(
    private node: Node,
    private view: EditorView,
  ) {
    this.dom = document.createElement("nav");
    this.dom.className = "toc";
    this.dom.setAttribute("data-blank-toc", "");
    this.dom.contentEditable = "false";
    // the headings store changes with the headings, which another block
    // holds: the node itself stays the same
    this.stop = watch(headings, () => this.render(), {
      immediate: true,
      flush: "sync",
    });
  }

  private render() {
    const depth = this.node.attrs.depth as number;
    const title = this.node.attrs.title as string;
    this.dom.setAttribute("aria-label", title || "Table of contents");
    const listed = listedHeadings(this.view.state.doc, depth);
    const children: HTMLElement[] = [];
    if (title) {
      const caption = document.createElement("p");
      caption.className = "toc-title";
      caption.textContent = title;
      children.push(caption);
    }
    if (listed.length === 0) {
      const empty = document.createElement("p");
      empty.className = "toc-empty";
      empty.textContent = EMPTY;
      children.push(empty);
    } else {
      const list = document.createElement("ol");
      listed.forEach((heading, index) => {
        const item = document.createElement("li");
        item.className = `toc-level-${heading.level}`;
        const link = document.createElement("a");
        link.href = `${TOC_LINK}${index}`;
        link.textContent = heading.text;
        item.append(link);
        list.append(item);
      });
      children.push(list);
    }
    this.dom.replaceChildren(...children);
  }

  update(node: Node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  ignoreMutation() {
    return true;
  }

  destroy() {
    this.stop();
  }
}

/**
 * toc follows the entries of tables of contents and shows them in the
 * editor's DOM, see the comment on top
 */
export const toc = () =>
  new Plugin({
    props: {
      // an entry clicked in the editor's own DOM, without the engine
      handleClick: (view, _pos, event) => {
        if (event.button !== 0 || !hasOpenModifier(event)) return false;
        const target = event.target instanceof Element ? event.target : null;
        const link = target?.closest(`.toc a[href^="${TOC_LINK}"]`);
        const nav = link?.closest(".toc");
        if (!link || !nav) return false;
        const entry = entryOf(link.getAttribute("href"));
        if (entry === null) return false;
        event.preventDefault();
        return followEntry(view, view.posAtDOM(nav, 0), entry) || true;
      },
      handleDOMEvents: {
        // an entry's link in the editor's own DOM never takes the webview to
        // its hash; with the modifier, handleClick follows it
        click: (_view, event) => {
          const target = event.target instanceof Element ? event.target : null;
          if (target?.closest(`.toc a[href^="${TOC_LINK}"]`)) {
            event.preventDefault();
          }
          return false;
        },
        // an entry clicked on the pages, see src/editor/pagePointer.ts
        [PAGE_PRESS]: (view, event: PagePointerEvent) => {
          const { button, link, pos } = event.detail;
          const entry = entryOf(link);
          if (button !== 0 || entry === null || pos === null) return false;
          if (!hasOpenModifier(event.detail)) return false;
          event.preventDefault();
          followEntry(view, pos, entry);
          return true;
        },
      },
      nodeViews: {
        toc: (node, view) => new TocView(node, view),
      },
    },
  });

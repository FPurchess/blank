import { Plugin } from "prosemirror-state";
import type { Node } from "prosemirror-model";
import type { NodeView } from "prosemirror-view";

import { convertFileSrc } from "@tauri-apps/api/core";

import { path } from "../../state";
import { classifySrc, resolveLocalPath } from "../../images/src";

// shown instead of a relative image until the document has a folder
export const UNRESOLVED_CLASS = "image-unresolved";

/**
 * displaySrc returns the url the webview loads an image `src` from. The page
 * is served from the app, so local images go through Tauri's asset protocol.
 * @param src src of the image node
 * @param docPath path of the document, null if it hasn't been saved yet
 * @returns the url, or null for a relative src without a document folder
 */
export const displaySrc = (src: string, docPath: string | null) => {
  const kind = classifySrc(src);
  if (kind === "data" || kind === "remote") return src;

  const file = resolveLocalPath(src, docPath);
  if (file === null) return null;
  try {
    return convertFileSrc(file);
  } catch {
    // outside of Tauri, e.g. `bun run dev` in a browser
    return src;
  }
};

class ImageView implements NodeView {
  dom: HTMLSpanElement;
  private img: HTMLImageElement;

  constructor(
    private node: Node,
    private views: Set<ImageView>,
  ) {
    this.dom = document.createElement("span");
    this.dom.className = "image";
    this.img = document.createElement("img");
    this.dom.appendChild(this.img);
    this.render();
    views.add(this);
  }

  render() {
    const { src, alt, title } = this.node.attrs as {
      src: string;
      alt: string | null;
      title: string | null;
    };
    const url = displaySrc(src, path.value);

    this.img.alt = alt ?? "";
    if (title) this.img.title = title;
    else this.img.removeAttribute("title");
    this.dom.dataset.alt = alt || src;
    this.dom.classList.toggle(UNRESOLVED_CLASS, url === null);
    if (url === null) this.img.removeAttribute("src");
    else if (this.img.getAttribute("src") !== url) this.img.src = url;
  }

  update(node: Node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  destroy() {
    this.views.delete(this);
  }
}

/**
 * images renders image nodes, resolving local images against the folder of
 * the document, also after it moved (e.g. Save as)
 */
export default () => {
  const views = new Set<ImageView>();

  return new Plugin({
    props: {
      nodeViews: {
        image: (node) => new ImageView(node, views),
      },
    },
    view: () => {
      const unsubscribe = path.subscribe(() => {
        views.forEach((view) => view.render());
      });
      return { destroy: unsubscribe };
    },
  });
};

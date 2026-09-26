import { beforeEach, describe, expect, it } from "vitest";
import { schema } from "prosemirror-markdown";
import type { Node } from "prosemirror-model";
import type { EditorView, NodeView } from "prosemirror-view";

import { mockConvertFileSrc } from "@tauri-apps/api/mocks";

import { path } from "../../state";
import images, { UNRESOLVED_CLASS, displaySrc } from "./images";

const image = (src: string, alt: string | null = "Alt", title?: string) =>
  schema.node("image", { src, alt, title: title ?? null });

const asset = (file: string) => `asset://localhost/${encodeURIComponent(file)}`;

/**
 * render creates the node view of `node` and returns it with its <img>
 */
const render = (plugin: ReturnType<typeof images>, node: Node) => {
  const create = plugin.props.nodeViews!.image;
  const view = create(
    node,
    {} as EditorView,
    () => 0,
    [],
    {} as never,
  ) as NodeView;
  return { view, img: view.dom.firstChild as HTMLImageElement };
};

describe("plugins.images", () => {
  beforeEach(() => {
    mockConvertFileSrc("linux");
    path.value = "/home/u/notes.md";
  });

  describe("displaySrc", () => {
    it("loads data and remote images as they are", () => {
      expect(displaySrc("data:image/png;base64,AAAA", null)).toBe(
        "data:image/png;base64,AAAA",
      );
      expect(displaySrc("https://example.com/a.png", null)).toBe(
        "https://example.com/a.png",
      );
    });

    it("loads local images through the asset protocol", () => {
      expect(displaySrc("img/a%20b.png", "/home/u/notes.md")).toBe(
        asset("/home/u/img/a b.png"),
      );
      expect(displaySrc("/srv/a.png", null)).toBe(asset("/srv/a.png"));
    });

    it("can't resolve relative images of an unsaved document", () => {
      expect(displaySrc("img/a.png", null)).toBeNull();
    });

    it("keeps the src outside of Tauri", () => {
      delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;

      expect(displaySrc("/srv/a.png", null)).toBe("/srv/a.png");
    });
  });

  it("renders an image with its alt text and title", () => {
    const { view, img } = render(images(), image("img/a.png", "Chart", "T"));

    expect(view.dom.className).toBe("image");
    expect((view.dom as HTMLElement).dataset.alt).toBe("Chart");
    expect(img.getAttribute("src")).toBe(asset("/home/u/img/a.png"));
    expect(img.alt).toBe("Chart");
    expect(img.title).toBe("T");
  });

  it("shows the alt text of relative images until the document is saved", () => {
    path.value = null;
    const { view, img } = render(images(), image("img/a.png", null));

    expect(view.dom.classList).toContain(UNRESOLVED_CLASS);
    expect((view.dom as HTMLElement).dataset.alt).toBe("img/a.png");
    expect(img.hasAttribute("src")).toBe(false);
  });

  it("resolves images again when the document moves", () => {
    const plugin = images();
    const { img } = render(plugin, image("a.png"));
    const pluginView = plugin.spec.view!({} as EditorView);

    path.value = "/tmp/copy.md";
    expect(img.getAttribute("src")).toBe(asset("/tmp/a.png"));

    pluginView.destroy!();
    path.value = "/elsewhere/notes.md";
    expect(img.getAttribute("src")).toBe(asset("/tmp/a.png"));
  });

  it("updates the image when the node changes", () => {
    const { view, img } = render(images(), image("a.png", "A", "T"));

    expect(view.update!(image("b.png", "B"), [], {} as never)).toBe(true);
    expect(img.getAttribute("src")).toBe(asset("/home/u/b.png"));
    expect(img.alt).toBe("B");
    expect(img.hasAttribute("title")).toBe(false);

    expect(view.update!(schema.text("x"), [], {} as never)).toBe(false);
  });

  it("stops updating destroyed views", () => {
    const plugin = images();
    const { view, img } = render(plugin, image("a.png"));
    plugin.spec.view!({} as EditorView);

    view.destroy!();
    path.value = "/tmp/copy.md";

    expect(img.getAttribute("src")).toBe(asset("/home/u/a.png"));
  });
});

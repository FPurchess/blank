import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Node } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import { schema } from "prosemirror-markdown";

import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { imageDialog, type ImageDialogRequest } from "../../state";
import { IMAGES, bytesOf, dataUrl } from "../../test/images";
import {
  codeBlock,
  createState,
  createTestView,
  doc,
  type StateOptions,
} from "../../test/editor";
import editImage, {
  IMAGE_EXTENSIONS,
  chooseImageFile,
  findImageTarget,
} from "./editImage";

vi.mock("../../images/codec", () => ({
  decodeSize: vi.fn(),
  rasterize: vi.fn(),
}));

const image = (
  src = "a.png",
  alt: string | null = "A",
  title: string | null = null,
) => schema.node("image", { src, alt, title });
const text = (content: string) => schema.text(content);
const para = (...nodes: Node[]) => schema.node("paragraph", null, nodes);

// "ab" + image + "cd": the image sits at 3
const withImage = (node = image()) => doc(para(text("ab"), node, text("cd")));

const setup = (node: Node, options: StateOptions = {}) => {
  const view = createTestView(createState(node, options));
  view.focus = vi.fn();
  return view;
};

const openDialog = (view: ReturnType<typeof setup>) => {
  expect(editImage()(view.state, view.dispatch, view)).toBe(true);
  return imageDialog.value as ImageDialogRequest;
};

describe("command.editImage", () => {
  beforeEach(() => {
    imageDialog.value = null;
  });

  describe("findImageTarget", () => {
    it.each([
      ["before", 3],
      ["after", 4],
    ])("finds the image right %s the cursor", (_, cursor) => {
      expect(findImageTarget(createState(withImage(), { cursor }))).toEqual({
        from: 3,
        to: 4,
        node: image(),
      });
    });

    it("finds a selected image", () => {
      const state = createState(withImage());
      const selected = state.apply(
        state.tr.setSelection(NodeSelection.create(state.doc, 3)),
      );

      expect(findImageTarget(selected)).toMatchObject({ from: 3, to: 4 });
    });

    it("inserts at the cursor or replaces the selection otherwise", () => {
      const node = doc(para(text("abcd")));

      expect(findImageTarget(createState(node, { cursor: 2 }))).toEqual({
        from: 2,
        to: 2,
        node: null,
      });
      expect(findImageTarget(createState(node, { cursor: [2, 4] }))).toEqual({
        from: 2,
        to: 4,
        node: null,
      });
    });

    it("finds nothing where no image can go", () => {
      expect(
        findImageTarget(createState(doc(codeBlock("code")), { cursor: 2 })),
      ).toBeNull();
      expect(
        findImageTarget(
          createState(doc(para(text("a")), para(text("b"))), {
            cursor: [1, 5],
          }),
        ),
      ).toBeNull();
    });
  });

  it("isn't available where no image can go", () => {
    const view = setup(doc(codeBlock("code")), { cursor: 2 });

    expect(editImage()(view.state, view.dispatch, view)).toBe(false);
    expect(imageDialog.value).toBeNull();
  });

  it("reports availability without opening the dialog", () => {
    const view = setup(withImage(), { cursor: 3 });

    expect(editImage()(view.state)).toBe(true);
    expect(imageDialog.value).toBeNull();
  });

  it("opens the dialog for a new image", () => {
    const view = setup(doc(para(text("ab"))), { cursor: 2 });

    expect(openDialog(view)).toMatchObject({ src: "", alt: "", isEdit: false });
  });

  it("doesn't open a second dialog", () => {
    const view = setup(doc(para(text("ab"))), { cursor: 2 });
    const first = openDialog(view);

    expect(openDialog(view)).toBe(first);
  });

  it("inserts an image at the cursor", () => {
    const view = setup(doc(para(text("abcd"))), { cursor: 3 });

    openDialog(view).submit("images/my chart.png", " Chart ");

    expect(view.state.doc.toJSON()).toEqual(
      doc(
        para(text("ab"), image("images/my%20chart.png", "Chart"), text("cd")),
      ).toJSON(),
    );
    expect(view.state.selection.from).toBe(4);
    expect(view.focus).toHaveBeenCalled();
  });

  it("edits the image at the cursor, keeping its title", () => {
    const view = setup(withImage(image("a.png", "A", "Title")), { cursor: 3 });
    const request = openDialog(view);

    expect(request).toMatchObject({ src: "a.png", alt: "A", isEdit: true });
    const embedded = dataUrl("image/png", IMAGES.png);
    request.submit(embedded, "");

    expect(view.state.doc.toJSON()).toEqual(
      withImage(image(embedded, null, "Title")).toJSON(),
    );
  });

  it("removes the image", () => {
    const view = setup(withImage(), { cursor: 4 });

    openDialog(view).remove();

    expect(view.state.doc.toJSON()).toEqual(doc(para(text("abcd"))).toJSON());
  });

  it("ignores an empty source", () => {
    const view = setup(doc(para(text("ab"))), { cursor: 2 });
    const before = view.state.doc;

    openDialog(view).submit("  ", "alt");

    expect(view.state.doc).toBe(before);
    expect(view.focus).toHaveBeenCalled();
  });

  it("refuses changes after the document changed", () => {
    const view = setup(doc(para(text("ab"))), { cursor: 2 });
    const request = openDialog(view);
    view.dispatch(view.state.tr.insertText("x", 1));
    const changed = view.state.doc;

    request.submit("a.png", "");

    expect(view.state.doc).toBe(changed);
    expect(sendNotification).toHaveBeenCalledWith(
      "Failed to change the image: the document changed",
    );
  });

  it("returns the focus on cancel", () => {
    const view = setup(doc(para(text("ab"))), { cursor: 2 });

    openDialog(view).cancel();

    expect(view.focus).toHaveBeenCalled();
  });

  describe("chooseImageFile", () => {
    it("embeds the chosen image file", async () => {
      vi.mocked(open).mockResolvedValue("/pictures/chart.png");
      vi.mocked(readFile).mockResolvedValue(bytesOf(IMAGES.png));

      expect(await chooseImageFile()).toEqual({
        src: dataUrl("image/png", IMAGES.png),
        name: "chart.png",
      });
      expect(open).toHaveBeenCalledWith({
        filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
      });
    });

    it("returns nothing when the dialog is cancelled or fails", async () => {
      vi.mocked(open).mockResolvedValue(null);
      expect(await chooseImageFile()).toBeNull();

      vi.spyOn(console, "error").mockImplementation(() => {});
      vi.mocked(open).mockRejectedValue(new Error("no dialog"));
      expect(await chooseImageFile()).toBeNull();
      expect(readFile).not.toHaveBeenCalled();
    });

    it("reports files that aren't images", async () => {
      vi.mocked(open).mockResolvedValue("/notes/text.png");
      vi.mocked(readFile).mockResolvedValue(new TextEncoder().encode("text"));

      expect(await chooseImageFile()).toBeNull();
      expect(sendNotification).toHaveBeenCalledWith(
        "text.png isn't an image Blank can show",
      );
    });

    it("reports files that can't be read", async () => {
      vi.mocked(open).mockResolvedValue("/secret.png");
      vi.mocked(readFile).mockRejectedValue("forbidden");

      expect(await chooseImageFile()).toBeNull();
      expect(sendNotification).toHaveBeenCalledWith(
        "Failed to read secret.png: forbidden",
      );
    });
  });
});

import type { Node } from "prosemirror-model";
import {
  type Command,
  type EditorState,
  NodeSelection,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { schema } from "prosemirror-markdown";

import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { type ChosenImage, imageDialog } from "../../state";
import { basename } from "../../paths";
import { toDataUrl } from "../../images/dataUrl";
import { optimizeForMarkdown } from "../../images/optimize";
import { normalizeUrl } from "../../url";

const imageType = schema.nodes.image;

// what the file dialog offers; optimizeForMarkdown converts the ones the
// markdown parser doesn't keep as data: URL
export const IMAGE_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "svg",
  "bmp",
  "tif",
  "tiff",
];

export interface ImageTarget {
  from: number;
  to: number;
  // the existing image at the target, or null to insert a new one
  node: Node | null;
}

/**
 * findImageTarget returns what Mod+Alt+I works on: the selected image or the
 * one next to the cursor, or else the selection, which a new image replaces.
 * It returns null where no image can be placed, e.g. in a code block.
 */
export const findImageTarget = (state: EditorState): ImageTarget | null => {
  const { selection } = state;
  if (selection instanceof NodeSelection && selection.node.type === imageType) {
    return { from: selection.from, to: selection.to, node: selection.node };
  }

  const { $from, $to, from, to, empty } = selection;
  if (
    !$from.sameParent($to) ||
    !$from.parent.inlineContent ||
    !$from.parent.type.contentMatch.matchType(imageType)
  ) {
    return null;
  }
  if (empty) {
    const { nodeAfter, nodeBefore } = $from;
    if (nodeAfter?.type === imageType) {
      return { from, to: from + nodeAfter.nodeSize, node: nodeAfter };
    }
    if (nodeBefore?.type === imageType) {
      return { from: from - nodeBefore.nodeSize, to, node: nodeBefore };
    }
  }
  return { from, to, node: null };
};

/**
 * chooseImageFile lets the user pick an image file and embeds it, scaled down
 * like imported images
 */
export const chooseImageFile = async (): Promise<ChosenImage | null> => {
  const file = await open({
    filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
  }).catch((err: unknown) => {
    console.error("Failed to open the file dialog", err);
    return null;
  });
  if (typeof file !== "string") return null;

  const name = basename(file);
  try {
    const image = await optimizeForMarkdown(await readFile(file), null);
    if (!image) {
      sendNotification(`${name} isn't an image Blank can show`);
      return null;
    }
    return { src: await toDataUrl(image.bytes, image.mime), name };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    sendNotification(`Failed to read ${name}: ${message}`);
    return null;
  }
};

export const _openImageDialog = (view: EditorView) => {
  const target = findImageTarget(view.state);
  if (!target) return;
  const { from, to, node } = target;
  const openedDoc = view.state.doc;

  // apply runs `change` unless the document changed while the dialog was open
  const apply = (change: (tr: Transaction) => void) => {
    if (view.state.doc !== openedDoc) {
      sendNotification("Failed to change the image: the document changed");
    } else {
      const tr = view.state.tr;
      change(tr);
      view.dispatch(tr.scrollIntoView());
    }
    view.focus();
  };

  imageDialog.value = {
    src: (node?.attrs.src as string | undefined) ?? "",
    alt: (node?.attrs.alt as string | null | undefined) ?? "",
    isEdit: node !== null,
    chooseFile: chooseImageFile,
    submit: (rawSrc, alt) => {
      // an embedded image is kept as is, a typed path or address is encoded
      // like the markdown parser does, so it survives saving
      const src = rawSrc.startsWith("data:") ? rawSrc : normalizeUrl(rawSrc);
      if (src === "") {
        view.focus();
        return;
      }
      const image = imageType.create({
        src,
        alt: alt.trim() || null,
        title: node?.attrs.title ?? null,
      });
      apply((tr) => {
        tr.replaceWith(from, to, image);
        tr.setSelection(TextSelection.create(tr.doc, from + image.nodeSize));
      });
    },
    remove: () => {
      apply((tr) => {
        tr.delete(from, to);
      });
    },
    cancel: () => {
      view.focus();
    },
  };
};

export default (): Command => (state, dispatch, view) => {
  if (!findImageTarget(state)) return false;
  if (!dispatch || !view) return true;
  if (imageDialog.value === null) _openImageDialog(view);
  return true;
};

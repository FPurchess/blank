import type { Mark, ResolvedPos } from "prosemirror-model";
import {
  type Command,
  type EditorState,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { schema } from "prosemirror-markdown";

import { readText } from "@tauri-apps/plugin-clipboard-manager";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { linkDialog } from "../../state";
import { isAbsoluteUrl, isSavableUrl, normalizeUrl } from "../../url";

const linkType = schema.marks.link;

export interface LinkTarget {
  from: number;
  to: number;
  text: string;
  // the existing link at the target, or null for a new link
  mark: Mark | null;
}

const findLinkMark = (marks: readonly Mark[] = []) =>
  marks.find((mark) => mark.type === linkType);

// hard breaks and images show as a space instead of disappearing
const textOf = (state: EditorState, from: number, to: number) =>
  state.doc.textBetween(from, to, undefined, " ");

/**
 * linkRange returns the range of the contiguous inline nodes around $pos
 * that carry `mark`, i.e. the whole link $pos is in
 */
const linkRange = ($pos: ResolvedPos, mark: Mark) => {
  let pos = $pos.start();
  let from = -1;
  for (let i = 0; i < $pos.parent.childCount; i++) {
    const child = $pos.parent.child(i);
    if (mark.isInSet(child.marks)) {
      if (from === -1) from = pos;
    } else if (from !== -1) {
      if (from <= $pos.pos && $pos.pos <= pos) return { from, to: pos };
      from = -1;
    }
    pos += child.nodeSize;
  }
  return from !== -1 && from <= $pos.pos ? { from, to: pos } : null;
};

/**
 * findLinkTarget returns what Mod+K links: the existing link at the cursor or
 * around the selection, or else the selection. It returns null where no link
 * can be placed, e.g. in a code block or for a selection across blocks.
 */
export const findLinkTarget = (state: EditorState): LinkTarget | null => {
  const { $from, $to, from, to, empty } = state.selection;
  const parent = $from.parent;
  if (
    !$from.sameParent($to) ||
    !parent.inlineContent ||
    !parent.type.allowsMarkType(linkType)
  ) {
    return null;
  }

  // links are not inclusive, so $from.marks() misses a cursor at either edge
  const mark = empty
    ? (findLinkMark($from.nodeBefore?.marks) ??
      findLinkMark($from.nodeAfter?.marks))
    : findLinkMark($from.nodeAfter?.marks);
  if (mark) {
    const range = linkRange($from, mark);
    if (range && to <= range.to) {
      return { ...range, text: textOf(state, range.from, range.to), mark };
    }
  }

  return { from, to, text: textOf(state, from, to), mark: null };
};

/**
 * readClipboardUrl returns the clipboard content if it is a complete url that
 * can be saved as markdown link, or else an empty string
 */
const readClipboardUrl = async () => {
  try {
    const text = await readText();
    const url = typeof text === "string" ? normalizeUrl(text) : "";
    return isAbsoluteUrl(url) && isSavableUrl(url) ? url : "";
  } catch {
    return "";
  }
};

// opening is true while the clipboard is read, before the dialog is shown
let opening = false;

export const _openLinkDialog = async (view: EditorView) => {
  opening = true;
  try {
    const clipboardUrl = findLinkTarget(view.state)?.mark
      ? ""
      : await readClipboardUrl();

    // the selection may have changed while the clipboard was read
    const target = findLinkTarget(view.state);
    if (!target) return;
    const { from, to, text, mark } = target;
    const openedDoc = view.state.doc;

    // apply runs `change` unless the document changed while the dialog was open
    const apply = (change: (tr: Transaction) => void) => {
      if (view.state.doc !== openedDoc) {
        sendNotification("Failed to change the link: the document changed");
      } else {
        const tr = view.state.tr;
        change(tr);
        view.dispatch(tr.scrollIntoView());
      }
      view.focus();
    };

    linkDialog.value = {
      url: mark ? (mark.attrs.href as string) : clipboardUrl,
      text,
      isEdit: mark !== null,
      submit: (rawUrl, rawText) => {
        const url = normalizeUrl(rawUrl);
        if (url === "" || !isSavableUrl(url)) {
          view.focus();
          return;
        }
        const linkText = rawText.trim() === "" ? url : rawText;
        const link = linkType.create({
          href: url,
          title: mark?.attrs.title ?? null,
        });

        apply((tr) => {
          let end = to;
          if (linkText === text) {
            // keeps the formatting, hard breaks and images of the linked text
            tr.addMark(from, to, link);
          } else {
            const marks =
              from < to
                ? (tr.doc.nodeAt(from)?.marks ?? [])
                : (view.state.storedMarks ?? tr.doc.resolve(from).marks());
            const otherMarks = marks.filter((m) => m.type !== linkType);
            tr.replaceWith(
              from,
              to,
              schema.text(linkText, link.addToSet(otherMarks)),
            );
            end = from + linkText.length;
          }
          tr.setSelection(TextSelection.create(tr.doc, end));
        });
      },
      convertToText: () => {
        apply((tr) => {
          tr.removeMark(from, to, linkType);
        });
      },
      cancel: () => {
        view.focus();
      },
    };
  } finally {
    opening = false;
  }
};

export default (): Command => (state, dispatch, view) => {
  if (!findLinkTarget(state)) return false;
  if (!dispatch || !view) return true;
  if (!opening && linkDialog.value === null) {
    _openLinkDialog(view);
  }
  return true;
};

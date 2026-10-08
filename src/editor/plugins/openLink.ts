import { Plugin } from "prosemirror-state";
import type { Mark } from "prosemirror-model";
import type { EditorView } from "prosemirror-view";

import { openUrl } from "@tauri-apps/plugin-opener";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { errorMessage } from "../../errors";
import { isMac } from "../../platform";
import { PAGE_PRESS, type PagePointerEvent } from "../pagePointer";
import { logError } from "../../log";

// set on the editor while the modifier to open links is held
const FOLLOW_CLASS = "follow-links";

// links the default opener permission allows to open (see capabilities)
const OPENABLE_URL = /^(https?|mailto|tel):/i;

export const hasOpenModifier = (event: {
  metaKey: boolean;
  ctrlKey: boolean;
}) => (isMac() ? event.metaKey : event.ctrlKey);

/**
 * linkHint returns the tooltip of a link: its title, its url, and how to
 * open it
 */
export const linkHint = (href: string, title?: string | null) => {
  const hint = OPENABLE_URL.test(href)
    ? `${isMac() ? "Cmd" : "Ctrl"}+Click to open`
    : null;
  return [title, href, hint].filter(Boolean).join("\n");
};

/**
 * _openLink opens href with the default application, e.g. the browser
 * @param href url of the link
 */
export const _openLink = async (href: string) => {
  if (!OPENABLE_URL.test(href)) {
    sendNotification("Only web, mail and phone links can be opened");
    return;
  }
  try {
    await openUrl(href);
  } catch (err) {
    // without the error, which names the link: the document's text
    logError("failed to open a link");
    sendNotification(`Failed to open link: ${errorMessage(err)}`);
  }
};

/**
 * linkView renders a link with a tooltip that shows its url and how to open it
 */
const linkView = (mark: Mark) => {
  const href = mark.attrs.href as string;
  const dom = document.createElement("a");
  dom.setAttribute("href", href);
  dom.title = linkHint(href, mark.attrs.title as string | null);
  return { dom };
};

/**
 * linkAt returns the editor link that `event` targets
 */
const linkAt = (view: EditorView, event: Event) => {
  const target = event.target instanceof Element ? event.target : null;
  const link = target?.closest("a[href]");
  return link && view.dom.contains(link) ? link : null;
};

const toggleFollowClass = (view: EditorView, event: Event) => {
  view.dom.classList.toggle(
    FOLLOW_CLASS,
    event instanceof MouseEvent || event instanceof KeyboardEvent
      ? hasOpenModifier(event)
      : false,
  );
  return false;
};

/**
 * openLink opens links on Ctrl+Click (Cmd+Click on macOS)
 */
export default () =>
  new Plugin({
    props: {
      handleClick: (view, _pos, event) => {
        if (event.button !== 0 || !hasOpenModifier(event)) return false;
        const link = linkAt(view, event);
        if (!link) return false;

        _openLink(link.getAttribute("href") ?? "");
        return true;
      },
      handleDOMEvents: {
        // a press on a link on the pages, see src/editor/pagePointer.ts
        [PAGE_PRESS]: (_view, event: PagePointerEvent) => {
          const { button, link } = event.detail;
          if (button !== 0 || !link || !hasOpenModifier(event.detail))
            return false;
          event.preventDefault();
          _openLink(link);
          return true;
        },
        // handleClick runs on mouseup, so also cancel what the webview itself
        // might do on the following click, e.g. open the link in a new window
        click: (view, event) => {
          if (hasOpenModifier(event) && linkAt(view, event)) {
            event.preventDefault();
          }
          return false;
        },
        mousemove: toggleFollowClass,
        keydown: toggleFollowClass,
        keyup: toggleFollowClass,
        blur: toggleFollowClass,
      },
      markViews: {
        link: linkView,
      },
    },
  });

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Plugin } from "prosemirror-state";
import type { EditorView, MarkViewConstructor } from "prosemirror-view";
import { schema } from "prosemirror-markdown";
import { openUrl } from "@tauri-apps/plugin-opener";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { flushPromises } from "../../test/async";
import openLink, { _openLink } from "./openLink";

const setPlatform = (platform: string) =>
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);

/**
 * setup renders an editor element with a link and returns the plugin, a view
 * stub and the link element
 */
const setup = (href = "https://blank.app") => {
  const plugin = openLink();
  const dom = document.createElement("div");
  dom.innerHTML = `<p>see <a href="${href}"><strong>Blank</strong></a></p>`;
  document.body.replaceChildren(dom);
  const view = { dom } as unknown as EditorView;
  const link = dom.querySelector("strong") as HTMLElement;
  return { plugin, view, link };
};

const click = (
  plugin: Plugin,
  view: EditorView,
  target: Element,
  init: MouseEventInit = {},
) => {
  const event = new MouseEvent("click", { bubbles: true, ...init });
  target.dispatchEvent(event);
  return plugin.props.handleClick?.call(plugin, view, 0, event);
};

const renderLink = (href: string, title: string | null = null) => {
  const markViews = openLink().props.markViews as Record<
    string,
    MarkViewConstructor
  >;
  const mark = schema.marks.link.create({ href, title });
  return markViews.link(mark, {} as EditorView, true).dom as HTMLElement;
};

describe("plugin.openLink", () => {
  beforeEach(() => {
    setPlatform("Linux x86_64");
    vi.mocked(openUrl).mockResolvedValue();
  });

  describe("on Windows and Linux", () => {
    it("opens a link on Ctrl+Click", () => {
      const { plugin, view, link } = setup();

      expect(click(plugin, view, link, { ctrlKey: true })).toBe(true);

      expect(openUrl).toHaveBeenCalledWith("https://blank.app");
    });

    it.each([
      ["a plain click", {}],
      ["Cmd+Click", { metaKey: true }],
      ["a Ctrl+right click", { ctrlKey: true, button: 2 }],
    ])("ignores %s", (_, init) => {
      const { plugin, view, link } = setup();

      expect(click(plugin, view, link, init)).toBe(false);

      expect(openUrl).not.toHaveBeenCalled();
    });
  });

  describe("on macOS", () => {
    beforeEach(() => {
      setPlatform("MacIntel");
    });

    it("opens a link on Cmd+Click", () => {
      const { plugin, view, link } = setup();

      expect(click(plugin, view, link, { metaKey: true })).toBe(true);

      expect(openUrl).toHaveBeenCalledWith("https://blank.app");
    });

    it("ignores Ctrl+Click, the secondary click on macOS", () => {
      const { plugin, view, link } = setup();

      expect(click(plugin, view, link, { ctrlKey: true })).toBe(false);

      expect(openUrl).not.toHaveBeenCalled();
    });
  });

  it("ignores a click outside of a link", () => {
    const { plugin, view } = setup();

    const paragraph = view.dom.querySelector("p") as HTMLElement;
    expect(click(plugin, view, paragraph, { ctrlKey: true })).toBe(false);

    expect(openUrl).not.toHaveBeenCalled();
  });

  it("ignores a link outside of the editor", () => {
    const { plugin, view } = setup();
    const outside = document.createElement("a");
    outside.href = "https://example.com";
    document.body.append(outside);

    expect(click(plugin, view, outside, { ctrlKey: true })).toBe(false);
  });

  describe("_openLink", () => {
    it.each([
      "https://blank.app",
      "http://blank.app",
      "mailto:someone@example.com",
      "tel:+49123",
    ])("opens %s", async (href) => {
      await _openLink(href);

      expect(openUrl).toHaveBeenCalledWith(href);
      expect(sendNotification).not.toHaveBeenCalled();
    });

    it.each(["./notes.md", "#heading", "ftp://example.com", ""])(
      "does not open %j",
      async (href) => {
        await _openLink(href);

        expect(openUrl).not.toHaveBeenCalled();
        expect(sendNotification).toHaveBeenCalledWith(
          "Only web, mail and phone links can be opened",
        );
      },
    );

    it.each([
      [new Error("no browser"), "no browser"],
      ["not allowed", "not allowed"],
      [{ code: 1 }, '{"code":1}'],
    ])("reports the failure %j", async (err, message) => {
      vi.mocked(openUrl).mockRejectedValue(err);

      await _openLink("https://blank.app");

      expect(sendNotification).toHaveBeenCalledWith(
        `Failed to open link: ${message}`,
      );
    });
  });

  it("opens the link asynchronously after the click", async () => {
    const { plugin, view } = setup("./notes.md");

    click(plugin, view, view.dom.querySelector("a") as Element, {
      ctrlKey: true,
    });
    await flushPromises();

    expect(sendNotification).toHaveBeenCalled();
  });

  describe("native click", () => {
    const nativeClick = (
      plugin: Plugin,
      view: EditorView,
      target: Element,
      init: MouseEventInit = {},
    ) => {
      const event = new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        ...init,
      });
      target.dispatchEvent(event);
      const handlers = plugin.props.handleDOMEvents as Record<
        string,
        (view: EditorView, event: Event) => boolean
      >;
      expect(handlers.click(view, event)).toBe(false);
      return event.defaultPrevented;
    };

    it("is cancelled for a Ctrl+Click on a link", () => {
      const { plugin, view, link } = setup();

      expect(nativeClick(plugin, view, link, { ctrlKey: true })).toBe(true);
    });

    it("is kept for other clicks", () => {
      const { plugin, view, link } = setup();
      const paragraph = view.dom.querySelector("p") as HTMLElement;

      expect(nativeClick(plugin, view, link)).toBe(false);
      expect(nativeClick(plugin, view, link, { shiftKey: true })).toBe(false);
      expect(nativeClick(plugin, view, paragraph, { ctrlKey: true })).toBe(
        false,
      );
    });
  });

  describe("pointer cursor", () => {
    const fire = (plugin: Plugin, view: EditorView, event: Event) => {
      const handlers = plugin.props.handleDOMEvents as Record<
        string,
        (view: EditorView, event: Event) => boolean
      >;
      return handlers[event.type](view, event);
    };
    const following = (view: EditorView) =>
      view.dom.classList.contains("follow-links");

    it("shows while the modifier is held", () => {
      const { plugin, view } = setup();

      fire(plugin, view, new KeyboardEvent("keydown", { ctrlKey: true }));
      expect(following(view)).toBe(true);

      fire(plugin, view, new KeyboardEvent("keyup"));
      expect(following(view)).toBe(false);

      fire(plugin, view, new MouseEvent("mousemove", { ctrlKey: true }));
      expect(following(view)).toBe(true);

      expect(fire(plugin, view, new FocusEvent("blur"))).toBe(false);
      expect(following(view)).toBe(false);
    });

    it("uses Cmd on macOS", () => {
      setPlatform("MacIntel");
      const { plugin, view } = setup();

      fire(plugin, view, new MouseEvent("mousemove", { ctrlKey: true }));
      expect(following(view)).toBe(false);

      fire(plugin, view, new MouseEvent("mousemove", { metaKey: true }));
      expect(following(view)).toBe(true);
    });
  });

  describe("tooltip", () => {
    it("shows the url and how to open it", () => {
      const link = renderLink("https://blank.app");

      expect(link.tagName).toBe("A");
      expect(link.getAttribute("href")).toBe("https://blank.app");
      expect(link.title).toBe("https://blank.app\nCtrl+Click to open");
    });

    it("shows the title of the link first", () => {
      expect(renderLink("https://blank.app", "Blank").title).toBe(
        "Blank\nhttps://blank.app\nCtrl+Click to open",
      );
    });

    it("mentions Cmd on macOS", () => {
      setPlatform("MacIntel");

      expect(renderLink("https://blank.app").title).toBe(
        "https://blank.app\nCmd+Click to open",
      );
    });

    it("has no hint for links that can't be opened", () => {
      expect(renderLink("./notes.md").title).toBe("./notes.md");
    });
  });
});

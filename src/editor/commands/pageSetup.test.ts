import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo } from "prosemirror-history";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { config } from "../../config";
import { allMargins, DEFAULT_PAGE } from "../../layout/settings";
import {
  activeTabId,
  announcement,
  type PageSetupRequest,
  pageSetup,
} from "../../state";
import { doc, docWithFrontmatter, p } from "../../test/editor";
import { flushPromises } from "../../test/async";
import pageSetupCommand, { openPageSetup } from "./pageSetup";

const saveDefaultPage = vi.hoisted(() => vi.fn());
vi.mock("../../config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../config")>()),
  saveDefaultPage,
}));
const changeTab = vi.hoisted(() => vi.fn());
vi.mock("../tabs", () => ({ changeTab }));

let view: EditorView;

const mount = (node: ReturnType<typeof doc>) => {
  view = new EditorView(document.createElement("div"), {
    state: EditorState.create({ doc: node, plugins: [history()] }),
  });
  return view;
};

const request = () => {
  const value = pageSetup.value;
  if (!value) throw new Error("the page setup isn't open");
  pageSetup.value = null;
  return value;
};

const frontmatter = () => view.state.doc.attrs.frontmatter;

// applies settings onto the document's own frontmatter, as the dialog does
// until its text is edited
const applyOn = (
  { apply, frontmatter, settings }: PageSetupRequest,
  chosen: PageSetupRequest["settings"],
) => apply(chosen, { frontmatter, settings });

describe("command.pageSetup", () => {
  beforeEach(() => {
    pageSetup.value = null;
    announcement.value = null;
  });

  afterEach(() => {
    view?.destroy();
    pageSetup.value = null;
    activeTabId.value = null;
  });

  it("opens the dialog with the document's page over the defaults", () => {
    mount(docWithFrontmatter("page:\n  orientation: landscape", p("text")));

    expect(pageSetupCommand()(view.state, view.dispatch, view)).toBe(true);

    // jsdom's locale is en-US
    expect(request()).toMatchObject({
      settings: { ...DEFAULT_PAGE, orientation: "landscape" },
      locale: "en-US",
      unit: "in",
      frontmatter: "page:\n  orientation: landscape",
      warnings: [],
    });
  });

  it("does nothing without a view to show the dialog for", () => {
    mount(doc(p("text")));

    expect(pageSetupCommand()(view.state)).toBe(true);
    expect(pageSetup.value).toBeNull();
  });

  it("doesn't open a second dialog", () => {
    mount(doc(p("text")));
    openPageSetup(view);
    const first = pageSetup.value;

    openPageSetup(view);

    expect(pageSetup.value).toBe(first);
  });

  it("tells what of the page setup it can't use", () => {
    mount(docWithFrontmatter("page:\n  size: a2", p("text")));
    openPageSetup(view);

    expect(request().warnings).toEqual([
      "Blank used the default page setup where its paper size is unknown",
    ]);
  });

  it("writes only what changed, as one undo step", () => {
    mount(docWithFrontmatter("title: Hi", p("text")));
    openPageSetup(view);
    const opened = request();

    applyOn(opened, {
      ...opened.settings,
      orientation: "landscape",
      margins: allMargins(72),
    });

    expect(frontmatter()).toBe(
      "title: Hi\npage:\n  orientation: landscape\n  margins: 1in",
    );
    expect(announcement.value?.text).toBe("Page setup applied");
    undo(view.state, view.dispatch);
    expect(frontmatter()).toBe("title: Hi");
  });

  it("removes what is back to the default", () => {
    mount(docWithFrontmatter("page:\n  orientation: landscape", p("text")));
    openPageSetup(view);
    const opened = request();

    applyOn(opened, { ...opened.settings, orientation: "portrait" });

    expect(frontmatter()).toBeNull();
  });

  it("changes nothing when nothing changed", () => {
    mount(doc(p("text")));
    openPageSetup(view);
    const before = view.state;
    const opened = request();

    applyOn(opened, opened.settings);

    expect(view.state).toBe(before);
    // Apply still says it applied what the dialog shows
    expect(announcement.value?.text).toBe("Page setup applied");
  });

  it("writes the settings onto an edited text, as one undo step", () => {
    mount(docWithFrontmatter("title: Hi", p("text")));
    openPageSetup(view);
    const { settings, apply, readText } = request();
    const text = "title: Bye\npage:\n  size: a5";
    const read = readText(text);
    if ("error" in read) throw new Error(read.error);

    apply(
      { ...read.settings, orientation: "landscape" },
      { frontmatter: text, settings: read.settings },
    );

    expect(frontmatter()).toBe(
      "title: Bye\npage:\n  size: a5\n  orientation: landscape",
    );
    undo(view.state, view.dispatch);
    expect(frontmatter()).toBe("title: Hi");
    expect(settings.size).toBe("auto");
  });

  describe("textOf", () => {
    it("writes the settings into the frontmatter, keeping the rest", () => {
      mount(docWithFrontmatter("title: Hi # the title", p("text")));
      openPageSetup(view);
      const { settings, frontmatter, textOf } = request();

      expect(
        textOf(
          { ...settings, orientation: "landscape" },
          { frontmatter, settings },
        ),
      ).toBe("title: Hi # the title\npage:\n  orientation: landscape");
      expect(textOf(settings, { frontmatter: null, settings })).toBe("");
    });
  });

  describe("readText", () => {
    it("reads the settings and what of them can't be used", () => {
      mount(doc(p("text")));
      openPageSetup(view);

      expect(
        request().readText("page:\n  size: a2\n  orientation: landscape"),
      ).toEqual({
        settings: { ...DEFAULT_PAGE, orientation: "landscape" },
        warnings: [
          "Blank used the default page setup where its paper size is unknown",
        ],
      });
    });

    it("reads an empty text as no frontmatter", () => {
      mount(doc(p("text")));
      openPageSetup(view);

      expect(request().readText(" \n")).toEqual({
        settings: DEFAULT_PAGE,
        warnings: [],
      });
    });

    it("says what is wrong with the text", () => {
      mount(doc(p("text")));
      openPageSetup(view);

      expect(request().readText("- a list")).toEqual({
        error: "The properties must be names with values, like title: My text",
      });
    });
  });

  describe("applyText", () => {
    it("writes the frontmatter as typed", () => {
      mount(docWithFrontmatter("title: Hi", p("text")));
      openPageSetup(view);

      expect(request().applyText("title: Bye\n# note\n\n")).toBeNull();
      expect(frontmatter()).toBe("title: Bye\n# note");
      expect(announcement.value?.text).toBe("Page setup applied");
    });

    it("removes the frontmatter when it is emptied", () => {
      mount(docWithFrontmatter("title: Hi", p("text")));
      openPageSetup(view);

      expect(request().applyText("  \n")).toBeNull();
      expect(frontmatter()).toBeNull();
    });

    it("refuses what can't be written", () => {
      mount(docWithFrontmatter("title: Hi", p("text")));
      openPageSetup(view);

      expect(request().applyText("- a list")).toBe(
        "The properties must be names with values, like title: My text",
      );
      expect(frontmatter()).toBe("title: Hi");
    });
  });

  describe("makeDefault", () => {
    it("saves the default, and the document follows it", async () => {
      saveDefaultPage.mockResolvedValue(undefined);
      mount(docWithFrontmatter("title: Hi\npage:\n  size: a5", p("text")));
      openPageSetup(view);
      const { settings, makeDefault } = request();

      makeDefault({ ...settings, orientation: "landscape" });
      await flushPromises();

      expect(saveDefaultPage).toHaveBeenCalledWith(
        { ...DEFAULT_PAGE, size: "a5", orientation: "landscape" },
        "in",
      );
      expect(frontmatter()).toBe("title: Hi");
      expect(sendNotification).toHaveBeenCalledWith(
        "New documents are laid out like this now, and so are documents without their own page setup.",
      );
      expect(changeTab).not.toHaveBeenCalled();
    });

    it("changes the tab it was opened for, even once another is shown", async () => {
      saveDefaultPage.mockResolvedValue(undefined);
      mount(docWithFrontmatter("title: Hi\npage:\n  size: a5", p("text")));
      activeTabId.value = "first";
      openPageSetup(view);
      const { settings, makeDefault } = request();

      makeDefault(settings);
      // another tab is shown while the default is saved
      activeTabId.value = "second";
      await flushPromises();

      expect(changeTab).toHaveBeenCalledWith("first", expect.any(Function));
      // the view shows another document now, which stays as it is
      expect(frontmatter()).toBe("title: Hi\npage:\n  size: a5");
      // what it does to the tab's state: its own page setup goes
      const [, change] = changeTab.mock.calls[0];
      const tr = change(view.state);
      expect(tr.doc.attrs.frontmatter).toBe("title: Hi");
    });

    it("saves what the dialog shows, and keeps the document's header", async () => {
      saveDefaultPage.mockResolvedValue(undefined);
      mount(
        docWithFrontmatter(
          'page:\n  new-page-before: 1\n  footer: { center: "{page}" }',
          p("text"),
        ),
      );
      openPageSetup(view);
      const { settings, makeDefault } = request();

      makeDefault(settings);
      await flushPromises();

      const [saved] = saveDefaultPage.mock.calls[0];
      expect(saved.newPageBefore).toEqual([1]);
      expect(saved.footer).toEqual(DEFAULT_PAGE.footer);
      // the document follows the new default, and keeps its own footer
      expect(frontmatter()).toBe('page:\n  footer: {center: "{page}"}');
    });

    it("tells when the default can't be saved, and keeps the document", async () => {
      saveDefaultPage.mockRejectedValue(
        new Error("blank.json holds no settings"),
      );
      mount(docWithFrontmatter("page:\n  size: a5", p("text")));
      openPageSetup(view);

      request().makeDefault(DEFAULT_PAGE);
      await flushPromises();

      expect(frontmatter()).toBe("page:\n  size: a5");
      expect(sendNotification).toHaveBeenCalledWith(
        "Failed to save the page setup as default: blank.json holds no settings",
      );
    });
  });

  it("follows the user's defaults", () => {
    const before = config.value;
    config.value = {
      ...before,
      layout: { page: { ...DEFAULT_PAGE, size: "a5" } },
    };
    try {
      mount(doc(p("text")));
      openPageSetup(view);
      expect(request().settings.size).toBe("a5");
    } finally {
      config.value = before;
    }
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { history, undo } from "prosemirror-history";
import { sendNotification } from "@tauri-apps/plugin-notification";

import { config } from "../../config";
import { allMargins, DEFAULT_PAGE } from "../../layout/settings";
import { pageSetup } from "../../state";
import { doc, docWithFrontmatter, p } from "../../test/editor";
import { flushPromises } from "../../test/async";
import pageSetupCommand, { openPageSetup } from "./pageSetup";

const saveDefaultPage = vi.hoisted(() => vi.fn());
vi.mock("../../config", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../config")>()),
  saveDefaultPage,
}));

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

describe("command.pageSetup", () => {
  beforeEach(() => {
    pageSetup.value = null;
  });

  afterEach(() => {
    view?.destroy();
    pageSetup.value = null;
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
    const { settings, apply } = request();

    apply({ ...settings, orientation: "landscape", margins: allMargins(72) });

    expect(frontmatter()).toBe(
      "title: Hi\npage:\n  orientation: landscape\n  margins: 1in",
    );
    undo(view.state, view.dispatch);
    expect(frontmatter()).toBe("title: Hi");
  });

  it("removes what is back to the default", () => {
    mount(docWithFrontmatter("page:\n  orientation: landscape", p("text")));
    openPageSetup(view);
    const { settings, apply } = request();

    apply({ ...settings, orientation: "portrait" });

    expect(frontmatter()).toBeNull();
  });

  it("changes nothing when nothing changed", () => {
    mount(doc(p("text")));
    openPageSetup(view);
    const before = view.state;
    const { settings, apply } = request();

    apply(settings);

    expect(view.state).toBe(before);
  });

  describe("applyText", () => {
    it("writes the frontmatter as typed", () => {
      mount(docWithFrontmatter("title: Hi", p("text")));
      openPageSetup(view);

      expect(request().applyText("title: Bye\n# note\n\n")).toBeNull();
      expect(frontmatter()).toBe("title: Bye\n# note");
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
        "New documents and documents without their own page setup are laid out like this now",
      );
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

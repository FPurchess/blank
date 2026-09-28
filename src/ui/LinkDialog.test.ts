import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";
import { linkDialog, type LinkDialogRequest } from "../state";

// stops what the last boot rendered, so boots don't pile up
let dispose = () => {};
afterEach(() => dispose());

const dialog = () => document.querySelector<HTMLElement>("#link-dialog");
const form = () => dialog()?.querySelector("form") as HTMLFormElement;
const urlInput = () =>
  document.querySelector<HTMLInputElement>("#link-dialog-url")!;
const textInput = () =>
  document.querySelector<HTMLInputElement>("#link-dialog-text")!;
const hint = () => document.querySelector<HTMLElement>("#link-dialog-hint")!;
const button = (label: string) =>
  Array.from(dialog()?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent?.trim() === label,
  );

/**
 * openDialog opens the dialog for a request with mocked callbacks
 */
const openDialog = async (request: Partial<LinkDialogRequest> = {}) => {
  const full: LinkDialogRequest = {
    url: "",
    text: "",
    isEdit: false,
    submit: vi.fn(),
    convertToText: vi.fn(),
    cancel: vi.fn(),
    ...request,
  };
  linkDialog.value = full;
  await nextTick();
  return full;
};

const typeUrl = async (value: string) => {
  urlInput().value = value;
  urlInput().dispatchEvent(new Event("input"));
  await nextTick();
};

const submit = async () => {
  form().requestSubmit();
  await nextTick();
};

const keydown = async (key: string, options: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  (document.activeElement ?? form()).dispatchEvent(event);
  await nextTick();
  return event;
};

describe("linkDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    linkDialog.value = null;
    dispose = bootApp(createTestHandle());
  });

  it("is hidden without a request", async () => {
    expect(dialog()).toBeNull();
  });

  it("shows the prefilled request and selects the URL", async () => {
    await openDialog({ url: "https://blank.app", text: "Blank" });

    expect(urlInput().value).toBe("https://blank.app");
    expect(textInput().value).toBe("Blank");
    expect(document.activeElement).toBe(urlInput());
    expect(urlInput().selectionStart).toBe(0);
    expect(urlInput().selectionEnd).toBe("https://blank.app".length);
    expect(form().getAttribute("role")).toBe("dialog");
    expect(dialog()?.querySelector("h2")?.textContent).toBe("Link");
  });

  it("shows the request as plain text", async () => {
    await openDialog({ text: "<img src=x>" });

    expect(textInput().value).toBe("<img src=x>");
    expect(dialog()?.querySelector("img")).toBeNull();
  });

  it("removes the dialog and stops rendering when disposed", async () => {
    await openDialog();
    dispose();
    dispose = () => {};

    expect(dialog()).toBeNull();
    await openDialog();
    expect(dialog()).toBeNull();
  });

  it("shows a new dialog for a new request", async () => {
    await openDialog({ url: "https://first.app" });
    await typeUrl("https://typed.app");
    await openDialog({ url: "https://second.app" });

    expect(document.querySelectorAll("#link-dialog")).toHaveLength(1);
    expect(urlInput().value).toBe("https://second.app");
  });

  describe("URL hint", () => {
    beforeEach(async () => {
      await openDialog();
    });

    it("shows nothing for a full URL", async () => {
      await typeUrl("https://blank.app");

      expect(hint().hidden).toBe(true);
      expect(button("Save")?.disabled).toBe(false);
    });

    it("warns about an incomplete URL but still saves it", async () => {
      await typeUrl("./notes.md");

      expect(hint().hidden).toBe(false);
      expect(hint().textContent).toContain("doesn't look like a full URL");
      expect(button("Save")?.disabled).toBe(false);
    });

    it("blocks URLs that can't be saved", async () => {
      await typeUrl("javascript:alert(1)");

      expect(hint().textContent).toContain("can't be saved");
      expect(button("Save")?.disabled).toBe(true);
    });

    it("asks for a URL when saving without one", async () => {
      await submit();

      expect(hint().textContent).toBe("Enter a URL");
      expect(dialog()).not.toBeNull();
    });

    it("stops asking for a URL on any typing, even one that changes nothing", async () => {
      await submit();
      await typeUrl("");

      expect(hint().hidden).toBe(true);
    });

    it("stops asking for a URL once one is typed", async () => {
      await submit();
      await typeUrl("h");
      await typeUrl("");

      expect(hint().hidden).toBe(true);
    });
  });

  describe("closing", () => {
    it("submits the URL and text", async () => {
      const request = await openDialog({ text: "Blank" });
      await typeUrl("https://blank.app");
      let closedFirst = false;
      const submitSpy = vi.mocked(request.submit).mockImplementation(() => {
        // the dialog is closed before the callback runs, so the editor that
        // takes the focus back sees no dialog holding it; Vue removes its DOM
        // on the next tick
        closedFirst = linkDialog.value === null;
      });

      await submit();

      expect(submitSpy).toHaveBeenCalledWith("https://blank.app", "Blank");
      expect(closedFirst).toBe(true);
      expect(dialog()).toBeNull();
    });

    it("submits a typed link text", async () => {
      const request = await openDialog();
      await typeUrl("https://blank.app");
      textInput().value = "Blank";
      textInput().dispatchEvent(new Event("input"));
      await nextTick();

      await submit();

      expect(request.submit).toHaveBeenCalledWith("https://blank.app", "Blank");
    });

    it.each(["", "javascript:alert(1)"])(
      "does not submit the URL %j",
      async (url) => {
        const request = await openDialog();
        await typeUrl(url);

        await submit();

        expect(request.submit).not.toHaveBeenCalled();
        expect(dialog()).not.toBeNull();
      },
    );

    it("cancels on Escape", async () => {
      const request = await openDialog();

      expect((await keydown("Escape")).defaultPrevented).toBe(true);

      expect(request.cancel).toHaveBeenCalled();
      expect(dialog()).toBeNull();
    });

    it("cancels on Cancel", async () => {
      const request = await openDialog();

      button("Cancel")?.click();

      await nextTick();

      expect(request.cancel).toHaveBeenCalled();
      expect(dialog()).toBeNull();
    });

    it("cancels on a click on the backdrop", async () => {
      const request = await openDialog();

      form().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

      await nextTick();
      expect(request.cancel).not.toHaveBeenCalled();

      dialog()?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));

      await nextTick();
      expect(request.cancel).toHaveBeenCalled();
    });

    it("only offers Convert to Text for an existing link", async () => {
      await openDialog();
      expect(button("Convert to Text")).toBeUndefined();

      const request = await openDialog({
        isEdit: true,
        url: "https://blank.app",
      });
      expect(dialog()?.querySelector("h2")?.textContent).toBe("Edit link");
      button("Convert to Text")?.click();
      await nextTick();

      expect(request.convertToText).toHaveBeenCalled();
      expect(request.submit).not.toHaveBeenCalled();
      expect(dialog()).toBeNull();
    });
  });

  it("keeps the focus inside the dialog", async () => {
    await openDialog({ isEdit: true, url: "https://blank.app" });
    const cancel = button("Cancel")!;

    expect((await keydown("Tab", { shiftKey: true })).defaultPrevented).toBe(
      true,
    );
    expect(document.activeElement).toBe(cancel);

    expect((await keydown("Tab")).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(urlInput());

    // the browser moves the focus between the other elements
    expect((await keydown("Tab")).defaultPrevented).toBe(false);
  });
});

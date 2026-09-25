import { beforeEach, describe, expect, it, vi } from "vitest";

import { bootLinkDialog } from "./linkDialog";
import { linkDialog, type LinkDialogRequest } from "./state";

const dialog = () => document.querySelector<HTMLElement>("#link-dialog");
const form = () => dialog()?.querySelector("form") as HTMLFormElement;
const urlInput = () =>
  document.querySelector<HTMLInputElement>("#link-dialog-url")!;
const textInput = () =>
  document.querySelector<HTMLInputElement>("#link-dialog-text")!;
const hint = () => document.querySelector<HTMLElement>("#link-dialog-hint")!;
const button = (label: string) =>
  Array.from(dialog()?.querySelectorAll("button") ?? []).find(
    (b) => b.textContent === label,
  );

/**
 * openDialog opens the dialog for a request with mocked callbacks
 */
const openDialog = (request: Partial<LinkDialogRequest> = {}) => {
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
  return full;
};

const typeUrl = (value: string) => {
  urlInput().value = value;
  urlInput().dispatchEvent(new Event("input"));
};

const submit = () => form().requestSubmit();

const keydown = (key: string, options: KeyboardEventInit = {}) => {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...options,
  });
  (document.activeElement ?? form()).dispatchEvent(event);
  return event;
};

describe("linkDialog", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
    linkDialog.value = null;
    bootLinkDialog();
  });

  it("is hidden without a request", () => {
    expect(dialog()).toBeNull();
  });

  it("shows the prefilled request and selects the URL", () => {
    openDialog({ url: "https://blank.app", text: "Blank" });

    expect(urlInput().value).toBe("https://blank.app");
    expect(textInput().value).toBe("Blank");
    expect(document.activeElement).toBe(urlInput());
    expect(urlInput().selectionStart).toBe(0);
    expect(urlInput().selectionEnd).toBe("https://blank.app".length);
    expect(form().getAttribute("role")).toBe("dialog");
    expect(dialog()?.querySelector("h2")?.textContent).toBe("Link");
  });

  it("shows the request as plain text", () => {
    openDialog({ text: "<img src=x>" });

    expect(textInput().value).toBe("<img src=x>");
    expect(dialog()?.querySelector("img")).toBeNull();
  });

  it("renders a single dialog when booted twice", () => {
    bootLinkDialog();
    openDialog();

    expect(document.querySelectorAll("#link-dialog")).toHaveLength(1);
  });

  describe("URL hint", () => {
    beforeEach(() => {
      openDialog();
    });

    it("shows nothing for a full URL", () => {
      typeUrl("https://blank.app");

      expect(hint().hidden).toBe(true);
      expect(button("Save")?.disabled).toBe(false);
    });

    it("warns about an incomplete URL but still saves it", () => {
      typeUrl("./notes.md");

      expect(hint().hidden).toBe(false);
      expect(hint().textContent).toContain("doesn't look like a full URL");
      expect(button("Save")?.disabled).toBe(false);
    });

    it("blocks URLs that can't be saved", () => {
      typeUrl("javascript:alert(1)");

      expect(hint().textContent).toContain("can't be saved");
      expect(button("Save")?.disabled).toBe(true);
    });

    it("asks for a URL when saving without one", () => {
      submit();

      expect(hint().textContent).toBe("Enter a URL");
      expect(dialog()).not.toBeNull();
    });
  });

  describe("closing", () => {
    it("submits the URL and text", () => {
      const request = openDialog({ text: "Blank" });
      typeUrl("https://blank.app");
      const submitSpy = vi.mocked(request.submit).mockImplementation(() => {
        // the dialog is closed before the callback runs
        expect(dialog()).toBeNull();
        expect(linkDialog.value).toBeNull();
      });

      submit();

      expect(submitSpy).toHaveBeenCalledWith("https://blank.app", "Blank");
    });

    it.each(["", "javascript:alert(1)"])(
      "does not submit the URL %j",
      (url) => {
        const request = openDialog();
        typeUrl(url);

        submit();

        expect(request.submit).not.toHaveBeenCalled();
        expect(dialog()).not.toBeNull();
      },
    );

    it("cancels on Escape", () => {
      const request = openDialog();

      expect(keydown("Escape").defaultPrevented).toBe(true);

      expect(request.cancel).toHaveBeenCalled();
      expect(dialog()).toBeNull();
    });

    it("cancels on Cancel", () => {
      const request = openDialog();

      button("Cancel")?.click();

      expect(request.cancel).toHaveBeenCalled();
      expect(dialog()).toBeNull();
    });

    it("cancels on a click on the backdrop", () => {
      const request = openDialog();

      form().dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(request.cancel).not.toHaveBeenCalled();

      dialog()?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
      expect(request.cancel).toHaveBeenCalled();
    });

    it("only offers Convert to Text for an existing link", () => {
      openDialog();
      expect(button("Convert to Text")).toBeUndefined();

      const request = openDialog({ isEdit: true, url: "https://blank.app" });
      expect(dialog()?.querySelector("h2")?.textContent).toBe("Edit link");
      button("Convert to Text")?.click();

      expect(request.convertToText).toHaveBeenCalled();
      expect(request.submit).not.toHaveBeenCalled();
      expect(dialog()).toBeNull();
    });
  });

  it("keeps the focus inside the dialog", () => {
    openDialog({ isEdit: true, url: "https://blank.app" });
    const cancel = button("Cancel")!;

    expect(keydown("Tab", { shiftKey: true }).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancel);

    expect(keydown("Tab").defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(urlInput());

    // the browser moves the focus between the other elements
    expect(keydown("Tab").defaultPrevented).toBe(false);
  });
});

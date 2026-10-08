import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick } from "vue";

import { flushPromises } from "../../test/async";
import CopyFingerprint from "./CopyFingerprint.vue";

describe("CopyFingerprint", () => {
  let unmount = () => {};
  afterEach(() => {
    unmount();
    vi.unstubAllGlobals();
  });

  const mount = async (writeText: (text: string) => Promise<void>) => {
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const element = document.createElement("div");
    document.body.append(element);
    const app = createApp(() =>
      h(CopyFingerprint, { fingerprint: "ABCDEF01", buttonClass: "copy" }),
    );
    app.mount(element);
    unmount = () => {
      app.unmount();
      element.remove();
    };
    await nextTick();
    return element;
  };

  it("copies the fingerprint as it shows, and says so", async () => {
    const writeText = vi.fn(async () => {});
    const element = await mount(writeText);
    expect(element.querySelector("code")?.textContent).toBe("ABCD EF01");

    element.querySelector("button")!.click();
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith("ABCD EF01");
    expect(element.querySelector("button")?.textContent?.trim()).toBe("Copied");
  });

  it("selects it to copy by hand when the clipboard refuses", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const element = await mount(async () => {
      throw new Error("denied");
    });

    element.querySelector("button")!.click();
    await flushPromises();

    expect(window.getSelection()?.toString()).toBe("ABCD EF01");
    expect(element.querySelector("button")?.textContent?.trim()).toBe("Copy");
  });
});

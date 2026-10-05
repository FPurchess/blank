import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, h, nextTick } from "vue";

import { EditorKey } from "../editor/handle";
import { formatShortcut } from "../editor/keyBindings";
import { bandEditor } from "../state";
import type { Band } from "../layout/bands";
import { createTestHandle } from "../test/editor";
import BandTarget from "./BandTarget.vue";

const mount = async (
  props: { band: Band; page: number; adding: boolean },
  shown?: string,
) => {
  const element = document.createElement("div");
  document.body.append(element);
  const handle = createTestHandle();
  const run = vi.spyOn(handle, "run");
  const app = createApp(() =>
    h(BandTarget, props, shown ? { default: () => shown } : undefined),
  );
  app.provide(EditorKey, handle);
  app.mount(element);
  await nextTick();
  const button = element.querySelector<HTMLButtonElement>("button")!;
  return {
    button,
    run,
    unmount: () => {
      app.unmount();
      element.remove();
    },
  };
};

describe("BandTarget", () => {
  let unmount = () => {};
  afterEach(() => unmount());

  it("shows what the band shows, and names what a click does", async () => {
    const target = await mount(
      { band: "footer", page: 2, adding: false },
      "Page 3",
    );
    unmount = target.unmount;
    expect(target.button.className).toBe("band-target");
    expect(target.button.textContent).toBe("Page 3");
    expect(target.button.getAttribute("aria-label")).toBe("Edit the footer");
    expect(target.button.dataset.tip).toBe("Edit the footer");
    expect(target.button.dataset.tipKey).toBe(formatShortcut("Mod-Alt-f"));
    expect(target.button.tabIndex).toBe(-1);
    expect(target.button.hasAttribute("title")).toBe(false);
  });

  it("offers to add a band the document doesn't have", async () => {
    const target = await mount({ band: "header", page: 0, adding: true });
    unmount = target.unmount;
    expect(target.button.className).toBe("band-hint");
    expect(target.button.textContent?.trim()).toBe("+ Header");
    expect(target.button.getAttribute("aria-label")).toBe("Add a header");
  });

  it("opens the band on its page, leaving the focus to the strip", async () => {
    const target = await mount({ band: "footer", page: 2, adding: false });
    unmount = target.unmount;
    target.button.click();
    expect(target.run).toHaveBeenCalledWith(expect.any(Function), {
      focus: false,
    });
    // where it is, counted from 1
    expect(bandEditor.value).toMatchObject({
      band: "footer",
      page: 3,
      center: false,
    });
    bandEditor.value = null;
  });
});

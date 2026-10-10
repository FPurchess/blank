import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick } from "vue";

import { diagramPopover, type DiagramPopoverRequest } from "../state";
import { createTestHandle } from "../test/editor";
import { bootApp } from "./mount";

const popover = () => document.getElementById("diagram-popover");
const field = (id: string) =>
  document.querySelector<HTMLInputElement>(`#diagram-popover-${id}`)!;
const option = (label: string) =>
  [...popover()!.querySelectorAll<HTMLButtonElement>("[data-row] button")].find(
    (button) => button.textContent?.trim() === label,
  )!;

describe("the settings of a diagram", () => {
  let dispose = () => {};
  let request: DiagramPopoverRequest;

  const open = async (width: string | null) => {
    request = {
      anchor: { left: 100, top: 200, bottom: 260, right: 600 },
      values: { width, caption: "", alt: "" },
      label: "Flowchart",
      apply: vi.fn(),
      close: vi.fn(),
    };
    diagramPopover.value = request;
    await nextTick();
  };

  beforeEach(() => {
    dispose = bootApp(createTestHandle());
  });

  afterEach(() => {
    diagramPopover.value = null;
    dispose();
  });

  it("is a dialog named Diagram, its description saying what it is", async () => {
    await open(null);
    expect(popover()!.getAttribute("role")).toBe("dialog");
    expect(
      document.getElementById(popover()!.getAttribute("aria-labelledby")!)!
        .textContent,
    ).toBe("Diagram");
    expect(field("alt").placeholder).toBe("Flowchart");
    expect(option("Fit").getAttribute("aria-checked")).toBe("true");
  });

  it("applies each change at once", async () => {
    await open(null);
    option("75%").click();
    expect(request.apply).toHaveBeenLastCalledWith({
      width: "75%",
      caption: "",
      alt: "",
    });
    field("caption").value = " The plan ";
    field("caption").dispatchEvent(new Event("input"));
    expect(request.apply).toHaveBeenLastCalledWith({
      width: "75%",
      caption: "The plan",
      alt: "",
    });
    option("Fit").click();
    expect(request.apply).toHaveBeenLastCalledWith(
      expect.objectContaining({ width: null }),
    );
  });

  it("keeps a width of another app until one is chosen", async () => {
    await open("300");
    expect([
      ...popover()!.querySelectorAll("[aria-checked='true']"),
    ]).toHaveLength(0);
    field("alt").value = "Two steps";
    field("alt").dispatchEvent(new Event("input"));
    expect(request.apply).toHaveBeenLastCalledWith({
      width: "300",
      caption: "",
      alt: "Two steps",
    });
  });

  it("closes on Esc, and gives the focus back", async () => {
    await open(null);
    field("caption").dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(diagramPopover.value).toBeNull();
    expect(request.close).toHaveBeenCalled();
  });
});

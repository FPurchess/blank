import { invoke } from "@tauri-apps/api/core";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { pageText, pdfFields, setFills } from "./ipc";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

describe("the PDF form's calls", () => {
  beforeEach(() => {
    vi.mocked(invoke).mockResolvedValue([]);
  });

  it("asks for a page's text, the fields and the fills by tab", async () => {
    await pageText("t1", 2);
    expect(invoke).toHaveBeenLastCalledWith("pdf_text", { tab: "t1", page: 2 });
    await pdfFields("t1");
    expect(invoke).toHaveBeenLastCalledWith("pdf_fields", { tab: "t1" });
    const fills = [
      { field: "name", value: "Ada" },
      { field: "agree", value: true },
    ];
    await setFills("t1", fills);
    expect(invoke).toHaveBeenLastCalledWith("pdf_set_fills", {
      tab: "t1",
      fills,
    });
  });
});

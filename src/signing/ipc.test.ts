import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import { encodeParts, signPdf, type SignRequest } from "./ipc";

describe("signPdf", () => {
  beforeEach(() => {
    invoke.mockResolvedValue(new Uint8Array([9]).buffer);
  });

  it("packs the parts with their lengths, as the native side reads them", () => {
    const body = encodeParts([new Uint8Array([1, 2, 3]), new Uint8Array()]);
    const view = new DataView(body.buffer);
    expect(view.getUint32(0, true)).toBe(2);
    expect(view.getBigUint64(4, true)).toBe(3n);
    expect([...body.slice(12, 15)]).toEqual([1, 2, 3]);
    expect(view.getBigUint64(15, true)).toBe(0n);
    expect(body.length).toBe(23);
  });

  it("sends the request in the header and the parts as the body", async () => {
    const request: SignRequest = {
      passphrase: null,
      source: { kind: "body" },
      plan: {
        stamps: [{ part: 1, page: 1, rect: [1, 2, 3, 4], repeat: true }],
        signature: { kind: "invisible" },
        others: [{ page: 1, rect: [5, 6, 7, 8], name: "Bea Müller" }],
        name: null,
        location: null,
        reason: null,
        timestampServer: null,
      },
    };
    const parts = [new Uint8Array([1]), new Uint8Array([2])];
    expect(await signPdf(request, parts)).toEqual(new Uint8Array([9]));
    const [command, body, options] = invoke.mock.calls[0];
    expect(command).toBe("signing_sign_pdf");
    expect(body).toEqual(encodeParts(parts));
    expect(
      JSON.parse(decodeURIComponent(options.headers["blank-signing"])),
    ).toEqual(request);
  });
});

import { describe, expect, it } from "vitest";
import JSZip from "jszip";

import {
  MAX_ENTRIES,
  MAX_UNPACKED_BYTES,
  ZipGuardError,
  readZipDirectory,
} from "./zipGuard";

interface Entry {
  name: string;
  size: number;
  // stores the size in a ZIP64 extra field
  zip64?: boolean;
}

/**
 * directory builds the central directory of a zip, which is all the guard
 * reads: an entry per file and the end record
 */
const directory = (entries: Entry[], { zip64End = false } = {}) => {
  const parts: number[] = [];
  const u16 = (value: number) => parts.push(value & 0xff, value >> 8);
  const u32 = (value: number) => {
    u16(value & 0xffff);
    u16(value >>> 16);
  };
  const u64 = (value: number) => {
    u32(value % 2 ** 32);
    u32(Math.floor(value / 2 ** 32));
  };

  for (const { name, size, zip64 } of entries) {
    const bytes = new TextEncoder().encode(name);
    u32(0x02014b50);
    for (let i = 0; i < 8; i++) u16(0); // versions, flags, method, time, date, crc
    u32(0); // compressed size
    u32(zip64 ? 0xffffffff : size);
    u16(bytes.length);
    u16(zip64 ? 12 : 0); // extra
    u16(0); // comment
    for (let i = 0; i < 4; i++) u16(0); // disk, attributes
    u32(0); // local header offset
    parts.push(...bytes);
    if (zip64) {
      u16(0x0001);
      u16(8);
      u64(size);
    }
  }
  const end = parts.length;
  if (zip64End) {
    u32(0x06064b50);
    u64(44);
    for (let i = 0; i < 6; i++) u16(0); // versions, disks
    u64(entries.length);
    u64(entries.length);
    u64(end);
    u64(0); // directory offset
    u32(0x07064b50);
    u32(0);
    u64(end);
    u32(1);
  }
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(zip64End ? 0xffff : entries.length);
  u16(zip64End ? 0xffff : entries.length);
  u32(end);
  u32(zip64End ? 0xffffffff : 0);
  u16(0);
  return new Uint8Array(parts);
};

describe("importers.docx.readZipDirectory", () => {
  it("lists the files of a real zip and their unpacked size", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "a".repeat(1000));
    zip.file("word/comments.xml", "<w:comments/>");
    const bytes = await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      comment: "a zip comment",
    });

    expect(readZipDirectory(bytes)).toEqual({
      names: ["word/", "word/document.xml", "word/comments.xml"],
      unpackedBytes: 1013,
    });
  });

  it("reads ZIP64 sizes and directories", () => {
    const bytes = directory(
      [
        { name: "a", size: 10, zip64: true },
        { name: "b", size: 5 },
      ],
      { zip64End: true },
    );

    expect(readZipDirectory(bytes)).toEqual({
      names: ["a", "b"],
      unpackedBytes: 15,
    });
  });

  it("refuses zips that unpack to too much", () => {
    const bytes = directory([
      { name: "a", size: MAX_UNPACKED_BYTES },
      { name: "b", size: 1, zip64: true },
    ]);

    expect(() => readZipDirectory(bytes)).toThrow("the file is too large");
  });

  it("refuses zips with too many files", () => {
    const bytes = directory(
      Array.from({ length: MAX_ENTRIES + 1 }, (_, i) => ({
        name: String(i),
        size: 0,
      })),
    );

    expect(() => readZipDirectory(bytes)).toThrow("the file is too large");
  });

  it("recognizes encrypted documents", () => {
    const ole = new Uint8Array([
      0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
    ]);

    expect(() => readZipDirectory(ole)).toThrow(
      "the file is encrypted or not a Word document",
    );
  });

  it.each([
    ["text", new TextEncoder().encode("# markdown")],
    ["an empty file", new Uint8Array()],
    ["a directory past the end", directory([{ name: "a", size: 1 }]).slice(46)],
  ])("refuses %s", (_, bytes) => {
    expect(() => readZipDirectory(bytes)).toThrow(ZipGuardError);
  });

  it("refuses a ZIP64 size without its extra field", () => {
    const bytes = directory([{ name: "a", size: 1, zip64: true }]);
    // drop the extra field's id, so it is not the ZIP64 one
    bytes[47] = 0x09;

    expect(() => readZipDirectory(bytes)).toThrow("broken zip");
  });

  it("refuses a ZIP64 end record that isn't there", () => {
    const bytes = directory([{ name: "a", size: 1 }]);
    const end = bytes.length - 22;
    new DataView(bytes.buffer).setUint16(end + 10, 0xffff, true);

    expect(() => readZipDirectory(bytes)).toThrow("broken zip");
  });
});

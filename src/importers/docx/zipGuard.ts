// Checks the table of contents of a .docx (a zip) before it is unpacked, so
// huge or broken files are refused instead of filling up the memory.

export const MAX_UNPACKED_BYTES = 512 * 1024 * 1024;
export const MAX_ENTRIES = 10_000;

const END_OF_DIRECTORY = 0x06054b50;
const ZIP64_END_OF_DIRECTORY = 0x06064b50;
const ZIP64_LOCATOR = 0x07064b50;
const DIRECTORY_ENTRY = 0x02014b50;
const ZIP64_EXTRA = 0x0001;
const UNKNOWN_32 = 0xffffffff;
const UNKNOWN_16 = 0xffff;

export interface ZipContents {
  names: string[];
  unpackedBytes: number;
}

export class ZipGuardError extends Error {}

// Word, like other Office apps, stores encrypted documents in an OLE container
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];

const findEndOfDirectory = (data: DataView) => {
  // the end record is 22 bytes plus a comment of up to 64 KiB
  const last = data.byteLength - 22;
  for (let offset = last; offset >= 0 && offset >= last - 0xffff; offset--) {
    if (data.getUint32(offset, true) === END_OF_DIRECTORY) return offset;
  }
  return -1;
};

const zip64Directory = (data: DataView, end: number) => {
  const locator = end - 20;
  if (locator < 0 || data.getUint32(locator, true) !== ZIP64_LOCATOR) {
    throw new ZipGuardError("broken zip");
  }
  const record = Number(data.getBigUint64(locator + 8, true));
  if (data.getUint32(record, true) !== ZIP64_END_OF_DIRECTORY) {
    throw new ZipGuardError("broken zip");
  }
  return {
    entries: Number(data.getBigUint64(record + 32, true)),
    offset: Number(data.getBigUint64(record + 48, true)),
  };
};

// the real size of an entry whose 32-bit size field is 0xFFFFFFFF
const zip64Size = (data: DataView, extra: number, length: number) => {
  for (let offset = extra; offset + 4 <= extra + length;) {
    const id = data.getUint16(offset, true);
    const size = data.getUint16(offset + 2, true);
    // the extra field starts with the uncompressed size
    if (id === ZIP64_EXTRA) return Number(data.getBigUint64(offset + 4, true));
    offset += 4 + size;
  }
  throw new ZipGuardError("broken zip");
};

/**
 * readZipDirectory lists the entries of a zip and how large they are when
 * unpacked, as the zip declares it
 * @throws ZipGuardError if `bytes` isn't a zip, or unpacks to too much
 */
export const readZipDirectory = (bytes: Uint8Array): ZipContents => {
  if (OLE_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    throw new ZipGuardError("the file is encrypted or not a Word document");
  }
  const data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  try {
    const end = findEndOfDirectory(data);
    if (end < 0) throw new ZipGuardError("not a Word document");

    let entries = data.getUint16(end + 10, true);
    let offset = data.getUint32(end + 16, true);
    if (entries === UNKNOWN_16 || offset === UNKNOWN_32) {
      ({ entries, offset } = zip64Directory(data, end));
    }
    if (entries > MAX_ENTRIES) throw new ZipGuardError("the file is too large");

    const names: string[] = [];
    let unpackedBytes = 0;
    for (let i = 0; i < entries; i++) {
      if (data.getUint32(offset, true) !== DIRECTORY_ENTRY) {
        throw new ZipGuardError("broken zip");
      }
      const nameLength = data.getUint16(offset + 28, true);
      const extraLength = data.getUint16(offset + 30, true);
      const commentLength = data.getUint16(offset + 32, true);
      const name = offset + 46;
      let size = data.getUint32(offset + 24, true);
      if (size === UNKNOWN_32) {
        size = zip64Size(data, name + nameLength, extraLength);
      }

      names.push(decoder.decode(bytes.subarray(name, name + nameLength)));
      unpackedBytes += size;
      if (unpackedBytes > MAX_UNPACKED_BYTES) {
        throw new ZipGuardError("the file is too large");
      }
      offset = name + nameLength + extraLength + commentLength;
    }
    return { names, unpackedBytes };
  } catch (err) {
    if (err instanceof ZipGuardError) throw err;
    // offsets that point past the end of the file
    throw new ZipGuardError("not a Word document");
  }
};

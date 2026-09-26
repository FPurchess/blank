export type ImageMime =
  | "image/png"
  | "image/jpeg"
  | "image/gif"
  | "image/webp"
  | "image/bmp"
  | "image/tiff"
  | "image/svg+xml"
  | "image/x-emf"
  | "image/x-wmf";

export interface Size {
  width: number;
  height: number;
}

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  signature.every((byte, index) => bytes[offset + index] === byte);

const ascii = (bytes: Uint8Array, from: number, to: number) =>
  String.fromCharCode(...bytes.subarray(from, to));

/**
 * sniffMime detects the image format of `bytes` from its signature, which is
 * more reliable than a file extension or a content type from a .docx
 * @returns the MIME type, or null for anything that isn't a known image
 */
export const sniffMime = (bytes: Uint8Array): ImageMime | null => {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (ascii(bytes, 0, 4) === "GIF8") return "image/gif";
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP")
    return "image/webp";
  if (ascii(bytes, 0, 2) === "BM") return "image/bmp";
  if (
    startsWith(bytes, [0x49, 0x49, 0x2a, 0x00]) ||
    startsWith(bytes, [0x4d, 0x4d, 0x00, 0x2a])
  )
    return "image/tiff";
  if (ascii(bytes, 40, 44) === " EMF") return "image/x-emf";
  if (
    startsWith(bytes, [0xd7, 0xcd, 0xc6, 0x9a]) ||
    startsWith(bytes, [0x01, 0x00, 0x09, 0x00])
  )
    return "image/x-wmf";
  if (/<svg[\s>]/.test(new TextDecoder().decode(bytes.subarray(0, 1024))))
    return "image/svg+xml";
  return null;
};

const view = (bytes: Uint8Array) =>
  new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

// JPEG start-of-frame markers carry the size; C4 (DHT), C8 (JPG) and
// CC (DAC) share the range but aren't frames
const isStartOfFrame = (marker: number) =>
  marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);

const jpegSize = (bytes: Uint8Array): Size | null => {
  const data = view(bytes);
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    // fill bytes before a marker
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    if (isStartOfFrame(marker)) {
      return {
        height: data.getUint16(offset + 5),
        width: data.getUint16(offset + 7),
      };
    }
    offset += 2 + data.getUint16(offset + 2);
  }
  return null;
};

const webpSize = (bytes: Uint8Array): Size | null => {
  if (bytes.length < 30) return null;
  const data = view(bytes);
  switch (ascii(bytes, 12, 16)) {
    case "VP8 ":
      return {
        width: data.getUint16(26, true) & 0x3fff,
        height: data.getUint16(28, true) & 0x3fff,
      };
    case "VP8L": {
      const bits = data.getUint32(21, true);
      return {
        width: (bits & 0x3fff) + 1,
        height: ((bits >> 14) & 0x3fff) + 1,
      };
    }
    case "VP8X":
      return {
        width: (data.getUint32(24, true) & 0xffffff) + 1,
        height: (data.getUint32(27, true) & 0xffffff) + 1,
      };
  }
  return null;
};

/**
 * probeSize reads the pixel size from the header of a PNG, JPEG, GIF, WebP or
 * BMP image, without decoding it
 * @returns the size, or null for other formats and broken headers
 */
export const probeSize = (bytes: Uint8Array, mime: ImageMime): Size | null => {
  try {
    const data = view(bytes);
    switch (mime) {
      case "image/png":
        return bytes.length < 24
          ? null
          : { width: data.getUint32(16), height: data.getUint32(20) };
      case "image/jpeg":
        return jpegSize(bytes);
      case "image/gif":
        return bytes.length < 10
          ? null
          : { width: data.getUint16(6, true), height: data.getUint16(8, true) };
      case "image/webp":
        return webpSize(bytes);
      case "image/bmp":
        return bytes.length < 26
          ? null
          : {
              width: Math.abs(data.getInt32(18, true)),
              height: Math.abs(data.getInt32(22, true)),
            };
      default:
        return null;
    }
  } catch {
    // a header that ends early
    return null;
  }
};

/**
 * jpegOrientation reads the EXIF orientation (1-8) of a JPEG, e.g. 6 for a
 * photo that has to be turned clockwise to be upright
 * @returns the orientation, 1 if there is none
 */
export const jpegOrientation = (bytes: Uint8Array): number => {
  try {
    const data = view(bytes);
    let offset = 2;
    while (offset + 4 < bytes.length && bytes[offset] === 0xff) {
      const marker = bytes[offset + 1];
      const length = data.getUint16(offset + 2);
      // APP1 holding "Exif\0\0" followed by a TIFF header
      if (marker === 0xe1 && ascii(bytes, offset + 4, offset + 8) === "Exif") {
        const tiff = offset + 10;
        const little = ascii(bytes, tiff, tiff + 2) === "II";
        const ifd = tiff + data.getUint32(tiff + 4, little);
        const entries = data.getUint16(ifd, little);
        for (let i = 0; i < entries; i++) {
          const entry = ifd + 2 + i * 12;
          if (data.getUint16(entry, little) === 0x0112) {
            return data.getUint16(entry + 8, little);
          }
        }
        return 1;
      }
      // the image data starts, no EXIF before it
      if (marker === 0xda) return 1;
      offset += 2 + length;
    }
  } catch {
    // a header that ends early
  }
  return 1;
};

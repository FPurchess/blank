/**
 * toDataUrl encodes `bytes` as a base64 data: URL
 */
export const toDataUrl = (bytes: Uint8Array, mime: string) =>
  new Promise<string>((resolve, reject) => {
    // FileReader encodes large images much faster than btoa over a string
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(new Blob([bytes as BlobPart], { type: mime }));
  });

/**
 * fromDataUrl decodes a data: URL
 * @returns its bytes and MIME type, or null if it isn't a valid data: URL
 */
export const fromDataUrl = (
  url: string,
): { bytes: Uint8Array; mime: string } | null => {
  const match = /^data:([^;,]*)((?:;[^;,]*)*),(.*)$/is.exec(url);
  if (!match) return null;
  const [, mime, params, data] = match;
  try {
    const bytes = /;base64/i.test(params)
      ? Uint8Array.from(atob(data), (char) => char.charCodeAt(0))
      : new TextEncoder().encode(decodeURIComponent(data));
    return { bytes, mime: mime.toLowerCase() };
  } catch {
    return null;
  }
};

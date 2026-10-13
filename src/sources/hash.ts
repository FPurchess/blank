// FNV-1a, 32 bits: a short, stable name for a text, e.g. a diagram's source,
// which the cache of rendered sources and the Word export key by. Not for
// anything that must be secure.

const OFFSET = 0x811c9dc5;
const PRIME = 0x01000193;

/**
 * fnv1a returns the hash of `text` as 8 hex digits
 */
export const fnv1a = (text: string): string => {
  let hash = OFFSET;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, PRIME);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};

import type { Size } from "./mime";

/**
 * fitBox scales `size` down to fit into maxWidth × maxHeight, keeping its
 * aspect ratio. Smaller sizes are kept, never scaled up.
 */
export const fitBox = (
  size: Size,
  maxWidth: number,
  maxHeight: number,
): Size => {
  const scale = Math.min(1, maxWidth / size.width, maxHeight / size.height);
  return { width: size.width * scale, height: size.height * scale };
};

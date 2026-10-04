import type { EmbedType } from "../embeds/registry";

// A type of embed for the tests, as a plugin would bring one: a box of a
// color, its data `{ "color": … }`.

export const box = (color: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="0 0 120 60"><rect width="120" height="60" fill="${color}"/></svg>`;

/**
 * boxType returns the test's type of embed, which paints the box in each
 * of `colors` in turn, and gives up when they run out
 */
export const boxType = (colors: string[]): EmbedType => ({
  type: "org.blank.test/box@1",
  name: "Box",
  description: "A box of a color",
  edit: async () => {
    const color = colors.shift();
    return color
      ? {
          data: JSON.stringify({ color }),
          svg: box(color),
          alt: `A ${color} box`,
        }
      : null;
  },
});

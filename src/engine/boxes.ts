// Boxes on the pages as the engine gives them, for the page view's engine and
// for the PDF's, also in its worker.

// a box on a page, in points from its top left corner
export interface PageBox {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * rectsOf reads the boxes the engine gives as page, x, y, width and height,
 * one after the other
 */
export const rectsOf = (values: Float32Array): PageBox[] => {
  const rects: PageBox[] = [];
  for (let index = 0; index + 4 < values.length; index += 5) {
    rects.push({
      page: values[index],
      x: values[index + 1],
      y: values[index + 2],
      width: values[index + 3],
      height: values[index + 4],
    });
  }
  return rects;
};

/**
 * signingBoxes returns where a signed export's signature blocks are, for
 * its result: the one filled in (at `signed`) and the others (at `others`,
 * null for one not on the pages), each the first box `boxesOf` gives the
 * block at a position, on the shared engine and in the PDF worker alike
 */
export const signingBoxes = (
  boxesOf: (pos: number) => PageBox[],
  signed: number | undefined,
  others: readonly number[] | undefined,
): { signatureBox?: PageBox; otherBoxes?: (PageBox | null)[] } => ({
  ...(signed === undefined ? {} : { signatureBox: boxesOf(signed)[0] }),
  ...(others
    ? { otherBoxes: others.map((pos) => boxesOf(pos)[0] ?? null) }
    : {}),
});

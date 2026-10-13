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

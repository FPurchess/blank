import type { exporterFunc } from "../exporters/types";
import { fitBox } from "../images/fit";
import { failureWarning, prepareImages } from "../images/prepare";
import { documentFields } from "../layout/bands";
import { pageGeometry } from "../layout/resolve";
import { POINTS_PER_PIXEL } from "../layout/units";
import { newEngine } from "./engine";

// The PDF, written by the layout engine with krilla from the same layout
// the page view paints: every line and page break as on screen.

const toPDF: exporterFunc = async (state, { docPath, layout }) => {
  const engine = await newEngine();
  try {
    const { images, failures } = await prepareImages(state.doc, docPath, [
      "image/png",
      "image/jpeg",
    ]);
    const { contentWidth, contentHeight } = pageGeometry(layout);
    for (const [src, image] of images) {
      engine.raw.addImage(src, image.bytes, image.mime === "image/jpeg");
    }
    const fields = documentFields(state.doc, docPath);
    engine.setSettings(layout, fields);
    engine.sync(state.doc, (src) => {
      const image = images.get(src);
      if (!image) return undefined;
      return fitBox(
        {
          width: image.width * POINTS_PER_PIXEL,
          height: image.height * POINTS_PER_PIXEL,
        },
        contentWidth,
        contentHeight,
      );
    });
    const contents = engine.raw.pdf(fields.title, fields.author);
    return {
      contents,
      warnings: failureWarning(failures),
      pages: engine.pages(),
    };
  } finally {
    engine.raw.free();
  }
};

export default toPDF;

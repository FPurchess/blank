const textStyleMixin = (
  fontSize,
  options: {
    italics?: boolean;
    bold?: boolean;
    decoration?: 'underline';
    margin?: number[];
  } = {},
) => ({
  fontSize,
  // margin: [left, top, right, bottom]
  margin: [0, fontSize * 0.75, 0, fontSize * 0.25],
  ...options,
});

export const BASE_DOCUMENT = {
  defaultStyle: {
    font: 'DejaVu Sans',
  },
  styles: {
    paragraph: textStyleMixin(10, { margin: [0, 0, 0, 10] }),
    heading1: textStyleMixin(30),
    heading2: textStyleMixin(25),
    heading3: textStyleMixin(20),
    heading4: textStyleMixin(15),
    heading5: textStyleMixin(12),
    heading6: textStyleMixin(10, { bold: true }),
    list_item: textStyleMixin(10, { margin: [15, 5, 0, 0] }),
    bullet_list: { margin: [0, 0, 0, 10] },
    ordered_list: { margin: [0, 0, 0, 10] },
  },
};

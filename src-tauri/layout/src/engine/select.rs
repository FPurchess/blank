//! Selections and boxes: the rectangles of a selection, the boxes of
//! blocks, and how a table is laid out.

use super::Engine;
use crate::model::Content;

/// a row of a table placed on a page
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct GridRow {
    pub page: usize,
    pub row: usize,
    pub y: f32,
    pub height: f32,
    /// a header row repeated on a page the table continues on
    pub repeat: bool,
}

/// a table as laid out, see Engine::table_grid
#[derive(Clone, Debug, PartialEq)]
pub struct TableGrid {
    /// where each column starts on the page, and where the last one ends
    pub columns: Vec<f32>,
    pub rows: Vec<GridRow>,
}

impl Engine {
    /// the rectangles of a selection: page, x, y, width, height
    pub fn selection(&self, from: u32, to: u32) -> Vec<(usize, f32, f32, f32, f32)> {
        let mut rects = vec![];
        let Some(first) = self.item_at(from) else {
            return rects;
        };
        for item in first..self.items.len() {
            if self.items[item].from() > to {
                break;
            }
            let laid = &self.laid[item];
            if laid.texts.is_empty() {
                if from <= self.items[item].from() && to >= self.items[item].to() {
                    if let Some(frag_index) = self.frag_of(item, 0) {
                        let frag = self.frags[frag_index];
                        let unit = &laid.units[0];
                        let (indent, end) = self.items[item].text_edges(&self.settings);
                        rects.push((
                            self.page_of_frag(frag_index),
                            self.settings.margins.left + indent,
                            frag.y,
                            end - indent,
                            unit.height.max(4.0),
                        ));
                    }
                }
                continue;
            }
            for (index, boxed) in laid.texts.iter().enumerate() {
                let (start, end) = (boxed.pos, boxed.pos.saturating_add(boxed.len));
                if end < from || start > to {
                    continue;
                }
                let a = boxed.byte_of(from.max(start));
                let b = boxed.byte_of(to.min(end));
                let spans_end = to > end;
                let pieces = boxed.selection(a, b);
                if pieces.is_empty() && (spans_end || boxed.empty()) {
                    // an empty line in the selection
                    let (line, x, y, height) = boxed.caret(from.max(start), false);
                    if let Some((page, x, y)) = self.to_page(item, index, line, x, y) {
                        rects.push((page, x, y, 4.0, height));
                    }
                }
                for (line, x, y, w, h) in pieces {
                    let w = if spans_end && line + 1 == boxed.line_count() {
                        w + 4.0
                    } else {
                        w
                    };
                    if let Some((page, x, y)) = self.to_page(item, index, line, x, y) {
                        rects.push((page, x, y, w, h));
                    }
                }
            }
        }
        rects
    }

    /// the positions the blocks on a page start and end at, e.g. to find
    /// what else is to paint on it
    pub fn page_span(&self, page: usize) -> Option<(u32, u32)> {
        let range = self.frags_on(page);
        let mut span: Option<(u32, u32)> = None;
        for index in range {
            let item = &self.items[self.frags[index].item];
            let (from, to) = (item.from(), item.to());
            span = Some(match span {
                Some((a, b)) => (a.min(from), b.max(to)),
                None => (from, to),
            });
        }
        span
    }

    /// the box of a fragment on its page: x, y, width and height
    fn frag_box(&self, frag_index: usize) -> (f32, f32, f32, f32) {
        let frag = self.frags[frag_index];
        let item = &self.items[frag.item];
        let laid = &self.laid[frag.item];
        let unit = &laid.units[frag.unit];
        let left = self.settings.margins.left;
        // an image is as wide as it is shown
        if let Some(crate::items::Deco::Image { x, w, .. }) = unit
            .decos
            .iter()
            .find(|deco| matches!(deco, crate::items::Deco::Image { .. }))
        {
            return (left + x, frag.y, *w, unit.height);
        }
        let (indent, end) = item.text_edges(&self.settings);
        (left + indent, frag.y, end - indent, unit.height)
    }

    /// the boxes of the blocks from `from` to `to`, one per page they are
    /// on: page, x, y, width and height. A block is in the range when all
    /// of it is, as the items of a node are within the node.
    pub fn boxes(&self, from: u32, to: u32) -> Vec<(usize, f32, f32, f32, f32)> {
        let mut boxes: Vec<(usize, f32, f32, f32, f32)> = vec![];
        // from the item `from` is in, which may be a table with images in
        // its cells
        let start = self
            .items
            .partition_point(|item| item.from() < from)
            .saturating_sub(1);
        for item in start..self.items.len() {
            if self.items[item].from() > to {
                break;
            }
            if self.items[item].from() < from || self.items[item].to() > to {
                // not all of it, but maybe images in its cells
                self.cell_image_boxes(item, from, to, &mut boxes);
                continue;
            }
            for index in self.frags_of(item) {
                let page = self.page_of_frag(index);
                let (x, y, w, h) = self.frag_box(index);
                match boxes.last_mut() {
                    Some(last) if last.0 == page => {
                        let right = (last.1 + last.3).max(x + w);
                        let bottom = (last.2 + last.4).max(y + h);
                        last.1 = last.1.min(x);
                        last.2 = last.2.min(y);
                        last.3 = right - last.1;
                        last.4 = bottom - last.2;
                    }
                    _ => boxes.push((page, x, y, w, h)),
                }
            }
        }
        boxes
    }

    /// the boxes of the images in a table's cells from `from` to `to`
    fn cell_image_boxes(
        &self,
        item: usize,
        from: u32,
        to: u32,
        boxes: &mut Vec<(usize, f32, f32, f32, f32)>,
    ) {
        let laid = &self.laid[item];
        for image in &laid.cell_images {
            if image.pos < from || image.pos.saturating_add(1) > to {
                continue;
            }
            let Some(frag_index) = self.frag_of(item, image.unit) else {
                continue;
            };
            let frag = self.frags[frag_index];
            let unit = &laid.units[image.unit];
            boxes.push((
                self.page_of_frag(frag_index),
                self.settings.margins.left + image.x,
                frag.y - unit.top + image.y,
                image.w,
                image.h,
            ));
        }
    }

    /// how the table at `pos` is laid out: where its columns are, on the
    /// page, and each row placed on a page (repeated header rows too)
    pub fn table_grid(&self, pos: u32) -> Option<TableGrid> {
        let item = self
            .items
            .iter()
            .position(|item| matches!(item.content, Content::Table { .. }) && item.from() == pos)?;
        let laid = &self.laid[item];
        let left = self.settings.margins.left;
        let columns = laid.columns.iter().map(|x| left + x).collect();
        let mut rows = vec![];
        for (index, frag) in self.frags.iter().enumerate() {
            if frag.item != item {
                continue;
            }
            let unit = &laid.units[frag.unit];
            let page = self.page_of_frag(index);
            for (row, top, bottom) in &unit.rows {
                let y = frag.y - unit.top + top;
                // the slices of a row on one page are one row
                if let Some(last) = rows.last_mut().filter(|last: &&mut GridRow| {
                    last.page == page && last.row == *row && last.repeat == frag.repeat
                }) {
                    last.height = y + bottom - top - last.y;
                    continue;
                }
                rows.push(GridRow {
                    page,
                    row: *row,
                    y,
                    height: bottom - top,
                    repeat: frag.repeat,
                });
            }
        }
        Some(TableGrid { columns, rows })
    }
}

#[cfg(test)]
mod tests {
    use crate::engine::test_support::*;

    #[test]
    fn selects_across_pages() {
        let items = document(&[LONG; 40]);
        let engine = engine(items.clone());
        let rects = engine.selection(items[0].from(), items[39].to());
        let pages: std::collections::BTreeSet<usize> = rects.iter().map(|rect| rect.0).collect();
        assert_eq!(pages.len(), engine.pages.len());
    }

    #[test]
    fn boxes_blocks_by_page() {
        let items = document(&["one", "two", LONG]);
        let engine = engine(items.clone());
        // the second paragraph: its node is from 5 to 10
        let boxes = engine.boxes(5, 10);
        assert_eq!(boxes.len(), 1);
        let (page, x, y, w, h) = boxes[0];
        assert_eq!(page, 0);
        assert!((x - engine.settings.margins.left).abs() < 0.01);
        assert!((w - engine.settings.content_width()).abs() < 0.01);
        assert!(y > engine.settings.content_top() && h > 10.0);
        // all three are one box on the page
        let all = engine.boxes(0, items[2].to() + 1);
        assert_eq!(all.len(), 1);
        assert!(all[0].4 > h * 3.0);
        assert!(engine.boxes(100_000, 100_010).is_empty());
        assert_eq!(engine.page_span(0), Some((1, items[2].to())));
        assert_eq!(engine.page_span(9), None);
    }
}

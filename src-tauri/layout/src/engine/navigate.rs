//! Positions: where a position is on the pages, what a point hits, and
//! where the caret goes up, down and to the ends of a line.

use super::Engine;
use crate::text::TextBox;

/// how a position is shown: as a caret in text, or as a whole node
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Hit {
    Text(u32),
    Node(u32),
}

impl Engine {
    /// the item a position is in, or the last one before it
    pub(super) fn item_at(&self, pos: u32) -> Option<usize> {
        let index = self.items.partition_point(|item| item.from() <= pos);
        if index == 0 {
            return (!self.items.is_empty()).then_some(0);
        }
        Some(index - 1)
    }

    /// the fragment of an item's unit
    pub(super) fn frag_of(&self, item: usize, unit: usize) -> Option<usize> {
        let first = *self.first_frag.get(item)?;
        if first == usize::MAX {
            return None;
        }
        (first..self.frags.len())
            .take_while(|&index| self.frags[index].item == item || self.frags[index].repeat)
            .find(|&index| {
                let frag = self.frags[index];
                frag.item == item && frag.unit == unit && !frag.repeat
            })
    }

    pub(super) fn unit_of_text(&self, item: usize, text: usize, line: usize) -> usize {
        let laid = &self.laid[item];
        let boxed = &laid.texts[text];
        let lines = boxed.lines();
        let (top, bottom) = lines
            .get(line)
            .map(|info| (boxed.y + info.top, boxed.y + info.bottom))
            .unwrap_or((boxed.y, boxed.y));
        laid.units
            .iter()
            .position(|unit| match unit.line {
                Some(unit_line) => unit.texts.contains(&text) && unit_line == line,
                None => unit.texts.contains(&text) && unit.shows(top, bottom),
            })
            .unwrap_or(0)
    }

    /// the page and the point on it of a spot in an item's text box
    pub(super) fn to_page(
        &self,
        item: usize,
        text: usize,
        line: usize,
        x: f32,
        y: f32,
    ) -> Option<(usize, f32, f32)> {
        let unit_index = self.unit_of_text(item, text, line);
        let frag_index = self.frag_of(item, unit_index)?;
        let unit = &self.laid[item].units[unit_index];
        let boxed = &self.laid[item].texts[text];
        let frag = self.frags[frag_index];
        Some((
            self.page_of_frag(frag_index),
            self.settings.margins.left + boxed.x + x,
            frag.y - unit.top + boxed.y + y,
        ))
    }

    /// the text box of an item a position is in
    pub(super) fn text_at(&self, item: usize, pos: u32) -> Option<usize> {
        let texts = &self.laid[item].texts;
        if texts.is_empty() {
            return None;
        }
        let index = texts.partition_point(|text| text.pos <= pos);
        Some(index.saturating_sub(1))
    }

    /// where the caret at a position is: page, x, y and height
    pub fn caret(&self, pos: u32, after: bool) -> Option<(usize, f32, f32, f32)> {
        let item = self.item_at(pos)?;
        match self.text_at(item, pos) {
            Some(text) => {
                let boxed = &self.laid[item].texts[text];
                let (line, x, y, height) = boxed.caret(pos, after);
                let (page, x, y) = self.to_page(item, text, line, x, y)?;
                Some((page, x, y, height))
            }
            None => {
                // before or after a node without text
                let frag_index = self.frag_of(item, 0)?;
                let frag = self.frags[frag_index];
                let unit = &self.laid[item].units[0];
                let at_end = pos >= self.items[item].to();
                let width = self.settings.content_width();
                let height = unit.height.max(12.0);
                Some((
                    self.page_of_frag(frag_index),
                    self.settings.margins.left
                        + if at_end {
                            width
                        } else {
                            self.items[item].indent
                        },
                    frag.y,
                    height,
                ))
            }
        }
    }

    /// the frags on a page, in order
    pub(super) fn frags_on(&self, page: usize) -> std::ops::Range<usize> {
        self.pages
            .get(page)
            .map(|page| page.start..page.end)
            .unwrap_or(0..0)
    }

    /// the fragment on a page nearest to a height
    fn frag_near(&self, page: usize, y: f32) -> Option<usize> {
        let mut best: Option<(usize, f32)> = None;
        for index in self.frags_on(page) {
            let frag = self.frags[index];
            let unit = &self.laid[frag.item].units[frag.unit];
            let distance = if y < frag.y {
                frag.y - y
            } else if y > frag.y + unit.height {
                y - frag.y - unit.height
            } else {
                0.0
            };
            if best.is_none_or(|(_, least)| distance < least) {
                best = Some((index, distance));
            }
        }
        best.map(|(index, _)| index)
    }

    /// the text box of a fragment nearest to a point, with the point in
    /// the box's coordinates
    fn box_near(&self, frag_index: usize, x: f32, y: f32) -> Option<(usize, usize, f32, f32)> {
        let frag = self.frags[frag_index];
        let unit = &self.laid[frag.item].units[frag.unit];
        let texts = &self.laid[frag.item].texts;
        let item_x = x - self.settings.margins.left;
        let mut item_y = y - frag.y + unit.top;
        // a slice of rows only has the lines within it
        if let Some((from, to)) = unit.clip {
            item_y = item_y.clamp(from, to - 0.01);
        }
        let mut best: Option<(usize, f32)> = None;
        for index in unit.texts.clone() {
            let boxed = &texts[index];
            let dx = if item_x < boxed.x {
                boxed.x - item_x
            } else if item_x > boxed.x + boxed.width {
                item_x - boxed.x - boxed.width
            } else {
                0.0
            };
            let dy = if item_y < boxed.y {
                boxed.y - item_y
            } else if item_y > boxed.y + boxed.height() {
                item_y - boxed.y - boxed.height()
            } else {
                0.0
            };
            let distance = dx * 1000.0 + dy;
            if best.is_none_or(|(_, least)| distance < least) {
                best = Some((index, distance));
            }
        }
        let (index, _) = best?;
        let boxed = &texts[index];
        let mut local_y = item_y - boxed.y;
        if let Some(line) = unit.line {
            let info = &boxed.lines()[line];
            local_y = local_y.clamp(info.top + 0.5, info.bottom - 0.5);
        }
        Some((frag.item, index, item_x - boxed.x, local_y))
    }

    /// the position at a point of a page
    pub fn hit(&self, page: usize, x: f32, y: f32) -> Option<Hit> {
        let frag_index = self.frag_near(page, y)?;
        let frag = self.frags[frag_index];
        match self.box_near(frag_index, x, y) {
            Some((item, text, x, y)) => Some(Hit::Text(self.laid[item].texts[text].hit(x, y))),
            None => Some(Hit::Node(self.items[frag.item].from())),
        }
    }

    /// the word at a point of a page
    pub fn word(&self, page: usize, x: f32, y: f32) -> Option<(u32, u32)> {
        let frag_index = self.frag_near(page, y)?;
        let (item, text, x, y) = self.box_near(frag_index, x, y)?;
        Some(self.laid[item].texts[text].word(x, y))
    }

    /// the position a line up (`down` false) or down from `pos`, nearest
    /// to `goal`, the x the movement started at
    pub fn vertical(&self, pos: u32, down: bool, goal: f32) -> Option<Hit> {
        let item = self.item_at(pos)?;
        let frag_index = match self.text_at(item, pos) {
            Some(text) => {
                let boxed = &self.laid[item].texts[text];
                let (line, ..) = boxed.caret(pos, false);
                let unit = self.unit_of_text(item, text, line);
                // a table cell has several lines in one unit
                let target = if down { line + 1 } else { line.wrapping_sub(1) };
                if self.laid[item].units[unit].line.is_none() && target < boxed.line_count() {
                    let info = &boxed.lines()[target];
                    let x = goal - self.settings.margins.left - boxed.x;
                    return Some(Hit::Text(boxed.hit(x, (info.top + info.bottom) / 2.0)));
                }
                self.frag_of(item, unit)?
            }
            None => self.frag_of(item, 0)?,
        };
        let mut next = frag_index;
        loop {
            next = if down { next + 1 } else { next.checked_sub(1)? };
            let frag = *self.frags.get(next)?;
            let unit = &self.laid[frag.item].units[frag.unit];
            if frag.repeat || (unit.height == 0.0 && unit.texts.is_empty()) {
                continue;
            }
            if unit.texts.is_empty() {
                return Some(Hit::Node(self.items[frag.item].from()));
            }
            // the first or last line of the text box under the goal
            let texts = &self.laid[frag.item].texts;
            let item_x = goal - self.settings.margins.left;
            let index = unit
                .texts
                .clone()
                .min_by(|&a, &b| {
                    let distance = |boxed: &TextBox| {
                        if item_x < boxed.x {
                            boxed.x - item_x
                        } else {
                            (item_x - boxed.x - boxed.width).max(0.0)
                        }
                    };
                    distance(&texts[a]).total_cmp(&distance(&texts[b]))
                })
                .unwrap();
            let boxed = &texts[index];
            let lines = boxed.lines();
            let line = match unit.line {
                Some(line) => line,
                None if down => 0,
                None => lines.len() - 1,
            };
            let info = &lines[line];
            return Some(Hit::Text(
                boxed.hit(item_x - boxed.x, (info.top + info.bottom) / 2.0),
            ));
        }
    }

    /// the start or end of the line `pos` is on
    pub fn line_edge(&self, pos: u32, end: bool) -> Option<u32> {
        let item = self.item_at(pos)?;
        let text = self.text_at(item, pos)?;
        let boxed = &self.laid[item].texts[text];
        let (line, ..) = boxed.caret(pos, false);
        let (start, stop) = boxed.line_bounds(line);
        Some(if end { stop } else { start })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::test_support::*;

    #[test]
    fn maps_positions_to_pages_and_back() {
        let items = document(&[LONG; 40]);
        let engine = engine(items.clone());
        for item in [0, 17, 39] {
            let pos = items[item].from() + 10;
            let (page, x, y, height) = engine.caret(pos, false).unwrap();
            // a click at the caret lands on the same position
            let hit = engine.hit(page, x + 0.1, y + height / 2.0).unwrap();
            assert_eq!(hit, Hit::Text(pos), "item {item} page {page}");
        }
        // a click beside the text finds the nearest line
        let (page, _, y, _) = engine.caret(items[5].from(), false).unwrap();
        assert_eq!(
            engine.hit(page, -50.0, y + 4.0),
            Some(Hit::Text(items[5].from()))
        );
    }

    #[test]
    fn moves_between_lines_and_pages() {
        let items = document(&[LONG; 40]);
        let engine = engine(items.clone());
        let pos = items[0].from() + 20;
        let (_, x, y, _) = engine.caret(pos, false).unwrap();
        let Some(Hit::Text(down)) = engine.vertical(pos, true, x) else {
            panic!()
        };
        let (_, x2, y2, _) = engine.caret(down, false).unwrap();
        assert!(y2 > y);
        assert!((x2 - x).abs() < 6.0);
        let Some(Hit::Text(up)) = engine.vertical(down, false, x) else {
            panic!()
        };
        assert_eq!(up, pos);
        // from the last line of a page to the first of the next
        let second = engine.pages[1].first.unwrap();
        let frag = engine.first_frag[second.0] + 0;
        let previous = engine.frags[engine.pages[0].end - 1];
        let last_line_pos = {
            let boxed = &engine.laid[previous.item].texts[0];
            boxed.line_bounds(previous.unit).0
        };
        let Some(Hit::Text(next)) =
            engine.vertical(last_line_pos, true, engine.settings.margins.left)
        else {
            panic!()
        };
        assert_eq!(engine.caret(next, false).unwrap().0, 1, "{frag}");
    }
}

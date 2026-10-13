//! Positions: where a position is on the pages, what a point hits, and
//! where the caret goes up, down and to the ends of a line.

use super::Engine;
use crate::model::Content;
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

    /// the fragments of an item, in order: one run, but for an item in a
    /// column of a grid that goes on over a page, whose fragments there
    /// come after the other columns' on the page before
    pub(super) fn frags_of(&self, item: usize) -> impl Iterator<Item = usize> + '_ {
        let first = self
            .first_frag
            .get(item)
            .copied()
            .filter(|&first| first != usize::MAX);
        first.into_iter().flat_map(move |first| {
            (first..self.frags.len())
                .take_while(move |&index| {
                    let frag = self.frags[index];
                    frag.item == item
                        || frag.repeat
                        || self.items[item].beside(&self.items[frag.item])
                })
                .filter(move |&index| self.frags[index].item == item)
        })
    }

    /// the fragment of an item's unit
    pub(super) fn frag_of(&self, item: usize, unit: usize) -> Option<usize> {
        self.frags_of(item).find(|&index| {
            let frag = self.frags[index];
            frag.unit == unit && !frag.repeat
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
                // beside an image where it stands, e.g. centered, else at
                // the edges of the column's text
                let image = unit.decos.iter().find_map(|deco| match deco {
                    crate::items::Deco::Image { x, w, .. } => Some((*x, x + w)),
                    _ => None,
                });
                let (start, end) =
                    image.unwrap_or_else(|| self.items[item].text_edges(&self.settings));
                let height = unit.height.max(12.0);
                Some((
                    self.page_of_frag(frag_index),
                    self.settings.margins.left + if at_end { end } else { start },
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

    /// the fragment on a page nearest to a point: to its height, and across
    /// for the columns of a grid and frames, which stand beside others
    fn frag_near(&self, page: usize, x: f32, y: f32) -> Option<usize> {
        let mut best: Option<(usize, f32)> = None;
        for index in self.frags_on(page) {
            let frag = self.frags[index];
            let unit = &self.laid[frag.item].units[frag.unit];
            let item = &self.items[frag.item];
            // and across for the columns of a grid and frames, which stand
            // beside others
            let dx = if item.placed() {
                let (left, right) = item.edges(&self.settings);
                gap(x, self.settings.margins.left + left, right - left)
            } else {
                0.0
            };
            let distance = gap(y, frag.y, unit.height) + dx;
            if best.is_none_or(|(_, least)| distance < least) {
                best = Some((index, distance));
            }
        }
        best.map(|(index, _)| index)
    }

    /// the text box of a fragment nearest to a point, with the point in
    /// the box's coordinates
    fn box_near(&self, frag_index: usize, x: f32, y: f32) -> Option<BoxPoint> {
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
            let distance =
                gap(item_x, boxed.x, boxed.width) * 1000.0 + gap(item_y, boxed.y, boxed.height());
            if best.is_none_or(|(_, least)| distance < least) {
                best = Some((index, distance));
            }
        }
        let (index, _) = best?;
        let boxed = &texts[index];
        let mut local_y = item_y - boxed.y;
        if let Some(info) = unit.line.and_then(|line| boxed.lines().get(line)) {
            local_y = local_y.clamp(info.top + 0.5, info.bottom - 0.5);
        }
        Some((frag.item, index, item_x - boxed.x, local_y))
    }

    /// the fragment of a page nearest to a point, and the text box in it
    /// nearest to it, see `box_near`
    fn near(&self, page: usize, x: f32, y: f32) -> Option<(usize, Option<BoxPoint>)> {
        if !(x.is_finite() && y.is_finite()) {
            return None;
        }
        let frag_index = self.frag_near(page, x, y)?;
        Some((frag_index, self.box_near(frag_index, x, y)))
    }

    /// the position at a point of a page
    pub fn hit(&self, page: usize, x: f32, y: f32) -> Option<Hit> {
        let (frag_index, found) = self.near(page, x, y)?;
        match found {
            Some((item, text, x, y)) => Some(Hit::Text(self.laid[item].texts[text].hit(x, y))),
            None => Some(Hit::Node(self.items[self.frags[frag_index].item].from())),
        }
    }

    /// the word at a point of a page
    pub fn word(&self, page: usize, x: f32, y: f32) -> Option<(u32, u32)> {
        let (item, text, x, y) = self.near(page, x, y)?.1?;
        Some(self.laid[item].texts[text].word(x, y))
    }

    /// the position a line up (`down` false) or down from the caret at
    /// `pos` (painted as `after` says, see `caret`), nearest to `goal`, the
    /// x the movement started at; with whether the caret there is painted
    /// at the end of its line (`after`)
    pub fn vertical(&self, pos: u32, after: bool, down: bool, goal: f32) -> Option<(Hit, bool)> {
        if !goal.is_finite() {
            return None;
        }
        let item = self.item_at(pos)?;
        let frag_index = match self.text_at(item, pos) {
            Some(text) => {
                let boxed = &self.laid[item].texts[text];
                let (line, ..) = boxed.caret(pos, after);
                let unit = self.unit_of_text(item, text, line);
                // a table's row has the lines of its cells in one unit: the
                // next line of the box, or else the next paragraph of the
                // cell, before the next unit
                if self.laid[item].units[unit].line.is_none() {
                    // the position on a line of a box nearest to the goal
                    let on_line = |boxed: &TextBox, line: usize| {
                        let x = goal - self.settings.margins.left - boxed.x;
                        let (pos, after) = boxed.hit_line(line, x);
                        Some((Hit::Text(pos), after))
                    };
                    let target = if down { line + 1 } else { line.wrapping_sub(1) };
                    if target < boxed.line_count() {
                        return on_line(boxed, target);
                    }
                    if let Some(other) = self.box_in_column(item, unit, text, down) {
                        let other_box = &self.laid[item].texts[other];
                        let target = if down {
                            0
                        } else {
                            other_box.line_count().saturating_sub(1)
                        };
                        return on_line(other_box, target);
                    }
                }
                self.frag_of(item, unit)?
            }
            // a block without text, like a table of contents laid out as a
            // title and its entries, is left from its last unit going down
            None if down => self
                .frags_of(item)
                .filter(|&index| !self.frags[index].repeat)
                .last()?,
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
            // in a grid, the caret stays in its column, and goes into the
            // column under the goal
            let candidate = &self.items[frag.item];
            if candidate.beside(&self.items[item]) {
                continue;
            }
            if let Some(column) = &candidate.column {
                let entering = self.items[item].band() != Some(column.band);
                let width = self.settings.content_width();
                let under = column.at(goal - self.settings.margins.left, width);
                if entering && column.index != under {
                    continue;
                }
            }
            if unit.texts.is_empty() {
                // a caption isn't text to move through: a table's cells come
                // after it, and a picture is above its own
                let laid = &self.laid[frag.item];
                let caption = match self.items[frag.item].content {
                    Content::Table { .. } => frag.unit == 0 && laid.label.is_some(),
                    Content::Image { .. } => frag.unit > 0,
                    _ => false,
                };
                if caption {
                    continue;
                }
                return Some((Hit::Node(self.items[frag.item].from()), false));
            }
            // the text box under the goal: the first of a cell going down,
            // the last going up
            let texts = &self.laid[frag.item].texts;
            let item_x = goal - self.settings.margins.left;
            let index = unit.texts.clone().min_by(|&a, &b| {
                let distance = |boxed: &TextBox| {
                    if item_x < boxed.x {
                        boxed.x - item_x
                    } else {
                        (item_x - boxed.x - boxed.width).max(0.0)
                    }
                };
                let (a, b) = (&texts[a], &texts[b]);
                let by_y = if down {
                    a.y.total_cmp(&b.y)
                } else {
                    b.y.total_cmp(&a.y)
                };
                distance(a).total_cmp(&distance(b)).then(by_y)
            })?;
            let boxed = &texts[index];
            // its first or last line this unit shows: a slice of a row
            // taller than a page shows only some
            let shown: Vec<usize> = boxed
                .lines()
                .iter()
                .enumerate()
                .filter(|(_, info)| unit.shows(boxed.y + info.top, boxed.y + info.bottom))
                .map(|(line, _)| line)
                .collect();
            // a slice of a row taller than a page that shows none of the box
            // under the goal, e.g. of the other, longer cell: past it, to
            // where the column goes on
            if unit.line.is_none() && unit.clip.is_some() && shown.is_empty() {
                continue;
            }
            let line = match unit.line {
                Some(line) => line,
                None if down => shown.first().copied().unwrap_or(0),
                None => shown
                    .last()
                    .copied()
                    .unwrap_or(boxed.line_count().saturating_sub(1)),
            };
            let (pos, after) = boxed.hit_line(line, item_x - boxed.x);
            return Some((Hit::Text(pos), after));
        }
    }

    /// the nearest text box of a unit below (`down`) or above the box
    /// `text`, in its column: the next or previous paragraph of a cell
    fn box_in_column(&self, item: usize, unit: usize, text: usize, down: bool) -> Option<usize> {
        let texts = &self.laid[item].texts;
        let current = &texts[text];
        let (left, right) = (current.x, current.x + current.width);
        let (top, bottom) = (current.y, current.y + current.height());
        self.laid[item].units[unit]
            .texts
            .clone()
            .filter(|&other| other != text)
            .filter(|&other| {
                let boxed = &texts[other];
                let overlaps = boxed.x < right && left < boxed.x + boxed.width;
                let beyond = if down {
                    boxed.y >= bottom - 0.01
                } else {
                    boxed.y + boxed.height() <= top + 0.01
                };
                overlaps && beyond
            })
            .min_by(|&a, &b| {
                let (a, b) = (texts[a].y, texts[b].y);
                if down {
                    a.total_cmp(&b)
                } else {
                    b.total_cmp(&a)
                }
            })
    }

    /// the start or end of the line the caret at `pos` is painted on (as
    /// `after` says, see `caret`), with whether the caret there is painted
    /// at the end of its line: at the end of a word broken where it is
    /// wider than the line, whose next line starts at the same position
    pub fn line_edge(&self, pos: u32, after: bool, end: bool) -> Option<(u32, bool)> {
        let item = self.item_at(pos)?;
        let text = self.text_at(item, pos)?;
        let boxed = &self.laid[item].texts[text];
        let (line, ..) = boxed.caret(pos, after);
        Some(if end {
            boxed.line_end(line)
        } else {
            (boxed.line_bounds(line).0, false)
        })
    }
}

/// a text box near a point: its item, its index among the item's boxes, and
/// the point in the box's coordinates
type BoxPoint = (usize, usize, f32, f32);

/// how far `v` is from the span of `len` from `start`: 0 within it
fn gap(v: f32, start: f32, len: f32) -> f32 {
    if v < start {
        start - v
    } else if v > start + len {
        v - start - len
    } else {
        0.0
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
        let Some((Hit::Text(down), _)) = engine.vertical(pos, false, true, x) else {
            panic!()
        };
        let (_, x2, y2, _) = engine.caret(down, false).unwrap();
        assert!(y2 > y);
        assert!((x2 - x).abs() < 6.0);
        let Some((Hit::Text(up), _)) = engine.vertical(down, false, false, x) else {
            panic!()
        };
        assert_eq!(up, pos);
        // from the last line of a page to the first of the next
        let second = engine.pages[1].first.unwrap();
        let frag = engine.first_frag[second.0];
        let previous = engine.frags[engine.pages[0].end - 1];
        let last_line_pos = {
            let boxed = &engine.laid[previous.item].texts[0];
            boxed.line_bounds(previous.unit).0
        };
        let Some((Hit::Text(next), _)) =
            engine.vertical(last_line_pos, false, true, engine.settings.margins.left)
        else {
            panic!()
        };
        assert_eq!(engine.caret(next, false).unwrap().0, 1, "{frag}");
    }

    #[test]
    fn puts_the_caret_beside_an_aligned_image() {
        for (align, left) in [(None, 0.0), (Some("center"), 0.5), (Some("right"), 1.0)] {
            let image = crate::model::Item {
                content: Content::Image {
                    pos: 0,
                    src: "photo.png".into(),
                    width: 200.0,
                    height: 100.0,
                    alt: String::new(),
                    align: align.map(String::from),
                    share: None,
                    caption: None,
                },
                ..paragraph(0, "")
            };
            let engine = engine(vec![image]);
            let room = engine.settings.content_width() - 200.0;
            let start = engine.settings.margins.left + room * left;
            let (_, before, ..) = engine.caret(0, false).unwrap();
            let (_, after, ..) = engine.caret(1, true).unwrap();
            assert!((before - start).abs() < 0.01, "{align:?}: {before}");
            assert!((after - start - 200.0).abs() < 0.01, "{align:?}: {after}");
        }
    }

    /// the line a caret is on, by its height, among the tops of the lines
    fn line_of(engine: &Engine, pos: u32, after: bool, tops: &[f32]) -> usize {
        let (_, _, y, _) = engine.caret(pos, after).unwrap();
        tops.iter()
            .position(|top| (top - y).abs() < 0.5)
            .unwrap_or_else(|| panic!("no line at {y}: {tops:?}"))
    }

    /// a paragraph whose lines are ragged: a full one, one short word, and
    /// a long word that didn't fit after it
    fn ragged() -> (Engine, Vec<f32>) {
        let words: Vec<&str> = LONG.split(' ').collect();
        for count in 8..words.len() {
            let full = words[..count].join(" ");
            for length in (40..120).step_by(4) {
                let text = format!("{full} ab {}", "x".repeat(length));
                let engine = engine(vec![paragraph(1, &text)]);
                let boxed = &engine.laid[0].texts[0];
                let lines = boxed.lines();
                if lines.len() == 3 && &boxed.text[lines[1].start..lines[1].end] == "ab " {
                    let tops = (0..3)
                        .map(|line| engine.caret(boxed.line_bounds(line).0, false).unwrap().2)
                        .collect();
                    return (engine, tops);
                }
            }
        }
        panic!("no ragged paragraph");
    }

    #[test]
    fn moves_up_and_down_along_ragged_lines() {
        let (engine, tops) = ragged();
        let boxed = &engine.laid[0].texts[0];
        // from the end of the first line, right of where the second ends
        let (start, _) = boxed.line_end(0);
        let goal = engine.caret(start, false).unwrap().1;
        let mut at = (start, false);
        let mut visited = vec![];
        for down in [true, true, false, false] {
            let (Hit::Text(pos), after) = engine.vertical(at.0, at.1, down, goal).unwrap() else {
                panic!("a node");
            };
            at = (pos, after);
            visited.push(line_of(&engine, pos, after, &tops));
        }
        assert_eq!(visited, [1, 2, 1, 0]);
    }

    #[test]
    fn ends_a_line_broken_inside_a_word_on_that_line() {
        let engine = engine(vec![paragraph(1, &"a".repeat(300))]);
        let boxed = &engine.laid[0].texts[0];
        assert!(boxed.line_count() > 2);
        let tops: Vec<f32> = (0..boxed.line_count())
            .map(|line| engine.caret(boxed.line_bounds(line).0, false).unwrap().2)
            .collect();
        // End on the first line: its end is where the second starts, and
        // the caret is painted at the end of the first
        let (end, after) = engine.line_edge(5, false, true).unwrap();
        assert!(after);
        assert_eq!(end, boxed.line_bounds(1).0);
        assert_eq!(line_of(&engine, end, after, &tops), 0);
        // a second End stays put
        assert_eq!(engine.line_edge(end, after, true), Some((end, true)));
        // Home from there is the start of the first line, not the second
        assert_eq!(engine.line_edge(end, after, false), Some((1, false)));
        // down from the end of the first line lands at the end of the
        // second, painted on the second
        let goal = engine.caret(end, true).unwrap().1 + 50.0;
        let (Hit::Text(pos), after) = engine.vertical(end, true, true, goal).unwrap() else {
            panic!("a node");
        };
        assert_eq!(line_of(&engine, pos, after, &tops), 1);
        // the end of the last line is the end of the text, not before its
        // last character
        let last = engine.items[0].to();
        assert_eq!(engine.line_edge(last - 1, false, true), Some((last, false)));
    }

    /// a table of a cell with two paragraphs, "first" (3..8) and "second"
    /// (10..16), over a cell "third" (23..28)
    fn two_paragraph_cell() -> Engine {
        use crate::model::{Cell, Row, Text};
        let paragraphs = vec![
            Text {
                pos: 3,
                text: "first".into(),
                ..Default::default()
            },
            Text {
                pos: 10,
                text: "second".into(),
                ..Default::default()
            },
        ];
        let rows = vec![
            Row {
                cells: vec![Cell {
                    paragraphs,
                    ..Default::default()
                }],
                header: false,
            },
            Row {
                cells: vec![cell(23, "third")],
                header: false,
            },
        ];
        engine(vec![table_item(rows, None)])
    }

    fn text_hit(found: Option<(Hit, bool)>) -> u32 {
        match found {
            Some((Hit::Text(pos), _)) => pos,
            other => panic!("{other:?}"),
        }
    }

    #[test]
    fn multi_paragraph_cell_down_arrow() {
        let engine = two_paragraph_cell();
        let goal = engine.caret(5, false).unwrap().1;
        let down = text_hit(engine.vertical(5, false, true, goal));
        assert!((10..=16).contains(&down), "{down}");
        // and on to the next row
        let next = text_hit(engine.vertical(down, false, true, goal));
        assert!((23..=28).contains(&next), "{next}");
    }

    #[test]
    fn multi_paragraph_cell_up_arrow() {
        let engine = two_paragraph_cell();
        let goal = engine.caret(25, false).unwrap().1;
        let up = text_hit(engine.vertical(25, false, false, goal));
        assert!((10..=16).contains(&up), "{up}");
        let up = text_hit(engine.vertical(up, false, false, goal));
        assert!((3..=8).contains(&up), "{up}");
    }

    #[test]
    fn down_arrow_over_captioned_table() {
        use crate::model::{Content, Row};
        let rows = vec![Row {
            cells: vec![cell(23, "cell")],
            header: false,
        }];
        let mut table = table_item(rows, Some("The caption"));
        if let Content::Table { pos, .. } = &mut table.content {
            *pos = 20;
        }
        let engine = engine(vec![paragraph(1, "above"), table]);
        let goal = engine.caret(3, false).unwrap().1;
        let down = text_hit(engine.vertical(3, false, true, goal));
        assert!((23..=27).contains(&down), "{down}");
        // and back up over the caption, into the paragraph
        let up = text_hit(engine.vertical(down, false, false, goal));
        assert!((1..=6).contains(&up), "{up}");
    }

    #[test]
    fn leaves_a_row_taller_than_a_page_by_its_short_cell() {
        use crate::model::{Content, Row};
        // a short cell beside one taller than a page, then a paragraph
        let long = vec!["x"; 90].join("\n");
        let rows = vec![Row {
            cells: vec![cell(3, "short"), cell(20, &long)],
            header: false,
        }];
        let mut table = table_item(rows, None);
        if let Content::Table { end, .. } = &mut table.content {
            *end = 300;
        }
        let engine = engine(vec![table, paragraph(301, "after")]);
        assert!(engine.pages.len() > 1);
        let (_, x, ..) = engine.caret(5, false).unwrap();
        // down from the short cell goes past the long one's slices
        let down = text_hit(engine.vertical(5, false, true, x));
        assert!((301..=306).contains(&down), "{down}");
        // and up from below comes back into the short cell's column
        let up = text_hit(engine.vertical(down, false, false, x));
        assert!((3..=8).contains(&up), "{up}");
    }
}

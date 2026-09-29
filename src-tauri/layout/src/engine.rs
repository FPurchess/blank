//! The engine: keeps the laid out items of a document, paginates them, and
//! answers where positions are and what a page shows.

use parley::Alignment;

use crate::bands::{bands_on, chapter_on, expand_slots, Chapter, Values, BAND_DISTANCE, BAND_LINE};
use crate::fonts::{Fonts, INK_CODE};
use crate::items::{Deco, Laid, Role};
use crate::model::{Content, Item, Settings, Text};
use crate::style::BAR;
use crate::text::{GlyphRun, TextBox};

/// a unit of an item placed on a page, at `y` from the page's top edge
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Frag {
    pub item: usize,
    pub unit: usize,
    pub y: f32,
    /// a table's header row, repeated on a page the table continues on
    pub repeat: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Page {
    /// its fragments in `Engine::frags`
    pub start: usize,
    pub end: usize,
    /// the first unit placed on it that isn't a repeat, as (item, unit)
    pub first: Option<(usize, usize)>,
    /// where its text ends, from the page's top edge
    pub bottom: f32,
    /// changes whenever what the page shows changes, so the screen paints
    /// only those pages again
    pub version: u32,
    /// the text of its header and footer slots
    pub bands: [String; 6],
}

/// what the page shows, in points from its top left corner
#[derive(Clone, Debug)]
pub enum Op {
    Glyphs {
        run: GlyphRun,
        role: Role,
        /// the text the glyphs' ranges point into
        text: String,
    },
    Rect {
        x: f32,
        y: f32,
        w: f32,
        h: f32,
        role: Role,
    },
    Image {
        src: String,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
    },
    Link {
        href: String,
        x: f32,
        y: f32,
        w: f32,
        h: f32,
    },
}

/// what changed with an update, for the measurements
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Stats {
    pub laid_out: usize,
    pub paginated_from: usize,
    pub settled_at: Option<usize>,
}

pub struct Engine {
    pub fonts: Fonts,
    pub settings: Settings,
    pub items: Vec<Item>,
    pub laid: Vec<Laid>,
    pub frags: Vec<Frag>,
    pub pages: Vec<Page>,
    /// the first fragment of each item
    pub first_frag: Vec<usize>,
    pub chapters: Vec<Chapter>,
    pub stats: Stats,
    next_version: u32,
}

/// a word as laid out, see Engine::words
#[derive(Clone, Debug, PartialEq)]
pub struct Word {
    pub page: usize,
    pub left: f32,
    pub right: f32,
    pub baseline: f32,
    pub size: f32,
    pub font: usize,
    pub text: String,
    start: u32,
}

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

/// how a position is shown: as a caret in text, or as a whole node
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Hit {
    Text(u32),
    Node(u32),
}

impl Engine {
    pub fn new(fonts: Fonts) -> Engine {
        let mut engine = Engine {
            fonts,
            settings: Settings::default(),
            items: vec![],
            laid: vec![],
            frags: vec![],
            pages: vec![],
            first_frag: vec![],
            chapters: vec![],
            stats: Stats::default(),
            next_version: 1,
        };
        engine.paginate_from(0, None);
        engine
    }

    fn lay_out(&mut self, item: &Item) -> Laid {
        let width = self.settings.content_width();
        let mut laid = Laid::new(&mut self.fonts, item, width);
        if laid.units.is_empty() {
            laid.units.push(crate::items::Unit {
                top: 0.0,
                height: 0.0,
                header: false,
                texts: 0..0,
                line: None,
                decos: vec![],
            });
        }
        laid
    }

    /// sets the page and lays out everything again, if it changed
    pub fn set_settings(&mut self, settings: Settings) {
        if settings == self.settings {
            return;
        }
        let relayout = settings.width != self.settings.width
            || settings.margins.left != self.settings.margins.left
            || settings.margins.right != self.settings.margins.right;
        self.settings = settings;
        if relayout {
            let items = std::mem::take(&mut self.items);
            self.laid = items.iter().map(|item| self.lay_out(item)).collect();
            self.items = items;
        }
        self.paginate_from(0, None);
    }

    /// replaces all items
    pub fn set_items(&mut self, items: Vec<Item>) {
        self.laid = items.iter().map(|item| self.lay_out(item)).collect();
        self.items = items;
        self.stats = Stats {
            laid_out: self.items.len(),
            ..Default::default()
        };
        self.paginate_from(0, None);
    }

    /// replaces `delete` items from `start` with `inserted`, and moves the
    /// items after them by `shift` positions. Only the new items are laid
    /// out, and the pages are paginated again from the page of the first
    /// change until they start as before.
    pub fn update(&mut self, start: usize, delete: usize, inserted: Vec<Item>, shift: i64) {
        let start = start.min(self.items.len());
        let delete = delete.min(self.items.len() - start);
        // a heading before the change is kept with what follows it, so the
        // pagination starts at the run of headings before it
        let mut earliest = start;
        while earliest > 0 && self.items[earliest - 1].heading_level() > 0 {
            earliest -= 1;
        }
        let restart_page = if earliest < self.first_frag.len() {
            self.page_of_frag(self.first_frag[earliest])
        } else {
            self.pages.len().saturating_sub(1)
        };
        let laid: Vec<Laid> = inserted.iter().map(|item| self.lay_out(item)).collect();
        let count = inserted.len();
        self.items.splice(start..start + delete, inserted);
        self.laid.splice(start..start + delete, laid);
        if shift != 0 {
            for item in &mut self.items[start + count..] {
                item.shift(shift);
            }
            for laid in &mut self.laid[start + count..] {
                for text in &mut laid.texts {
                    text.pos = (text.pos as i64 + shift).max(0) as u32;
                }
            }
        }
        self.stats = Stats {
            laid_out: count,
            ..Default::default()
        };
        let tail = Tail {
            start: start + count,
            delta: count as i64 - delete as i64,
        };
        self.paginate_from(restart_page, Some(tail));
    }

    fn page_of_frag(&self, frag: usize) -> usize {
        self.pages
            .partition_point(|page| page.end <= frag)
            .min(self.pages.len().saturating_sub(1))
    }

    /// paginates from the start of page `from`. With `tail`, the items from
    /// `tail.start` on are the ones that were there before, moved by
    /// `tail.delta`: once a page starts with one of them where an old page
    /// did, the rest is as before.
    fn paginate_from(&mut self, from: usize, tail: Option<Tail>) {
        let from = from.min(self.pages.len());
        let old_pages = std::mem::take(&mut self.pages);
        let old_frags = std::mem::take(&mut self.frags);
        let mut from = if tail.is_none() { 0 } else { from };
        while from > 0 && old_pages.get(from).is_none_or(|page| page.first.is_none()) {
            from -= 1;
        }
        let (start_item, start_unit) = old_pages
            .get(from)
            .and_then(|page| page.first)
            .unwrap_or((0, 0));
        let from = if start_item == 0 && start_unit == 0 {
            0
        } else {
            from
        };
        let keep_frags = old_pages.get(from).map(|page| page.start).unwrap_or(0);
        let mut paginator = Paginator {
            items: &self.items,
            laid: &self.laid,
            settings: &self.settings,
            frags: old_frags[..keep_frags].to_vec(),
            pages: old_pages[..from].to_vec(),
            y: 0.0,
            empty: true,
            prev_after: 0.0,
            old: tail.map(|tail| (tail, &old_pages[..], &old_frags[..])),
            settled: None,
        };
        paginator.run(start_item, start_unit);
        let settled = paginator.settled;
        let Paginator {
            mut frags,
            mut pages,
            ..
        } = paginator;
        let mut copied_from = usize::MAX;
        if let (Some(old_index), Some(tail)) = (settled, tail) {
            copied_from = pages.len();
            let offset = frags.len() as i64 - old_pages[old_index].start as i64;
            for page in &old_pages[old_index..] {
                let mut page = page.clone();
                page.start = (page.start as i64 + offset) as usize;
                page.end = (page.end as i64 + offset) as usize;
                page.first = page
                    .first
                    .map(|(item, unit)| ((item as i64 + tail.delta) as usize, unit));
                pages.push(page);
            }
            for frag in &old_frags[old_pages[old_index].start..] {
                frags.push(Frag {
                    item: (frag.item as i64 + tail.delta) as usize,
                    ..*frag
                });
            }
        }
        self.stats.paginated_from = from;
        self.stats.settled_at = settled.map(|_| copied_from);
        self.frags = frags;
        self.pages = pages;
        self.first_frag = vec![usize::MAX; self.items.len()];
        for (index, frag) in self.frags.iter().enumerate().rev() {
            if !frag.repeat {
                self.first_frag[frag.item] = index;
            }
        }
        self.chapters = self
            .items
            .iter()
            .enumerate()
            .filter_map(|(index, item)| match &item.content {
                Content::Text(text) if text.top && text.level == 1 => Some(Chapter {
                    page: self.page_of_frag(self.first_frag[index]) + 1,
                    text: text.text.clone(),
                }),
                _ => None,
            })
            .collect();
        // new versions for the pages paginated again, and for the pages whose
        // headers or footers changed
        let count = self.pages.len();
        for index in 0..count {
            let bands = self.band_texts(index);
            let source = if index < from {
                Some(index)
            } else if index >= copied_from {
                settled.map(|old_index| old_index + index - copied_from)
            } else {
                None
            };
            let kept = source
                .and_then(|source| old_pages.get(source))
                .filter(|old| old.bands == bands)
                .map(|old| old.version);
            self.pages[index].version = kept.unwrap_or_else(|| {
                self.next_version += 1;
                self.next_version
            });
            self.pages[index].bands = bands;
        }
    }

    fn band_texts(&self, page: usize) -> [String; 6] {
        let bands = bands_on(&self.settings, page + 1);
        let values = Values {
            settings: &self.settings,
            page: page + 1,
            pages: self.pages.len(),
            chapter: chapter_on(&self.chapters, page + 1),
        };
        let [a, b, c] = expand_slots(&bands.header, &values);
        let [d, e, f] = expand_slots(&bands.footer, &values);
        [a, b, c, d, e, f]
    }

    // positions

    /// the item a position is in, or the last one before it
    fn item_at(&self, pos: u32) -> Option<usize> {
        let index = self.items.partition_point(|item| item.from() <= pos);
        if index == 0 {
            return (!self.items.is_empty()).then_some(0);
        }
        Some(index - 1)
    }

    /// the fragment of an item's unit
    fn frag_of(&self, item: usize, unit: usize) -> Option<usize> {
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

    fn unit_of_text(&self, item: usize, text: usize, line: usize) -> usize {
        let laid = &self.laid[item];
        laid.units
            .iter()
            .position(|unit| match unit.line {
                Some(unit_line) => unit.texts.contains(&text) && unit_line == line,
                None => unit.texts.contains(&text),
            })
            .unwrap_or(0)
    }

    /// the page and the point on it of a spot in an item's text box
    fn to_page(
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
    fn text_at(&self, item: usize, pos: u32) -> Option<usize> {
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
    fn frags_on(&self, page: usize) -> std::ops::Range<usize> {
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
        let item_y = y - frag.y + unit.top;
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
                        rects.push((
                            self.page_of_frag(frag_index),
                            self.settings.margins.left + self.items[item].indent,
                            frag.y,
                            self.settings.content_width() - self.items[item].indent,
                            unit.height.max(4.0),
                        ));
                    }
                }
                continue;
            }
            for (index, boxed) in laid.texts.iter().enumerate() {
                let (start, end) = (boxed.pos, boxed.pos + boxed.len);
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
        (
            left + item.indent,
            frag.y,
            self.settings.content_width() - item.indent,
            unit.height,
        )
    }

    /// the boxes of the blocks from `from` to `to`, one per page they are
    /// on: page, x, y, width and height. A block is in the range when all
    /// of it is, as the items of a node are within the node.
    pub fn boxes(&self, from: u32, to: u32) -> Vec<(usize, f32, f32, f32, f32)> {
        let mut boxes: Vec<(usize, f32, f32, f32, f32)> = vec![];
        let start = self.items.partition_point(|item| item.from() < from);
        for item in start..self.items.len() {
            if self.items[item].from() > to {
                break;
            }
            if self.items[item].to() > to {
                continue;
            }
            let Some(first) = self.first_frag.get(item).copied() else {
                continue;
            };
            if first == usize::MAX {
                continue;
            }
            for index in first..self.frags.len() {
                let frag = self.frags[index];
                if frag.item != item {
                    if frag.repeat {
                        continue;
                    }
                    break;
                }
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
            rows.push(GridRow {
                page: self.page_of_frag(index),
                row: frag.unit,
                y: frag.y,
                height: unit.height,
                repeat: frag.repeat,
            });
        }
        Some(TableGrid { columns, rows })
    }

    /// the lines of the document as laid out: page, x and baseline of the
    /// first glyph, and the text, for checking the PDF against the layout
    pub fn lines(&mut self) -> Vec<(usize, f32, f32, String)> {
        let mut lines = vec![];
        for page in 0..self.pages.len() {
            for op in self.page_ops(page, false) {
                if let Op::Glyphs {
                    run,
                    role: Role::Text,
                    text,
                } = op
                {
                    let Some(first) = run.glyphs.first() else {
                        continue;
                    };
                    let start = first.start as usize;
                    let end = run.glyphs.last().unwrap().end as usize;
                    lines.push((page, first.x, run.baseline, text[start..end].to_string()));
                }
            }
        }
        lines
    }

    /// the words of the document as laid out: page, left and right edge,
    /// baseline, font size and text
    pub fn words(&mut self) -> Vec<Word> {
        let mut words = vec![];
        for page in 0..self.pages.len() {
            for op in self.page_ops(page, true) {
                let Op::Glyphs { run, text, .. } = op else {
                    continue;
                };
                let mut current: Option<Word> = None;
                for glyph in &run.glyphs {
                    let piece = &text[glyph.start as usize..glyph.end as usize];
                    if piece.trim().is_empty() {
                        words.extend(current.take());
                        continue;
                    }
                    let word = current.get_or_insert_with(|| Word {
                        page,
                        left: glyph.x,
                        right: glyph.x,
                        baseline: run.baseline,
                        size: run.size,
                        font: run.font,
                        text: String::new(),
                        start: glyph.start,
                    });
                    word.right = glyph.x + glyph.advance;
                    // a ligature's glyphs share their cluster
                    if glyph.start >= word.start {
                        word.text = text[word.start as usize..glyph.end as usize].to_string();
                    }
                }
                words.extend(current.take());
            }
        }
        // a word in two runs, e.g. bold then a comma, is one word
        let mut merged: Vec<Word> = vec![];
        for word in words {
            if let Some(last) = merged.last_mut() {
                if last.page == word.page
                    && (last.baseline - word.baseline).abs() < 0.01
                    && (last.right - word.left).abs() < 0.01
                {
                    last.right = word.right;
                    last.text.push_str(&word.text);
                    continue;
                }
            }
            merged.push(word);
        }
        merged
    }

    // painting

    /// what a page shows: its text, decorations, images, links and, with
    /// `bands`, its header and footer
    pub fn page_ops(&mut self, page: usize, bands: bool) -> Vec<Op> {
        let mut ops = vec![];
        let band_boxes = if bands { self.band_boxes(page) } else { vec![] };
        let left = self.settings.margins.left;
        let range = self.frags_on(page);
        for index in range.clone() {
            let frag = self.frags[index];
            let item = &self.items[frag.item];
            let laid = &self.laid[frag.item];
            let unit = &laid.units[frag.unit];
            let dx = left;
            let dy = frag.y - unit.top;
            for deco in &unit.decos {
                ops.push(deco_op(deco.moved(dx, dy)));
            }
            // quote bars, down to the next item in the quote on this page
            if !item.bars.is_empty() {
                let mut height = unit.height;
                let last_unit = frag.unit + 1 == laid.units.len();
                if index + 1 < range.end {
                    let next = self.frags[index + 1];
                    if !last_unit || item.bars_continue {
                        height = next.y - frag.y;
                    }
                }
                for bar in &item.bars {
                    ops.push(Op::Rect {
                        x: left + bar,
                        y: frag.y,
                        w: BAR,
                        h: height,
                        role: Role::Text,
                    });
                }
            }
            if frag.unit == 0 && !frag.repeat {
                if let Some(marker) = &laid.marker {
                    push_text_ops(&mut ops, &self.fonts, marker, 0, dx, dy, Role::Text);
                }
                if let Some(label) = &laid.label {
                    for line in 0..label.line_count() {
                        push_text_ops(&mut ops, &self.fonts, label, line, dx, dy, Role::Hint);
                    }
                }
            }
            for text in unit.texts.clone() {
                let boxed = &laid.texts[text];
                let lines = match unit.line {
                    Some(line) => line..line + 1,
                    None => 0..boxed.line_count(),
                };
                for line in lines {
                    push_text_ops(&mut ops, &self.fonts, boxed, line, dx, dy, Role::Text);
                }
            }
        }
        for (boxed, dx, dy) in &band_boxes {
            for line in 0..boxed.line_count() {
                push_text_ops(&mut ops, &self.fonts, boxed, line, *dx, *dy, Role::Band);
            }
        }
        ops
    }

    /// the header and footer of a page, laid out, with where they stand
    fn band_boxes(&mut self, page: usize) -> Vec<(TextBox, f32, f32)> {
        let Some(texts) = self.pages.get(page).map(|page| page.bands.clone()) else {
            return vec![];
        };
        let settings = self.settings.clone();
        let width = settings.content_width() / 3.0;
        let alignments = [Alignment::Left, Alignment::Center, Alignment::Right];
        let tops = [
            BAND_DISTANCE,
            settings.height - settings.margins.bottom
                + (settings.margins.bottom - BAND_DISTANCE - BAND_LINE).max(0.0),
        ];
        let mut boxes = vec![];
        for (index, text) in texts.iter().enumerate() {
            if text.is_empty() {
                continue;
            }
            let (band, slot) = (index / 3, index % 3);
            let text = Text {
                pos: 0,
                text: text.clone(),
                style: "band".into(),
                ..Default::default()
            };
            let boxed = TextBox::new(&mut self.fonts, &text, width, alignments[slot]);
            boxes.push((
                boxed,
                settings.margins.left + width * slot as f32,
                tops[band],
            ));
        }
        boxes
    }
}

fn deco_op(deco: Deco) -> Op {
    match deco {
        Deco::Rect { x, y, w, h, role } => Op::Rect { x, y, w, h, role },
        Deco::Image { src, x, y, w, h } => Op::Image { src, x, y, w, h },
    }
}

fn push_text_ops(
    ops: &mut Vec<Op>,
    fonts: &Fonts,
    boxed: &TextBox,
    line: usize,
    dx: f32,
    dy: f32,
    role: Role,
) {
    let (ox, oy) = (dx + boxed.x, dy + boxed.y);
    let lines = boxed.lines();
    let Some(info) = lines.get(line) else {
        return;
    };
    for mut run in boxed.glyph_runs(fonts, line) {
        for glyph in &mut run.glyphs {
            glyph.x += ox;
            glyph.y += oy;
        }
        run.baseline += oy;
        run.x += ox;
        if run.ink & INK_CODE != 0 {
            ops.push(Op::Rect {
                x: run.x - 1.0,
                y: oy + info.top,
                w: run.width + 2.0,
                h: info.bottom - info.top,
                role: Role::CodeFill,
            });
        }
        if let Some((offset, thickness)) = run.underline {
            ops.push(Op::Rect {
                x: run.x,
                y: run.baseline + offset,
                w: run.width,
                h: thickness,
                role: if role == Role::Text {
                    Role::LinkLine
                } else {
                    role
                },
            });
        }
        if let Some(href) = boxed.link_of(run.ink) {
            ops.push(Op::Link {
                href: href.to_string(),
                x: run.x,
                y: oy + info.top,
                w: run.width,
                h: info.bottom - info.top,
            });
        }
        if run.glyphs.is_empty() {
            continue;
        }
        ops.push(Op::Glyphs {
            run,
            role,
            text: boxed.text.clone(),
        });
    }
}

#[derive(Clone, Copy)]
struct Tail {
    start: usize,
    delta: i64,
}

struct Paginator<'a> {
    items: &'a [Item],
    laid: &'a [Laid],
    settings: &'a Settings,
    frags: Vec<Frag>,
    pages: Vec<Page>,
    y: f32,
    empty: bool,
    prev_after: f32,
    old: Option<(Tail, &'a [Page], &'a [Frag])>,
    settled: Option<usize>,
}

/// room for rounding when a unit ends right at the bottom
const EPSILON: f32 = 0.01;

impl Paginator<'_> {
    fn open_page(&mut self) {
        if let Some(page) = self.pages.last_mut() {
            page.end = self.frags.len();
        }
        self.pages.push(Page {
            start: self.frags.len(),
            end: self.frags.len(),
            first: None,
            bottom: self.settings.content_top(),
            version: 0,
            bands: Default::default(),
        });
        self.y = self.settings.content_top();
        self.empty = true;
    }

    /// places a unit; false once the pages settled
    fn place(&mut self, item: usize, unit: usize, y: f32, repeat: bool) -> bool {
        let height = self.laid[item].units[unit].height;
        let page = self.pages.last_mut().unwrap();
        if !repeat && page.first.is_none() {
            page.first = Some((item, unit));
            if let Some((tail, old_pages, _)) = self.old {
                if item >= tail.start {
                    let old = ((item as i64 - tail.delta) as usize, unit);
                    let index = old_pages
                        .partition_point(|page| page.first.is_some_and(|first| first < old));
                    if old_pages
                        .get(index)
                        .is_some_and(|page| page.first == Some(old))
                    {
                        // the rest is as before: drop this page, the old
                        // ones follow from here
                        let page = self.pages.pop().unwrap();
                        self.frags.truncate(page.start);
                        if let Some(last) = self.pages.last_mut() {
                            last.end = self.frags.len();
                        }
                        self.settled = Some(index);
                        return false;
                    }
                }
            }
        }
        self.frags.push(Frag {
            item,
            unit,
            y,
            repeat,
        });
        self.y = y + height;
        self.empty = false;
        let page = self.pages.last_mut().unwrap();
        page.bottom = page.bottom.max(self.y);
        page.end = self.frags.len();
        true
    }

    /// the height a run of headings from `index` needs with the first unit
    /// of what follows them
    fn keep_height(&self, index: usize) -> f32 {
        let mut height = 0.0;
        let mut current = index;
        loop {
            if current > index {
                height += self.items[current - 1].after + self.items[current].before;
            }
            if self.items[current].heading_level() == 0 {
                height += self.laid[current].units[0].height;
                return height;
            }
            height += self.laid[current].height();
            current += 1;
            if current >= self.items.len() {
                return height;
            }
        }
    }

    fn run(&mut self, start_item: usize, start_unit: usize) {
        let bottom = self.settings.content_bottom();
        self.open_page();
        for index in start_item..self.items.len() {
            let item = &self.items[index];
            let laid = &self.laid[index];
            let first_unit = if index == start_item { start_unit } else { 0 };
            let is_break = matches!(item.content, Content::Break { .. });
            if first_unit == 0 && !self.empty {
                let level = item.heading_level();
                let top = matches!(&item.content, Content::Text(text) if text.top);
                if top && level > 0 && self.settings.new_page_before.contains(&level) {
                    self.open_page();
                } else if level > 0 {
                    let needed = self.prev_after + item.before + self.keep_height(index);
                    if self.y + needed > bottom + EPSILON {
                        self.open_page();
                    }
                }
            }
            let headers = laid.units.iter().take_while(|unit| unit.header).count();
            for unit_index in first_unit..laid.units.len() {
                let unit = &laid.units[unit_index];
                let mut y = if unit_index == first_unit {
                    let gap = if self.empty || first_unit > 0 {
                        0.0
                    } else {
                        self.prev_after + item.before
                    };
                    self.y + gap
                } else {
                    let previous = &laid.units[unit_index - 1];
                    self.y + unit.top - (previous.top + previous.height)
                };
                let fresh = self.empty;
                if !fresh && y + unit.height > bottom + EPSILON {
                    self.open_page();
                    y = self.y;
                }
                if self.empty && unit_index >= headers && unit_index > 0 && headers > 0 {
                    // the table goes on: its header rows first
                    for header in 0..headers {
                        let at = self.y;
                        self.place(index, header, at, true);
                    }
                    y = self.y;
                }
                if !self.place(index, unit_index, y, false) {
                    return;
                }
            }
            self.prev_after = item.after;
            if is_break && index > 0 {
                self.open_page();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fonts::repository_fonts;
    use crate::model::Settings;

    pub fn paragraph(pos: u32, text: &str) -> Item {
        Item {
            content: Content::Text(Text {
                pos,
                text: text.into(),
                top: true,
                ..Default::default()
            }),
            indent: 0.0,
            before: 0.0,
            after: 8.0,
            marker: None,
            bars: vec![],
            bars_continue: false,
        }
    }

    pub fn heading(pos: u32, level: u8, text: &str) -> Item {
        Item {
            content: Content::Text(Text {
                pos,
                text: text.into(),
                style: format!("h{level}"),
                level,
                top: true,
                ..Default::default()
            }),
            indent: 0.0,
            before: 16.0,
            after: 5.0,
            marker: None,
            bars: vec![],
            bars_continue: false,
        }
    }

    /// a document of paragraphs, with the positions ProseMirror gives them
    pub fn document(texts: &[&str]) -> Vec<Item> {
        let mut pos = 0;
        texts
            .iter()
            .map(|text| {
                let item = paragraph(pos + 1, text);
                pos += text.encode_utf16().count() as u32 + 2;
                item
            })
            .collect()
    }

    fn engine(items: Vec<Item>) -> Engine {
        let mut engine = Engine::new(repository_fonts());
        engine.set_items(items);
        engine
    }

    const LONG: &str = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.";

    #[test]
    fn fills_pages_and_breaks_between_lines() {
        let engine = engine(document(&[LONG; 40]));
        assert!(engine.pages.len() >= 3, "{}", engine.pages.len());
        let bottom = engine.settings.content_bottom();
        for page in &engine.pages {
            assert!(page.bottom <= bottom + EPSILON);
            let first = engine.frags[page.start];
            assert!((first.y - engine.settings.content_top()).abs() < 0.01);
        }
        // a page breaks inside a paragraph, not only between them
        assert!(engine
            .pages
            .iter()
            .skip(1)
            .any(|page| page.first.unwrap().1 > 0));
    }

    #[test]
    fn page_breaks_start_new_pages() {
        let mut items = document(&["one", "", "two"]);
        items[1] = Item {
            content: Content::Break { pos: 5 },
            ..paragraph(0, "")
        };
        let engine = engine(items);
        assert_eq!(engine.pages.len(), 2);
        assert_eq!(engine.pages[1].first, Some((2, 0)));
        // a break at the very start makes no empty page
        let mut items = document(&["", "one"]);
        items[0] = Item {
            content: Content::Break { pos: 0 },
            ..paragraph(0, "")
        };
        assert_eq!(super::tests::engine(items).pages.len(), 1);
    }

    #[test]
    fn keeps_headings_with_the_next_block() {
        let settings = Settings::default();
        let room = settings.content_bottom() - settings.content_top();
        let heading_height = crate::style::text_style("h3").line;
        let line = crate::style::text_style("p").line;
        // a first paragraph whose space below leaves `spare` points under a
        // heading at the bottom of the page
        let place = |spare: f32| {
            let mut first = paragraph(1, "x");
            first.after = room - line - 16.0 - heading_height - spare;
            let items = vec![first, heading(4, 3, "Heading"), paragraph(14, LONG)];
            let engine = engine(items);
            (
                engine.page_of_frag(engine.first_frag[1]),
                engine.page_of_frag(engine.first_frag[2]),
            )
        };
        // the heading fits, but not the first line after it: both move
        assert_eq!(place(5.0), (1, 1));
        // room for the heading and a line after it: they stay
        assert_eq!(place(40.0), (0, 0));
    }

    #[test]
    fn starts_chapters_on_new_pages() {
        let mut items = vec![
            heading(0, 1, "One"),
            paragraph(10, "text"),
            heading(20, 1, "Two"),
            paragraph(30, "more"),
        ];
        items[0].before = 0.0;
        let mut engine = Engine::new(repository_fonts());
        engine.set_settings(Settings {
            new_page_before: vec![1],
            ..Settings::default()
        });
        engine.set_items(items);
        assert_eq!(engine.pages.len(), 2);
        assert_eq!(
            engine.chapters.iter().map(|c| c.page).collect::<Vec<_>>(),
            vec![1, 2]
        );
    }

    #[test]
    fn fills_in_headers_and_footers() {
        let mut engine = Engine::new(repository_fonts());
        let mut settings = Settings::default();
        settings.footer.center = "{page} of {pages}".into();
        settings.header.left = "{chapter}".into();
        engine.set_settings(settings);
        let mut items = vec![heading(0, 1, "Intro")];
        items.extend(document(&[LONG; 40]).into_iter().map(|mut item| {
            item.shift(20);
            item
        }));
        engine.set_items(items);
        let pages = engine.pages.len();
        assert_eq!(engine.pages[1].bands[4], format!("2 of {pages}"));
        assert_eq!(engine.pages[1].bands[0], "Intro");
        let ops = engine.page_ops(1, true);
        assert!(ops.iter().any(|op| matches!(
            op,
            Op::Glyphs {
                role: Role::Band,
                ..
            }
        )));
    }

    #[test]
    fn repaginates_only_until_the_pages_settle() {
        let items = document(&[LONG; 200]);
        let mut engine = engine(items.clone());
        let pages = engine.pages.clone();
        assert!(pages.len() > 10);
        // type a letter into a paragraph on page 3
        let index = 30;
        let mut changed = items[index].clone();
        if let Content::Text(text) = &mut changed.content {
            text.text.insert(0, 'x');
        }
        engine.update(index, 1, vec![changed.clone()], 1);
        let settled = engine.stats.settled_at.expect("settles");
        assert!(
            settled <= engine.stats.paginated_from + 2,
            "{:?}",
            engine.stats
        );
        assert_eq!(engine.pages.len(), pages.len());
        // the result is what a full pagination gives
        let mut full_items = items.clone();
        full_items[index] = changed;
        for item in &mut full_items[index + 1..] {
            item.shift(1);
        }
        let full = super::tests::engine(full_items);
        assert_eq!(engine.frags, full.frags);
        assert_eq!(
            engine
                .pages
                .iter()
                .map(|page| (page.start, page.end, page.first))
                .collect::<Vec<_>>(),
            full.pages
                .iter()
                .map(|page| (page.start, page.end, page.first))
                .collect::<Vec<_>>()
        );
        // pages after the change keep their versions, so they aren't
        // painted again
        let last = pages.len() - 1;
        assert_eq!(engine.pages[last].version, pages[last].version);
        assert_eq!(engine.items[index + 1].from(), items[index + 1].from() + 1);
    }

    #[test]
    fn inserting_and_deleting_paragraphs_matches_a_full_pagination() {
        let items = document(&[LONG; 60]);
        let mut engine = engine(items.clone());
        // split a paragraph into two
        engine.update(
            10,
            1,
            vec![
                paragraph(items[10].from(), "short"),
                paragraph(items[10].from() + 7, LONG),
            ],
            7,
        );
        let mut expected = items.clone();
        let tail: Vec<Item> = expected
            .drain(11..)
            .map(|mut item| {
                item.shift(7);
                item
            })
            .collect();
        expected.truncate(10);
        expected.push(paragraph(items[10].from(), "short"));
        expected.push(paragraph(items[10].from() + 7, LONG));
        expected.extend(tail);
        let full = super::tests::engine(expected.clone());
        assert_eq!(engine.frags, full.frags);
        // and delete it again
        engine.update(10, 1, vec![], -7);
        expected.remove(10);
        for item in &mut expected[10..] {
            item.shift(-7);
        }
        let full = super::tests::engine(expected);
        assert_eq!(engine.frags, full.frags);
        assert_eq!(engine.pages.len(), full.pages.len());
    }

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

    #[test]
    fn selects_across_pages() {
        let items = document(&[LONG; 40]);
        let engine = engine(items.clone());
        let rects = engine.selection(items[0].from(), items[39].to());
        let pages: std::collections::BTreeSet<usize> = rects.iter().map(|rect| rect.0).collect();
        assert_eq!(pages.len(), engine.pages.len());
    }

    #[test]
    fn repeats_table_headers() {
        use crate::model::{Cell, Row};
        let cell = |pos: u32, text: &str, header: bool| Cell {
            paragraphs: vec![Text {
                pos,
                text: text.into(),
                ..Default::default()
            }],
            header,
            align: None,
        };
        let mut rows = vec![Row {
            cells: vec![cell(3, "Name", true), cell(10, "Value", true)],
            header: true,
        }];
        for index in 0..80u32 {
            let pos = 20 + index * 20;
            rows.push(Row {
                cells: vec![cell(pos, "row", false), cell(pos + 8, "value", false)],
                header: false,
            });
        }
        let table = Item {
            content: Content::Table {
                pos: 0,
                end: 2000,
                rows,
                widths: vec![],
            },
            ..paragraph(0, "")
        };
        let engine = engine(vec![table]);
        assert!(engine.pages.len() >= 2);
        let second = engine.pages[1].start;
        assert!(engine.frags[second].repeat);
        assert_eq!(engine.frags[second].unit, 0);
        // a click into a cell lands in its text
        let (page, x, y, h) = engine.caret(10 + 2, false).unwrap();
        assert_eq!(page, 0);
        assert_eq!(engine.hit(page, x + 0.1, y + h / 2.0), Some(Hit::Text(12)));
        // the grid: two columns across the text, every row placed, the
        // header row again on the second page
        let grid = engine.table_grid(0).unwrap();
        assert_eq!(grid.columns.len(), 3);
        let left = engine.settings.margins.left;
        assert!((grid.columns[0] - left).abs() < 0.01);
        assert!((grid.columns[2] - left - engine.settings.content_width()).abs() < 0.01);
        assert_eq!(grid.rows.iter().filter(|row| !row.repeat).count(), 81);
        let repeated = grid.rows.iter().find(|row| row.repeat).unwrap();
        assert_eq!((repeated.page, repeated.row), (1, 0));
        assert!(engine.table_grid(5).is_none());
        // the table's box on each page
        let boxes = engine.boxes(0, 2000);
        assert_eq!(boxes.len(), engine.pages.len());
        assert!((boxes[0].2 - engine.settings.content_top()).abs() < 0.01);
    }

    #[test]
    fn shows_the_alt_text_of_an_image_not_loaded() {
        let image = |width: f32| Item {
            content: Content::Image {
                pos: 0,
                src: "a.png".into(),
                width,
                height: width,
                alt: "a cat".into(),
            },
            ..paragraph(0, "")
        };
        let mut waiting = engine(vec![image(0.0)]);
        let ops = waiting.page_ops(0, false);
        let hint = ops
            .iter()
            .find_map(|op| match op {
                Op::Glyphs {
                    role: Role::Hint,
                    run,
                    text,
                } => Some(text[run.glyphs[0].start as usize..].to_string()),
                _ => None,
            })
            .unwrap();
        assert_eq!(hint, "a cat");
        // the alt text isn't text of the document: the caret is before or
        // after the image
        assert!(waiting.laid[0].texts.is_empty());
        let mut loaded = engine(vec![image(50.0)]);
        assert!(loaded
            .page_ops(0, false)
            .iter()
            .all(|op| !matches!(op, Op::Glyphs { .. })));
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

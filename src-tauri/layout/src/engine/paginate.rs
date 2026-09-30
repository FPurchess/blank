//! Pagination: places the units of the items on pages, and starts again
//! from a change until the pages settle.

use super::{Engine, Frag, Page};
use crate::bands::Chapter;
use crate::items::Laid;
use crate::model::{Content, Item, Settings};

impl Engine {
    pub(super) fn page_of_frag(&self, frag: usize) -> usize {
        self.pages
            .partition_point(|page| page.end <= frag)
            .min(self.pages.len().saturating_sub(1))
    }

    /// paginates from the start of page `from`. With `tail`, the items from
    /// `tail.start` on are the ones that were there before, moved by
    /// `tail.delta`: once a page starts with one of them where an old page
    /// did, the rest is as before.
    pub(super) fn paginate_from(&mut self, from: usize, tail: Option<Tail>) {
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
}

#[derive(Clone, Copy)]
pub(super) struct Tail {
    pub(super) start: usize,
    pub(super) delta: i64,
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
pub(super) const EPSILON: f32 = 0.01;

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
            // the header rows of a table, repeated on each page it goes on
            let headers: Vec<usize> = (0..laid.units.len())
                .filter(|&unit| laid.units[unit].header)
                .collect();
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
                // a unit that stays with the next, e.g. a caption with the
                // header rows and the first row, goes on with them
                let mut needed = unit.height;
                let mut next = unit_index;
                while laid.units[next].keep_next && next + 1 < laid.units.len() {
                    next += 1;
                    needed = laid.units[next].top + laid.units[next].height - unit.top;
                }
                if !fresh && y + needed > bottom + EPSILON {
                    self.open_page();
                    y = self.y;
                }
                let last_header = headers.last().copied();
                if self.empty && unit_index > 0 && last_header.is_some_and(|last| unit_index > last)
                {
                    // the table goes on: its header rows first
                    for &header in &headers {
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
    use crate::engine::test_support::{self, *};
    use crate::engine::Op;
    use crate::fonts::repository_fonts;
    use crate::items::Role;

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
        assert_eq!(test_support::engine(items).pages.len(), 1);
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
        let full = test_support::engine(full_items);
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
        let full = test_support::engine(expected.clone());
        assert_eq!(engine.frags, full.frags);
        // and delete it again
        engine.update(10, 1, vec![], -7);
        expected.remove(10);
        for item in &mut expected[10..] {
            item.shift(-7);
        }
        let full = test_support::engine(expected);
        assert_eq!(engine.frags, full.frags);
        assert_eq!(engine.pages.len(), full.pages.len());
    }
}

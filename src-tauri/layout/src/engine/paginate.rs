//! Pagination: places the units of the items on pages, and starts again
//! from a change until the pages settle.

use super::{Changes, Engine, Frag, Page};
use crate::bands::Chapter;
use crate::items::Laid;
use crate::model::{Content, Item, Settings};

impl Engine {
    pub(super) fn page_of_frag(&self, frag: usize) -> usize {
        self.pages
            .partition_point(|page| page.end <= frag)
            .min(self.pages.len().saturating_sub(1))
    }

    /// paginates from the start of page `from`. With a `change`, the items
    /// it maps are the ones that were there before, and those from
    /// `change.tail.start` on are moved by `change.tail.delta`: once a page
    /// starts with one of them where an old page did, the rest is as
    /// before. Without one, every item was laid out again, and every page
    /// gets new versions.
    ///
    /// Only what changes is worked on: the pages before `from` stay as they
    /// are, the old pages after the change move over as they are, and band
    /// texts are only written again where a page's number, the number of
    /// pages or the chapters changed.
    pub(super) fn paginate_from(&mut self, from: usize, change: Option<Change>) -> Changes {
        let tail = change.as_ref().and_then(|change| change.tail);
        let mut old_pages = std::mem::take(&mut self.pages);
        let mut old_frags = std::mem::take(&mut self.frags);
        let old_first_frag = std::mem::take(&mut self.first_frag);
        let old_chapters = std::mem::take(&mut self.chapters);
        let from = from.min(old_pages.len());
        let mut from = if change.is_none() { 0 } else { from };
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
        // what each page had before, for the changes
        let old_versions: Vec<(u32, u32)> = old_pages
            .iter()
            .map(|page| (page.body_version, page.band_version))
            .collect();
        let old_count = old_pages.len();
        // the pages and fragments before `from` stay; the old ones from there
        // on are what the new ones are compared with and taken from
        let tail_pages = old_pages.split_off(from);
        let tail_frags = old_frags.split_off(keep_frags);
        let mut paginator = Paginator {
            items: &self.items,
            laid: &self.laid,
            settings: &self.settings,
            frags: old_frags,
            pages: old_pages,
            y: 0.0,
            empty: true,
            prev_after: 0.0,
            old: tail.map(|tail| (tail, &tail_pages[..])),
            settled: None,
        };
        paginator.run(start_item, start_unit);
        let settled = paginator.settled;
        let Paginator {
            mut frags,
            mut pages,
            ..
        } = paginator;
        // the pages paginated again: whether each has the fragments of the
        // old page at its index, of items that weren't laid out again, and
        // what that page had
        let repaginated: Vec<Option<Before>> = (from..pages.len())
            .map(|index| {
                let change = change.as_ref()?;
                let old = tail_pages.get(index - from)?;
                let page = &pages[index];
                let new = &frags[page.start..page.end];
                let before = tail_frags.get(old.start - keep_frags..old.end - keep_frags)?;
                let same = new.len() == before.len()
                    && new.iter().zip(before).all(|(a, b)| {
                        change.map.old_of(a.item) == Some(b.item)
                            && (a.unit, a.y, a.repeat) == (b.unit, b.y, b.repeat)
                    });
                Some(Before {
                    same,
                    version: old.version,
                    body_version: old.body_version,
                    band_version: old.band_version,
                    bands: old.bands.clone(),
                })
            })
            .collect();
        // the rest is as before: the old pages, moved
        let mut copied_from = usize::MAX;
        let mut copied_frags = frags.len();
        let mut frag_offset = 0i64;
        let mut old_copied_start = usize::MAX;
        if let (Some(old_index), Some(tail)) = (settled, tail) {
            copied_from = pages.len();
            copied_frags = frags.len();
            let mut tail_pages = tail_pages;
            let start = tail_pages[old_index].start;
            old_copied_start = start;
            frag_offset = signed(frags.len()) - signed(start);
            for mut page in tail_pages.drain(old_index..) {
                page.start = moved(page.start, frag_offset);
                page.end = moved(page.end, frag_offset);
                page.first = page
                    .first
                    .map(|(item, unit)| (moved(item, tail.delta), unit));
                pages.push(page);
            }
            let copied = &tail_frags[start - keep_frags..];
            if tail.delta == 0 {
                frags.extend_from_slice(copied);
            } else {
                frags.extend(copied.iter().map(|frag| Frag {
                    item: moved(frag.item, tail.delta),
                    ..*frag
                }));
            }
        }
        self.stats.paginated_from = from;
        self.stats.settled_at = settled.map(|_| copied_from);
        // the first fragment of each item: as before for the items before
        // the ones paginated again, found for those, and moved for the ones
        // copied
        let mut first_frag = old_first_frag[..start_item.min(old_first_frag.len())].to_vec();
        first_frag.resize(self.items.len(), usize::MAX);
        if start_unit > 0 {
            if let Some(&first) = old_first_frag.get(start_item) {
                first_frag[start_item] = first;
            }
        }
        for (index, frag) in frags.iter().enumerate().take(copied_frags).skip(keep_frags) {
            if !frag.repeat && first_frag[frag.item] == usize::MAX {
                first_frag[frag.item] = index;
            }
        }
        if let (Some(_), Some(tail)) = (settled, tail) {
            for (item, first) in first_frag.iter_mut().enumerate().skip(tail.start) {
                if *first != usize::MAX {
                    continue;
                }
                let old = old_first_frag
                    .get(moved(item, tail.delta.saturating_neg()))
                    .copied()
                    .filter(|old| *old != usize::MAX && *old >= old_copied_start);
                if let Some(old) = old {
                    *first = moved(old, frag_offset);
                }
            }
        }
        self.frags = frags;
        self.pages = pages;
        self.first_frag = first_frag;
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
        // the band texts: every page's where the number of pages or the
        // chapters changed, else only the pages paginated again have new ones
        let count = self.pages.len();
        let all_bands = change.is_none() || count != old_count || self.chapters != old_chapters;
        let repaginated_end = from + repaginated.len();
        let mut changes = Changes::default();
        let mut body_changed: Vec<usize> = vec![];
        let mut bands_changed: Vec<usize> = vec![];
        for index in 0..count {
            let paginated_again = (from..repaginated_end).contains(&index);
            let bands = if all_bands || paginated_again {
                Some(self.band_texts(index))
            } else {
                None
            };
            let mut new_version = || {
                self.next_version += 1;
                self.next_version
            };
            let page = &self.pages[index];
            let (body, band, version) = if change.is_none() {
                (None, None, None)
            } else if paginated_again {
                // against the old page at the same index
                match &repaginated[index - from] {
                    Some(before) => {
                        let body = before.same.then_some(before.body_version);
                        let band =
                            (bands.as_ref() == Some(&before.bands)).then_some(before.band_version);
                        let version = (body.is_some() && band.is_some()).then_some(before.version);
                        (body, band, version)
                    }
                    None => (None, None, None),
                }
            } else {
                // a page as it was, moved
                let band = bands
                    .as_ref()
                    .is_none_or(|bands| *bands == page.bands)
                    .then_some(page.band_version);
                let version = band.map(|_| page.version);
                (Some(page.body_version), band, version)
            };
            let body_version = body.unwrap_or_else(&mut new_version);
            let band_version = band.unwrap_or_else(&mut new_version);
            let version = version.unwrap_or_else(&mut new_version);
            let before = old_versions.get(index);
            if before.map(|old| old.0) != Some(body_version) {
                body_changed.push(index);
            }
            if before.map(|old| old.1) != Some(band_version) {
                bands_changed.push(index);
            }
            let page = &mut self.pages[index];
            page.version = version;
            page.body_version = body_version;
            page.band_version = band_version;
            if let Some(bands) = bands {
                page.bands = bands;
            }
        }
        let range = |indices: &[usize]| match (indices.first(), indices.last()) {
            (Some(&first), Some(&last)) => first..last + 1,
            _ => 0..0,
        };
        changes.body = range(&body_changed);
        changes.bands = range(&bands_changed);
        changes
    }
}

/// what the old page at the index of a page paginated again had
struct Before {
    /// the same fragments, of items that weren't laid out again
    same: bool,
    version: u32,
    body_version: u32,
    band_version: u32,
    bands: [String; 6],
}

/// an index moved by `by`, never below 0
fn moved(index: usize, by: i64) -> usize {
    usize::try_from(signed(index).saturating_add(by)).unwrap_or(0)
}

pub(super) fn signed(index: usize) -> i64 {
    i64::try_from(index).unwrap_or(i64::MAX)
}

/// what an update changed: which items are the ones before it, where the
/// unchanged tail starts
pub(super) struct Change {
    pub(super) tail: Option<Tail>,
    pub(super) map: ItemMap,
}

/// which items are the ones that were there before an update: runs of
/// `(new start, new end, old start)`, in order
pub(super) struct ItemMap(pub(super) Vec<(usize, usize, usize)>);

impl ItemMap {
    /// the old index of an item, if it was there before
    pub(super) fn old_of(&self, new: usize) -> Option<usize> {
        self.0
            .iter()
            .find(|(start, end, _)| (*start..*end).contains(&new))
            .map(|(start, _, old)| old + (new - start))
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
    /// the old pages from where pagination started, see `Tail`
    old: Option<(Tail, &'a [Page])>,
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
            body_version: 0,
            band_version: 0,
            bands: Default::default(),
        });
        self.y = self.settings.content_top();
        self.empty = true;
    }

    /// places a unit; false once the pages settled
    fn place(&mut self, item: usize, unit: usize, y: f32, repeat: bool) -> bool {
        let height = self.laid[item].units[unit].height;
        // run opens the first page before it places anything
        let Some(page) = self.pages.last_mut() else {
            return false;
        };
        if !repeat && page.first.is_none() {
            page.first = Some((item, unit));
            if let Some((tail, old_pages)) = self.old {
                if item >= tail.start {
                    let old = (moved(item, tail.delta.saturating_neg()), unit);
                    let index = old_pages
                        .partition_point(|page| page.first.is_some_and(|first| first < old));
                    if old_pages
                        .get(index)
                        .is_some_and(|page| page.first == Some(old))
                    {
                        // the rest is as before. That holds because a page
                        // starts the same way wherever it opens (at the top,
                        // empty, with no space above), and what is placed on
                        // it from here only looks ahead: at the units an item
                        // keeps together and at what follows a heading, all
                        // of them old items moved by `delta`. The bands, the
                        // chapters and the page count are worked out again
                        // afterwards. So drop this page, and the old
                        // ones follow from here
                        if let Some(page) = self.pages.pop() {
                            self.frags.truncate(page.start);
                        }
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
        let end = self.frags.len();
        if let Some(page) = self.pages.last_mut() {
            page.bottom = page.bottom.max(self.y);
            page.end = end;
        }
        true
    }

    /// the height a run of headings from `index` needs with the first unit
    /// of what follows them, and the units that stay with that
    fn keep_height(&self, index: usize) -> f32 {
        let mut height = 0.0;
        let mut current = index;
        loop {
            if current > index {
                height += self.items[current - 1].after + self.items[current].before;
            }
            if self.items[current].heading_level() == 0 {
                // its first unit, with the units that stay with it, e.g. a
                // table's caption, its header rows and its first row
                let units = &self.laid[current].units;
                let mut last = 0;
                while units[last].keep_next && last + 1 < units.len() {
                    last += 1;
                }
                height += units[last].top + units[last].height - units[0].top;
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
                    // no space above a page break, which takes no room
                    let gap = if self.empty || first_unit > 0 || is_break {
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
                // a page break never goes to a new page itself: the page it
                // ends is the one it is on
                if !fresh && !is_break && y + needed > bottom + EPSILON {
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
                let was_empty = self.empty;
                if !self.place(index, unit_index, y, false) {
                    return;
                }
                // a page break takes no room: a page that holds only breaks
                // is still empty, e.g. for a chapter that starts a new page
                if is_break {
                    self.empty = was_empty;
                }
            }
            self.prev_after = if is_break { 0.0 } else { item.after };
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

    fn page_break(pos: u32) -> Item {
        Item {
            content: Content::Break { pos },
            ..paragraph(0, "")
        }
    }

    #[test]
    fn break_near_bottom_has_no_blank_page() {
        // a paragraph whose space below reaches past the bottom of the page,
        // then a page break: the break stays on the first page
        let settings = Settings::default();
        let room = settings.content_bottom() - settings.content_top();
        let line = crate::style::text_style("p").line;
        let mut first = paragraph(1, "x");
        first.after = room - line + 10.0;
        let engine = engine(vec![first, page_break(4), paragraph(6, "next")]);
        assert_eq!(engine.pages.len(), 2);
        assert_eq!(engine.page_of_frag(engine.first_frag[1]), 0);
        assert_eq!(engine.page_of_frag(engine.first_frag[2]), 1);
    }

    #[test]
    fn page_break_at_end() {
        // as in Word, where the break is "page break before" on an empty
        // paragraph after it: the document ends with an empty page
        let engine = engine(vec![paragraph(1, "text"), page_break(7)]);
        assert_eq!(engine.pages.len(), 2);
        assert_eq!(engine.pages[1].start, engine.pages[1].end);
        // and two breaks in a row leave an empty page between them
        let engine = test_support::engine(vec![
            paragraph(1, "text"),
            page_break(7),
            page_break(8),
            paragraph(10, "after"),
        ]);
        assert_eq!(engine.pages.len(), 3);
        assert_eq!(engine.page_of_frag(engine.first_frag[3]), 2);
    }

    #[test]
    fn heading_stays_with_captioned_table() {
        use crate::model::Row;
        let settings = Settings::default();
        let room = settings.content_bottom() - settings.content_top();
        let heading_height = crate::style::text_style("h3").line;
        let line = crate::style::text_style("p").line;
        // under the heading, room for the table's caption, but not for its
        // header row and first row as well
        let spare = 30.0;
        let mut first = paragraph(1, "x");
        first.after = room - line - 16.0 - heading_height - spare;
        let rows: Vec<Row> = (0..3)
            .map(|index| Row {
                cells: vec![cell(40 + index * 10, "row")],
                header: index == 0,
            })
            .collect();
        let mut table = table_item(rows, Some("The caption"));
        if let Content::Table { pos, .. } = &mut table.content {
            *pos = 30;
        }
        let engine = engine(vec![first, heading(4, 3, "Heading"), table]);
        let caption = engine.laid[2].units[0].height;
        assert!(caption < spare, "the caption alone fits: {caption}");
        let heading_page = engine.page_of_frag(engine.first_frag[1]);
        let table_page = engine.page_of_frag(engine.first_frag[2]);
        assert_eq!((heading_page, table_page), (1, 1));
    }

    #[test]
    fn page_break_before_a_chapter_at_the_start() {
        // a break first, then a chapter that starts a new page: one page
        let mut engine = Engine::new(repository_fonts());
        engine.set_settings(Settings {
            new_page_before: vec![1],
            ..Default::default()
        });
        let mut chapter = heading(2, 1, "One");
        chapter.before = 0.0;
        engine.set_items(vec![page_break(0), chapter]);
        assert_eq!(engine.pages.len(), 1);
    }
}

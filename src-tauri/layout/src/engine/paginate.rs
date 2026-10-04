//! Pagination: places the units of the items on pages, and starts again
//! from a change until the pages settle.

use std::ops::Range;

use super::{Changes, Engine, Frag, Page};
use crate::bands::{uses_field, Chapter};
use crate::items::Laid;
use crate::model::{Content, Item, Settings};

impl Engine {
    /// the first item of the band of a grid `item` stands in, if it does
    fn band_start(&self, item: usize) -> Option<usize> {
        let band = self.items.get(item)?.band()?;
        let mut start = item;
        while start > 0 && self.items[start - 1].band() == Some(band) {
            start -= 1;
        }
        Some(start)
    }

    pub(crate) fn page_of_frag(&self, frag: usize) -> usize {
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
        let old_first_frag = std::mem::take(&mut self.first_frag);
        let old_chapters = std::mem::take(&mut self.chapters);
        let (from, start_item, start_unit) =
            self.restart_at(from, change.is_some(), &old_first_frag);
        let keep_frags = self.pages.get(from).map(|page| page.start).unwrap_or(0);
        // what each page had before, for the changes
        let old_versions: Vec<(u32, u32)> = self
            .pages
            .iter()
            .map(|page| (page.body_version, page.band_version))
            .collect();
        let old_count = self.pages.len();
        // the pages from `from` on are paginated again into new ones, which
        // replace the old ones up to where the pages settle; the old ones
        // after that stay where they are
        let mut paginator = Paginator {
            items: &self.items,
            laid: &self.laid,
            settings: &self.settings,
            frag_base: keep_frags,
            frags: vec![],
            pages: vec![],
            y: 0.0,
            empty: true,
            prev_after: 0.0,
            old: tail.map(|tail| (tail, &self.pages[from..])),
            settled: None,
            band: None,
        };
        paginator.run(start_item, start_unit);
        let settled = paginator.settled;
        // the old page the new ones settled on, which only a change with a
        // tail has
        let settled_tail = settled.zip(tail);
        let Paginator {
            frags: new_frags,
            pages: new_pages,
            ..
        } = paginator;
        let repaginated =
            self.before_each(change.as_ref(), from, keep_frags, &new_pages, &new_frags);
        let copied_from = from + new_pages.len();
        let copied_frags = keep_frags + new_frags.len();
        let (old_copied_start, frag_offset) =
            self.splice_pages(from, keep_frags, new_pages, new_frags, settled_tail);
        self.stats.paginated_from = from;
        self.stats.settled_at = settled.map(|_| {
            if settled_tail.is_some() {
                copied_from
            } else {
                usize::MAX
            }
        });
        self.first_frag = self.first_frags(
            &old_first_frag,
            (start_item, start_unit),
            keep_frags..copied_frags,
            settled_tail.map(|(_, tail)| (tail, old_copied_start, frag_offset)),
        );
        self.chapters = self.find_chapters();
        // the pages that show an entry of a table of contents whose page
        // number changed have a new body, even where their fragments are as
        // before
        let mut renumbered = vec![false; self.pages.len()];
        let old_of = |item: usize| change.as_ref().and_then(|change| change.map.old_of(item));
        for (item, units) in self.set_toc_numbers(old_of) {
            for frag in self.frags_of(item) {
                if units.binary_search(&self.frags[frag].unit).is_ok() {
                    renumbered[self.page_of_frag(frag)] = true;
                }
            }
        }
        // the band texts: every page's where the number of pages or the
        // chapters changed, else only the pages paginated again have new
        // ones. A moved page has another number, so a new page count redoes
        // all; new chapters only where a slot shows them
        let all_bands = change.is_none()
            || self.pages.len() != old_count
            || (self.chapters != old_chapters && uses_field(&self.settings, "chapter"));
        self.assign_versions(
            change.is_some(),
            from,
            &repaginated,
            &renumbered,
            all_bands,
            &old_versions,
        )
    }

    /// the page pagination restarts on, at or before `from`, and the item
    /// and unit it starts with: the start of the document without a change.
    /// A band of a grid is placed from its start, its columns side by side,
    /// so from the page it starts on, which `old_first_frag` tells.
    fn restart_at(
        &self,
        from: usize,
        changed: bool,
        old_first_frag: &[usize],
    ) -> (usize, usize, usize) {
        let from = from.min(self.pages.len());
        let mut from = if changed { from } else { 0 };
        loop {
            while from > 0 && self.pages.get(from).is_none_or(|page| page.first.is_none()) {
                from -= 1;
            }
            let band_page = self
                .pages
                .get(from)
                .and_then(|page| page.first)
                .and_then(|(item, unit)| {
                    let start = self.band_start(item)?;
                    (start != item || unit > 0).then_some(start)
                })
                .and_then(|start| old_first_frag.get(start).copied())
                .filter(|&frag| frag != usize::MAX)
                .map(|frag| self.page_of_frag(frag))
                .filter(|&page| page < from);
            match band_page {
                Some(page) => from = page,
                None => break,
            }
        }
        let (start_item, start_unit) = self
            .pages
            .get(from)
            .and_then(|page| page.first)
            .unwrap_or((0, 0));
        let from = if start_item == 0 && start_unit == 0 {
            0
        } else {
            from
        };
        (from, start_item, start_unit)
    }

    /// for each page paginated again, what the old page at its index had,
    /// and whether it has that page's fragments, of items that weren't
    /// laid out again
    fn before_each(
        &self,
        change: Option<&Change>,
        from: usize,
        keep_frags: usize,
        new_pages: &[Page],
        new_frags: &[Frag],
    ) -> Vec<Option<Before>> {
        new_pages
            .iter()
            .enumerate()
            .map(|(offset, page)| {
                let change = change?;
                let old = self.pages.get(from + offset)?;
                let new = &new_frags[page.start - keep_frags..page.end - keep_frags];
                let before = self.frags.get(old.start..old.end)?;
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
            .collect()
    }

    /// puts the pages paginated again in place of the old ones from `from`:
    /// up to the old page they settled on, whose pages and fragments stay
    /// after them, moved by what the new ones changed, or else all of them.
    /// Returns where the fragments that stay started before, and how far
    /// they moved.
    fn splice_pages(
        &mut self,
        from: usize,
        keep_frags: usize,
        new_pages: Vec<Page>,
        new_frags: Vec<Frag>,
        settled_tail: Option<(usize, Tail)>,
    ) -> (usize, i64) {
        let Some((old_index, tail)) = settled_tail else {
            self.pages.truncate(from);
            self.pages.extend(new_pages);
            self.frags.truncate(keep_frags);
            self.frags.extend(new_frags);
            return (usize::MAX, 0);
        };
        let copied_from = from + new_pages.len();
        let copied_frags = keep_frags + new_frags.len();
        let old_settled = from + old_index;
        let start = self.pages[old_settled].start;
        let frag_offset = signed(copied_frags) - signed(start);
        self.pages.splice(from..old_settled, new_pages);
        self.frags.splice(keep_frags..start, new_frags);
        for page in &mut self.pages[copied_from..] {
            page.start = moved(page.start, frag_offset);
            page.end = moved(page.end, frag_offset);
            page.first = page
                .first
                .map(|(item, unit)| (moved(item, tail.delta), unit));
        }
        if tail.delta != 0 {
            for frag in &mut self.frags[copied_frags..] {
                frag.item = moved(frag.item, tail.delta);
            }
            self.stats.frags_rewritten = self.frags.len() - copied_frags;
        }
        (start, frag_offset)
    }

    /// the first fragment of each item: as before for the items before the
    /// ones paginated again (`start`, an item and its unit), found among
    /// the fragments paginated again (`fresh`), and moved for the ones
    /// copied, given where they started and how far they moved
    fn first_frags(
        &self,
        old_first_frag: &[usize],
        (start_item, start_unit): (usize, usize),
        fresh: Range<usize>,
        copied: Option<(Tail, usize, i64)>,
    ) -> Vec<usize> {
        let mut first_frag = old_first_frag[..start_item.min(old_first_frag.len())].to_vec();
        first_frag.resize(self.items.len(), usize::MAX);
        if start_unit > 0 {
            if let Some(&first) = old_first_frag.get(start_item) {
                first_frag[start_item] = first;
            }
        }
        for (index, frag) in self
            .frags
            .iter()
            .enumerate()
            .take(fresh.end)
            .skip(fresh.start)
        {
            if !frag.repeat && first_frag[frag.item] == usize::MAX {
                first_frag[frag.item] = index;
            }
        }
        if let Some((tail, old_copied_start, frag_offset)) = copied {
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
        first_frag
    }

    /// the headings 1 of the document and the pages they start on
    fn find_chapters(&self) -> Vec<Chapter> {
        self.items
            .iter()
            .enumerate()
            .filter_map(|(index, item)| match &item.content {
                Content::Text(text) if text.top && text.level == 1 => Some(Chapter {
                    page: self.page_of_frag(self.first_frag[index]) + 1,
                    text: text.text.clone(),
                }),
                _ => None,
            })
            .collect()
    }

    /// gives every page its versions and band texts: the pages paginated
    /// again (`repaginated`, from `from`) keep the old page's where they show
    /// the same, the moved ones keep theirs, and the rest get new ones, as
    /// all do without a change, and those showing a page number of a table
    /// of contents that changed (`renumbered`) get a new body. Band texts
    /// are written again on the pages paginated again, or on all
    /// (`all_bands`). Returns the pages whose bodies and bands changed.
    fn assign_versions(
        &mut self,
        changed: bool,
        from: usize,
        repaginated: &[Option<Before>],
        renumbered: &[bool],
        all_bands: bool,
        old_versions: &[(u32, u32)],
    ) -> Changes {
        let repaginated_end = from + repaginated.len();
        let mut changes = Changes::default();
        let mut body_changed: Vec<usize> = vec![];
        let mut bands_changed: Vec<usize> = vec![];
        for index in 0..self.pages.len() {
            let paginated_again = (from..repaginated_end).contains(&index);
            let bands = if all_bands || paginated_again {
                self.stats.bands_expanded += 1;
                Some(self.band_texts(index))
            } else {
                None
            };
            let mut new_version = || {
                self.next_version += 1;
                self.next_version
            };
            let page = &self.pages[index];
            let (body, band, version) = if !changed {
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
            let (body, version) = if renumbered.get(index) == Some(&true) {
                (None, None)
            } else {
                (body, version)
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
    /// the index the first of `frags` gets in `Engine::frags`: the pages it
    /// makes hold those indices
    frag_base: usize,
    frags: Vec<Frag>,
    pages: Vec<Page>,
    y: f32,
    empty: bool,
    prev_after: f32,
    /// the old pages from where pagination started, see `Tail`
    old: Option<(Tail, &'a [Page])>,
    settled: Option<usize>,
    /// the band of a grid being placed, see `band`
    band: Option<Band>,
}

/// the columns of a band of a grid while they are placed: each from where
/// the band starts, into fragments of its own, since a page's fragments
/// come in the order of the items
struct Band {
    /// the fragments of each page from the one the band starts on
    pages: Vec<Vec<Frag>>,
    /// which of those the column being placed is on
    page: usize,
}

/// room for rounding when a unit ends right at the bottom
pub(super) const EPSILON: f32 = 0.01;

impl Paginator<'_> {
    /// the index the next fragment gets in `Engine::frags`
    fn next_frag(&self) -> usize {
        self.frag_base + self.frags.len()
    }

    fn open_page(&mut self) {
        if let Some(band) = &mut self.band {
            band.page += 1;
            if band.page == band.pages.len() {
                band.pages.push(vec![]);
            }
            self.y = self.settings.content_top();
            self.empty = true;
            return;
        }
        let next = self.next_frag();
        if let Some(page) = self.pages.last_mut() {
            page.end = next;
        }
        self.pages.push(Page {
            start: next,
            end: next,
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
        let frag = Frag {
            item,
            unit,
            y,
            repeat,
        };
        if let Some(band) = &mut self.band {
            band.pages[band.page].push(frag);
            self.y = y + self.laid[item].units[unit].height;
            self.empty = false;
            return true;
        }
        // run opens the first page before it places anything
        let Some(page) = self.pages.last() else {
            return false;
        };
        if !repeat && page.first.is_none() {
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
                            self.frags.truncate(page.start - self.frag_base);
                        }
                        let next = self.next_frag();
                        if let Some(last) = self.pages.last_mut() {
                            last.end = next;
                        }
                        self.settled = Some(index);
                        return false;
                    }
                }
            }
        }
        self.push(frag);
        true
    }

    /// puts a fragment on the last page
    fn push(&mut self, frag: Frag) {
        self.frags.push(frag);
        self.y = frag.y + self.laid[frag.item].units[frag.unit].height;
        self.empty = false;
        let end = self.next_frag();
        if let Some(page) = self.pages.last_mut() {
            if !frag.repeat && page.first.is_none() {
                page.first = Some((frag.item, frag.unit));
            }
            page.bottom = page.bottom.max(self.y);
            page.end = end;
        }
    }

    /// whether an item starts a page of its own: one that says so, e.g. a
    /// form whose template does, or a heading of a level `new_page_before`
    /// lists
    fn starts_page(&self, item: &Item) -> bool {
        let level = item.heading_level();
        let top = matches!(&item.content, Content::Text(text) if text.top);
        item.page_start || top && level > 0 && self.settings.new_page_before.contains(&level)
    }

    /// the height a run of headings from `index` needs with the first unit
    /// of what follows them, and the units that stay with that
    fn keep_height(&self, index: usize) -> f32 {
        let mut height = 0.0;
        let mut current = index;
        loop {
            if current > index {
                // what starts a page of its own isn't kept with: a page
                // break, or a heading that starts a new page
                let item = &self.items[current];
                // nor what stands in another column of a grid
                let beside = item.beside(&self.items[current - 1]);
                if self.starts_page(item) || beside || matches!(item.content, Content::Break { .. })
                {
                    return height;
                }
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
        self.open_page();
        let mut index = start_item;
        while index < self.items.len() {
            let first_unit = if index == start_item { start_unit } else { 0 };
            if first_unit == 0 && self.items[index].frame.is_some() {
                index = self.frame(index);
                continue;
            }
            if first_unit == 0 && self.items[index].column.is_some() {
                index = self.band(index);
                continue;
            }
            if !self.item(index, first_unit) {
                return;
            }
            index += 1;
        }
    }

    /// places the units of an item from `first_unit`; false once the pages
    /// settled
    fn item(&mut self, index: usize, first_unit: usize) -> bool {
        let bottom = self.settings.content_bottom();
        let item = &self.items[index];
        let laid = &self.laid[index];
        let is_break = matches!(item.content, Content::Break { .. });
        if first_unit == 0 && !self.empty {
            if self.starts_page(item) {
                self.open_page();
            } else if item.heading_level() > 0 {
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
                // no higher than the item says, e.g. below a letter's address
                let lowest = if first_unit == 0 { item.flow_top } else { 0.0 };
                (self.y + gap).max(lowest)
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
            if self.empty && unit_index > 0 && last_header.is_some_and(|last| unit_index > last) {
                // the table goes on: its header rows first
                for &header in &headers {
                    let at = self.y;
                    self.place(index, header, at, true);
                }
                y = self.y;
            }
            let was_empty = self.empty;
            if !self.place(index, unit_index, y, false) {
                return false;
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
        true
    }

    /// places the items of a frame from its first, `start`: one below the
    /// other from its top, on this page, outside the flow, which goes on
    /// where it was. It returns the index of the item after it.
    fn frame(&mut self, start: usize) -> usize {
        let id = self.items[start].frame.as_ref().map(|frame| frame.id);
        let end = (start..self.items.len())
            .find(|&index| self.items[index].frame.as_ref().map(|frame| frame.id) != id)
            .unwrap_or(self.items.len());
        // a frame that starts a new page, as a form can, starts it first
        if self.items[start].page_start && !self.empty {
            self.open_page();
        }
        let flow = (self.y, self.empty, self.prev_after);
        let mut y = self.items[start]
            .frame
            .as_ref()
            .map_or(0.0, |frame| frame.y);
        for index in start..end {
            let (item, laid) = (&self.items[index], &self.laid[index]);
            if index > start {
                y += self.items[index - 1].after + item.before;
            }
            for (unit_index, unit) in laid.units.iter().enumerate() {
                self.push(Frag {
                    item: index,
                    unit: unit_index,
                    y: y + unit.top,
                    repeat: false,
                });
            }
            y += laid.height();
        }
        (self.y, self.empty, self.prev_after) = flow;
        end
    }

    /// places the columns of a band, the items from `start` to `end`, each
    /// from where the band starts into `self.band`. It returns where the
    /// longest ends (its page in the band, y, the space below its last item
    /// and whether its page is empty), and whether each column started on
    /// the band's first page.
    fn columns(&mut self, start: usize, end: usize) -> ((usize, f32, f32, bool), bool) {
        let at = (self.y, self.empty, self.prev_after);
        self.band = Some(Band {
            pages: vec![vec![]],
            page: 0,
        });
        let mut longest = (0, at.0, at.2, at.1);
        let mut together = true;
        let mut index = start;
        while index < end {
            let run_end = (index + 1..end)
                .find(|&next| self.items[next].beside(&self.items[index]))
                .unwrap_or(end);
            (self.y, self.empty, self.prev_after) = at;
            if let Some(band) = &mut self.band {
                band.page = 0;
            }
            for item in index..run_end {
                // a band's fragments never settle the pages
                self.item(item, 0);
            }
            let Some(band) = &self.band else {
                break;
            };
            together &= band.pages[0].iter().any(|frag| frag.item == index);
            if band.page > longest.0 || band.page == longest.0 && self.y > longest.1 {
                longest = (band.page, self.y, self.prev_after, self.empty);
            }
            index = run_end;
        }
        (longest, together)
    }

    /// places a band of a grid from its first item, `start`: its columns
    /// side by side from where it starts, and what follows below the
    /// longest. It returns the index of the item after it.
    fn band(&mut self, start: usize) -> usize {
        let id = self.items[start].band();
        let end = (start..self.items.len())
            .find(|&index| self.items[index].band() != id)
            .unwrap_or(self.items.len());
        // a band that starts a new page starts it before its columns
        if self.items[start].page_start && !self.empty {
            self.open_page();
        }
        let (mut longest, together) = self.columns(start, end);
        // the columns start side by side: when one of them can't start on
        // this page, the band starts on the next
        if !together && !self.empty {
            self.band = None;
            self.open_page();
            longest = self.columns(start, end).0;
        }
        let pages = self.band.take().map(|band| band.pages).unwrap_or_default();
        for (offset, mut frags) in pages.into_iter().enumerate() {
            if offset > 0 {
                self.open_page();
            }
            // in the order of the items: the columns one after the other
            frags.sort_by_key(|frag| frag.item);
            for frag in frags {
                self.push(frag);
            }
        }
        (_, self.y, self.prev_after, self.empty) = longest;
        end
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
        let heading_height = crate::style::text_style(crate::model::TextKind::H3).line;
        let line = crate::style::text_style(crate::model::TextKind::P).line;
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
    fn starts_a_new_page_where_an_item_says_so() {
        let mut items = document(&["one", "two", "three"]);
        items[1].page_start = true;
        let started = engine(items);
        assert_eq!(started.pages.len(), 2);
        assert_eq!(started.pages[1].first, Some((1, 0)));
        // not at the top of the first page
        let mut first = document(&["one", "two"]);
        first[0].page_start = true;
        assert_eq!(engine(first).pages.len(), 1);
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
        let line = crate::style::text_style(crate::model::TextKind::P).line;
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
        let heading_height = crate::style::text_style(crate::model::TextKind::H3).line;
        let line = crate::style::text_style(crate::model::TextKind::P).line;
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

    #[test]
    fn keeps_a_heading_with_what_follows_only_up_to_a_new_page() {
        // a heading, then a chapter that starts a new page: the heading
        // isn't kept with the chapter, which would leave it alone on a page
        // between the two
        let settings = Settings {
            new_page_before: vec![1],
            ..Default::default()
        };
        let room = settings.content_bottom() - settings.content_top();
        let mut first = paragraph(1, "x");
        first.after = room - 16.0 - 60.0;
        let mut engine = Engine::new(repository_fonts());
        engine.set_settings(settings);
        engine.set_items(vec![
            first,
            heading(4, 2, "Two"),
            heading(10, 1, "One"),
            paragraph(16, "text"),
        ]);
        let pages: Vec<usize> = (0..4)
            .map(|item| engine.page_of_frag(engine.first_frag[item]))
            .collect();
        assert_eq!(pages, [0, 0, 1, 1]);
        assert_eq!(engine.pages.len(), 2);
    }
}

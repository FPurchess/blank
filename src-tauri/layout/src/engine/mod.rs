//! The engine: keeps the laid out items of a document, paginates them, and
//! answers where positions are and what a page shows.

#[cfg(test)]
mod boundary_tests;
mod display;
#[cfg(test)]
mod incremental_tests;
mod navigate;
mod paginate;
mod select;
#[cfg(test)]
pub(crate) mod test_support;
#[cfg(feature = "test-hooks")]
mod text_layer;

pub use display::{Op, Part};
pub use navigate::Hit;
pub use select::{GridRow, TableGrid};
#[cfg(feature = "test-hooks")]
pub use text_layer::Word;

use crate::bands::{bands_on, chapter_on, expand_slots, Chapter, Values};
use crate::fonts::Fonts;
use crate::items::Laid;
use crate::model::{shift_pos, Item, Settings};
use paginate::{Change, ItemMap, Tail};

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
    /// changes whenever what the page shows changes, its body or its
    /// bands, so the screen paints only those pages again
    pub version: u32,
    /// changes whenever its body changes: the text and everything drawn
    /// with it, but not the header and footer
    pub body_version: u32,
    /// changes whenever the text of its header or footer changes
    pub band_version: u32,
    /// the text of its header and footer slots
    pub bands: [String; 6],
}

/// the pages whose body and whose bands show something else than the page
/// at the same index did before a change, as ranges of page indices; empty
/// when none did. Pages the change dropped aren't in them: they are no
/// longer there.
#[derive(Clone, Debug, Default, PartialEq)]
pub struct Changes {
    pub body: std::ops::Range<usize>,
    pub bands: std::ops::Range<usize>,
}

/// what changed with an update, for the measurements
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Stats {
    pub laid_out: usize,
    pub paginated_from: usize,
    pub settled_at: Option<usize>,
    /// how many pages' band texts were expanded again
    pub bands_expanded: usize,
    /// how many fragments after the change had their item index rewritten
    pub frags_rewritten: usize,
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
    /// how many items miss each character, in the order the characters
    /// came, see `missing`
    missing_chars: Vec<(char, usize)>,
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
            missing_chars: Default::default(),
        };
        engine.paginate_from(0, None);
        engine
    }

    fn lay_out(&mut self, item: &Item) -> Laid {
        let width = self.settings.content_width();
        let room = self.settings.content_bottom() - self.settings.content_top();
        let mut laid = Laid::new(&mut self.fonts, item, width, room);
        if laid.units.is_empty() {
            laid.units.push(crate::items::Unit::default());
        }
        let extras = laid.extras.iter().map(|(boxed, _)| boxed);
        let mut missing: Vec<char> = vec![];
        for boxed in laid
            .texts
            .iter()
            .chain(&laid.label)
            .chain(&laid.marker)
            .chain(extras)
        {
            for char in &boxed.missing {
                if !missing.contains(char) {
                    missing.push(*char);
                }
            }
        }
        laid.missing = missing;
        laid
    }

    /// sets the page and lays out everything again, if it changed
    pub fn set_settings(&mut self, mut settings: Settings) -> Changes {
        settings.sanitize();
        if settings == self.settings {
            return Changes::default();
        }
        // the width of the text, and its height, which tall table rows are
        // sliced to
        let relayout = settings.width != self.settings.width
            || settings.height != self.settings.height
            || settings.margins != self.settings.margins;
        self.settings = settings;
        if relayout {
            let items = std::mem::take(&mut self.items);
            self.laid = items.iter().map(|item| self.lay_out(item)).collect();
            self.items = items;
            self.recount_missing();
            return self.paginate_from(0, None);
        }
        // the same items, only paginated again, e.g. for new bands: pages
        // that keep their fragments keep their bodies
        let change = Change {
            tail: None,
            map: ItemMap(vec![(0, self.items.len(), 0)]),
        };
        self.paginate_from(0, Some(change))
    }

    /// adds a font for what the others lack, see Fonts::add, and lays out
    /// everything again with it
    pub fn add_font(&mut self, bytes: Vec<u8>, family: &str) -> Changes {
        self.fonts.add(bytes, family);
        let items = std::mem::take(&mut self.items);
        self.laid = items.iter().map(|item| self.lay_out(item)).collect();
        self.items = items;
        self.recount_missing();
        self.paginate_from(0, None)
    }

    /// the characters of the document no font has a glyph for; kept up to
    /// date as items are laid out, so asking is cheap
    pub fn missing(&self) -> Vec<char> {
        self.missing_chars.iter().map(|(char, _)| *char).collect()
    }

    /// counts the characters every item misses, after all were laid out
    fn recount_missing(&mut self) {
        let mut counts: Vec<(char, usize)> = vec![];
        for laid in &self.laid {
            for char in &laid.missing {
                match counts.iter_mut().find(|(known, _)| known == char) {
                    Some((_, count)) => *count += 1,
                    None => counts.push((*char, 1)),
                }
            }
        }
        self.missing_chars = counts;
    }

    /// replaces all items
    pub fn set_items(&mut self, mut items: Vec<Item>) -> Changes {
        items.iter_mut().for_each(Item::sanitize);
        self.laid = items.iter().map(|item| self.lay_out(item)).collect();
        self.items = items;
        self.recount_missing();
        self.stats = Stats {
            laid_out: self.items.len(),
            ..Default::default()
        };
        self.paginate_from(0, None)
    }

    /// replaces `delete` items from `start` with `inserted`, and moves the
    /// items after them by `shift` positions. Only the new items are laid
    /// out, and the pages are paginated again from the page before the
    /// change until they start as before.
    pub fn update(
        &mut self,
        start: usize,
        delete: usize,
        inserted: Vec<Item>,
        shift: i64,
    ) -> Changes {
        self.update_many(vec![(start, delete, inserted, shift)])
    }

    /// several updates at once, each as `update` takes it and in document
    /// order: each one's `start` counts the items as the ones before it
    /// left them, and its `shift` moves the items after it. The pages are
    /// paginated again once, from the page before the first change. Out of
    /// order, they still apply, but paginate from the first page.
    pub fn update_many(&mut self, changes: Vec<(usize, usize, Vec<Item>, i64)>) -> Changes {
        if changes.is_empty() {
            return Changes::default();
        }
        // the items as runs of (length, index before the updates), with
        // None for new ones
        let old_count = self.items.len();
        let mut runs: Vec<(usize, Option<usize>)> = vec![(old_count, Some(0))];
        let mut restart_page = None;
        let mut previous_end = 0;
        let mut laid_out = 0;
        for (start, delete, mut inserted, shift) in changes {
            inserted.iter_mut().for_each(Item::sanitize);
            let start = start.min(self.items.len());
            let delete = delete.min(self.items.len() - start);
            let count = inserted.len();
            if restart_page.is_none() {
                restart_page = Some(self.restart_page(start));
            } else if start < previous_end {
                restart_page = Some(0);
            }
            previous_end = start + count;
            let laid: Vec<Laid> = inserted.iter().map(|item| self.lay_out(item)).collect();
            let removed: Vec<Vec<char>> = self.laid[start..start + delete]
                .iter()
                .map(|laid| laid.missing.clone())
                .collect();
            for missing in removed {
                for char in missing {
                    if let Some((_, count)) = self
                        .missing_chars
                        .iter_mut()
                        .find(|(known, _)| *known == char)
                    {
                        *count = count.saturating_sub(1);
                    }
                }
            }
            self.missing_chars.retain(|(_, count)| *count > 0);
            for new in &laid {
                for char in &new.missing {
                    match self
                        .missing_chars
                        .iter_mut()
                        .find(|(known, _)| known == char)
                    {
                        Some((_, count)) => *count += 1,
                        None => self.missing_chars.push((*char, 1)),
                    }
                }
            }
            self.items.splice(start..start + delete, inserted);
            self.laid.splice(start..start + delete, laid);
            if shift != 0 {
                for item in &mut self.items[start + count..] {
                    item.shift(shift);
                }
                for laid in &mut self.laid[start + count..] {
                    for text in &mut laid.texts {
                        text.pos = shift_pos(text.pos, shift);
                    }
                    for image in &mut laid.cell_images {
                        image.pos = shift_pos(image.pos, shift);
                    }
                }
            }
            splice_runs(&mut runs, start, delete, count);
            laid_out += count;
        }
        self.stats = Stats {
            laid_out,
            ..Default::default()
        };
        let mut map = vec![];
        let mut at = 0;
        for &(length, old) in &runs {
            if let Some(old) = old {
                map.push((at, at + length, old));
            }
            at += length;
        }
        // the items after the last change are the old ones, moved, up to
        // the old last one: once a page starts with one of them as an old
        // page did, the rest is as before
        let tail = match runs.last() {
            Some(&(length, Some(old))) if length > 0 && old + length == old_count => Some(Tail {
                start: at - length,
                delta: paginate::signed(at - length) - paginate::signed(old),
            }),
            _ => None,
        };
        let change = Change {
            tail,
            map: ItemMap(map),
        };
        self.paginate_from(restart_page.unwrap_or(0), Some(change))
    }

    /// the page to paginate again from for a change at item `start`: a
    /// heading before the change is kept with what follows it, so the run
    /// of headings before it, and the page before that, where what follows
    /// may flow back to
    fn restart_page(&self, start: usize) -> usize {
        let mut earliest = start;
        while earliest > 0 && self.items[earliest - 1].heading_level() > 0 {
            earliest -= 1;
        }
        if earliest < self.first_frag.len() {
            self.page_of_frag(self.first_frag[earliest])
        } else {
            self.pages.len().saturating_sub(1)
        }
        .saturating_sub(1)
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
}

/// replaces `delete` items from `start` in the runs of items with `count`
/// new ones
fn splice_runs(runs: &mut Vec<(usize, Option<usize>)>, start: usize, delete: usize, count: usize) {
    let split = |at: usize, runs: &mut Vec<(usize, Option<usize>)>| {
        let mut position = 0;
        for index in 0..runs.len() {
            let (length, old) = runs[index];
            if at > position && at < position + length {
                let first = at - position;
                runs[index] = (first, old);
                runs.insert(index + 1, (length - first, old.map(|old| old + first)));
                return;
            }
            position += length;
        }
    };
    split(start, runs);
    split(start + delete, runs);
    let mut position = 0;
    let mut index = 0;
    while index < runs.len() && position < start {
        position += runs[index].0;
        index += 1;
    }
    let mut removed = 0;
    while index < runs.len() && removed < delete {
        removed += runs[index].0;
        runs.remove(index);
    }
    if count > 0 {
        runs.insert(index, (count, None));
    }
    runs.retain(|(length, _)| *length > 0);
}

#[cfg(test)]
mod tests {
    use super::test_support::*;
    use super::{Engine, Op};

    #[test]
    fn tells_what_no_font_has_and_takes_fonts_for_it() {
        let mut engine = engine(document(&["plain 中文 text"]));
        assert_eq!(engine.missing(), vec!['中', '文']);
        let path = "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc";
        let Ok(bytes) = std::fs::read(path) else {
            // no Chinese font on this system
            return;
        };
        let pages = engine.pages[0].version;
        engine.add_font(bytes, "Noto Sans CJK SC");
        assert!(engine.missing().is_empty(), "{:?}", engine.missing());
        assert_ne!(engine.pages[0].version, pages);
        // every face of the collection, apart
        assert!(engine.fonts.files.len() > crate::fonts::FONT_FILES.len() + 1);
        let face = engine
            .page_ops(0, false)
            .iter()
            .find_map(|op| match op {
                Op::Glyphs { run, text, .. }
                    if text[run.glyphs[0].start as usize..].starts_with('中') =>
                {
                    Some((run.font, run.glyphs[0].id))
                }
                _ => None,
            })
            .unwrap();
        assert!(!engine.fonts.glyph_path(face.0, face.1).is_empty());
        // and the PDF embeds it
        let pdf = crate::pdf::write(
            &mut engine,
            &Default::default(),
            &crate::pdf::Info {
                title: String::new(),
                author: String::new(),
            },
        )
        .unwrap();
        assert!(pdf.len() > 1000);
    }

    #[test]
    fn engines_share_their_fonts() {
        let mut page = engine(document(&[LONG; 12]));
        let dejavu = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fonts/dejavu-sans-bold.ttf"
        ))
        .unwrap();
        page.add_font(dejavu, "Fallback");
        let mut export = Engine::new(page.fonts.share());
        // the same files, not copies of them
        assert_eq!(export.fonts.files.len(), page.fonts.files.len());
        for (a, b) in export.fonts.files.iter().zip(&page.fonts.files) {
            assert!(std::sync::Arc::ptr_eq(&a.data, &b.data));
            assert_eq!(a.blob.id(), b.blob.id());
        }
        assert_eq!(export.fonts.stack, page.fonts.stack);
        // what makes the same fonts elsewhere: each file once, with the
        // family of the fallback
        let sources = page.fonts.sources();
        assert_eq!(sources.len(), crate::fonts::FONT_FILES.len() + 1);
        assert!(sources[..crate::fonts::FONT_FILES.len()]
            .iter()
            .all(|(_, family)| family.is_empty()));
        assert_eq!(sources.last().unwrap().1, "Fallback");
        // and the PDF of an engine that shares the fonts is the PDF of one
        // with its own
        let mut fresh = Engine::new(crate::fonts::repository_fonts());
        let dejavu = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fonts/dejavu-sans-bold.ttf"
        ))
        .unwrap();
        fresh.add_font(dejavu, "Fallback");
        let items = page.items.clone();
        export.set_items(items.clone());
        fresh.set_items(items);
        let info = crate::pdf::Info {
            title: "Shared".into(),
            author: String::new(),
        };
        let shared = crate::pdf::write(&mut export, &Default::default(), &info).unwrap();
        let own = crate::pdf::write(&mut fresh, &Default::default(), &info).unwrap();
        assert!(shared == own, "the PDFs differ");
        assert_eq!(export.frags, page.frags);
    }

    #[test]
    fn counts_what_no_font_has_as_items_come_and_go() {
        let mut engine = engine(document(&["plain", "\u{4e2d}\u{6587}", "more \u{4e2d}"]));
        assert_eq!(engine.missing(), vec!['\u{4e2d}', '\u{6587}']);
        // without the second paragraph, only the third one's character
        let third = engine.items[2].clone();
        engine.update(1, 1, vec![], -4);
        assert_eq!(engine.missing(), vec!['\u{4e2d}']);
        // without the third too, nothing
        engine.update(1, 1, vec![], -(third.to() as i64 - third.from() as i64 + 2));
        assert!(engine.missing().is_empty());
        // and back
        engine.update(1, 0, vec![paragraph(8, "\u{6587}")], 3);
        assert_eq!(engine.missing(), vec!['\u{6587}']);
    }

    #[test]
    #[ignore]
    fn missing_timing() {
        let engine = engine(document(&vec![LONG; 10150]));
        let started = std::time::Instant::now();
        for _ in 0..100 {
            std::hint::black_box(engine.missing());
        }
        println!(
            "missing() at {} pages: {:?}",
            engine.pages.len(),
            started.elapsed() / 100
        );
    }
}

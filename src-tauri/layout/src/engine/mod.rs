//! The engine: keeps the laid out items of a document, paginates them, and
//! answers where positions are and what a page shows.

mod display;
#[cfg(test)]
mod incremental_tests;
mod navigate;
mod paginate;
mod select;
#[cfg(test)]
pub(crate) mod test_support;
mod text_layer;

pub use display::Op;
pub use navigate::Hit;
pub use select::{GridRow, TableGrid};
pub use text_layer::Word;

use crate::bands::{bands_on, chapter_on, expand_slots, Chapter, Values};
use crate::fonts::Fonts;
use crate::items::Laid;
use crate::model::{Item, Settings};
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
    /// changes whenever what the page shows changes, so the screen paints
    /// only those pages again
    pub version: u32,
    /// the text of its header and footer slots
    pub bands: [String; 6],
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
        let room = self.settings.content_bottom() - self.settings.content_top();
        let mut laid = Laid::new(&mut self.fonts, item, width, room);
        if laid.units.is_empty() {
            laid.units.push(crate::items::Unit::default());
        }
        laid
    }

    /// sets the page and lays out everything again, if it changed
    pub fn set_settings(&mut self, settings: Settings) {
        if settings == self.settings {
            return;
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
        }
        self.paginate_from(0, None);
    }

    /// adds a font for what the others lack, see Fonts::add, and lays out
    /// everything again with it
    pub fn add_font(&mut self, bytes: Vec<u8>, family: &str) {
        self.fonts.add(bytes, family);
        let items = std::mem::take(&mut self.items);
        self.laid = items.iter().map(|item| self.lay_out(item)).collect();
        self.items = items;
        self.paginate_from(0, None);
    }

    /// the characters of the document no font has a glyph for
    pub fn missing(&self) -> Vec<char> {
        let mut missing: Vec<char> = vec![];
        for laid in &self.laid {
            for boxed in laid.texts.iter().chain(&laid.label).chain(&laid.marker) {
                for char in &boxed.missing {
                    if !missing.contains(char) {
                        missing.push(*char);
                    }
                }
            }
        }
        missing
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
        // and at the page before it, where what follows may flow back to
        let restart_page = if earliest < self.first_frag.len() {
            self.page_of_frag(self.first_frag[earliest])
        } else {
            self.pages.len().saturating_sub(1)
        }
        .saturating_sub(1);
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
        let change = Change {
            tail: Tail {
                start: start + count,
                delta: count as i64 - delete as i64,
            },
            map: ItemMap(vec![
                (0, start, 0),
                (start + count, self.items.len(), start + delete),
            ]),
        };
        self.paginate_from(restart_page, Some(change));
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

#[cfg(test)]
mod tests {
    use super::test_support::*;
    use super::Op;

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
}

//! The page numbers of the tables of contents, set in after paginating,
//! as the fields of headers and footers are: a table of contents leaves a
//! column wide enough for any of them (see items/toc.rs), so they never
//! change its lines.

use parley::Alignment;

use super::Engine;
use crate::bands::{format_number, page_number};
use crate::items::number_text;
use crate::model::Content;
use crate::text::TextBox;

/// a listed heading (see Text::listed): its item and level, and where it
/// starts, its page and how far down it, if it is placed
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Listed {
    pub item: usize,
    pub level: u8,
    pub at: Option<(usize, f32)>,
}

impl Engine {
    /// the listed headings, in order
    pub fn listed_headings(&self) -> Vec<Listed> {
        self.items
            .iter()
            .enumerate()
            .filter_map(|(item, content)| {
                let Content::Text(text) = &content.content else {
                    return None;
                };
                if !text.listed || !(1..=6).contains(&text.level) {
                    return None;
                }
                // one that isn't placed still counts, so the entries after
                // it stay with their headings
                let at = self.first_frag.get(item).and_then(|&frag| {
                    let placed = self.frags.get(frag)?;
                    Some((self.page_of_frag(frag), placed.y))
                });
                Some(Listed {
                    item,
                    level: text.level,
                    at,
                })
            })
            .collect()
    }

    /// where the heading of a table of contents' entry starts, its page and
    /// how far down it, among `listed`, the listed headings: the n-th entry
    /// is the n-th of them up to its depth
    pub fn toc_target(&self, item: usize, entry: usize, listed: &[Listed]) -> Option<(usize, f32)> {
        let Content::Toc { depth, .. } = &self.items.get(item)?.content else {
            return None;
        };
        listed
            .iter()
            .filter(|heading| heading.level <= *depth)
            .nth(entry)?
            .at
    }

    /// the page numbers of a table of contents' entries, "" for an entry
    /// whose heading isn't there (yet)
    pub fn toc_labels(&self, item: usize) -> Option<&[String]> {
        let at = self
            .toc_labels
            .binary_search_by_key(&item, |(index, _)| *index)
            .ok()?;
        Some(&self.toc_labels[at].1)
    }

    /// a page number as set in a table of contents, in `style`
    pub fn number_box(&self, label: &str, style: &'static str) -> Option<&TextBox> {
        self.number_boxes.get(&(label.to_string(), style))
    }

    /// works out the page numbers of every table of contents after
    /// paginating, and returns the items of those whose numbers changed,
    /// each with the units of the entries whose number changed
    pub(super) fn set_toc_numbers(
        &mut self,
        old_of: impl Fn(usize) -> Option<usize>,
    ) -> Vec<(usize, Vec<usize>)> {
        let old = std::mem::take(&mut self.toc_labels);
        let listed = self.listed_headings();
        let mut labels = vec![];
        for (index, item) in self.items.iter().enumerate() {
            let Content::Toc { depth, entries, .. } = &item.content else {
                continue;
            };
            let mut headings = listed.iter().filter(|heading| heading.level <= *depth);
            let numbers: Vec<String> = (0..entries.len())
                .map(|_| match headings.next().and_then(|heading| heading.at) {
                    Some((page, _)) => format_number(
                        page_number(&self.settings, page + 1),
                        &self.settings.number_style,
                    ),
                    None => String::new(),
                })
                .collect();
            labels.push((index, numbers));
        }
        // the boxes of numbers not set before
        for (index, numbers) in &labels {
            let Some(toc) = self.laid[*index].toc.as_ref() else {
                continue;
            };
            for (line, label) in toc.entries.iter().zip(numbers) {
                let key = (label.clone(), line.style);
                if label.is_empty() || self.number_boxes.contains_key(&key) {
                    continue;
                }
                let text = number_text(label, line.style);
                let boxed = TextBox::new(&mut self.fonts, &text, 1000.0, Alignment::Start);
                self.number_boxes.insert(key, boxed);
            }
        }
        // each table of contents against what it was before the change (by
        // `old_of`, the item's index before it): the units of the entries
        // whose number changed
        let mut changed = vec![];
        for (index, numbers) in &labels {
            let before = old_of(*index).and_then(|old_index| {
                old.iter()
                    .find(|(item, _)| *item == old_index)
                    .map(|(_, before)| before)
            });
            let Some(toc) = self.laid[*index].toc.as_ref() else {
                continue;
            };
            let units: Vec<usize> = toc
                .entries
                .iter()
                .zip(numbers)
                .enumerate()
                .filter(|(entry, (_, label))| {
                    before.and_then(|before| before.get(*entry)) != Some(*label)
                })
                .map(|(_, (line, _))| line.unit)
                .collect();
            if !units.is_empty() {
                changed.push((*index, units));
            }
        }
        self.toc_labels = labels;
        changed
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::*;
    use super::super::{Hit, Op, Part};
    use crate::items::Role;
    use crate::model::{Content, Item, Settings, TocEntry};

    fn toc(pos: u32, entries: &[(u8, &str)]) -> Item {
        Item {
            content: Content::Toc {
                pos,
                title: "Contents".into(),
                depth: 3,
                entries: entries
                    .iter()
                    .map(|(level, text)| TocEntry {
                        level: *level,
                        text: (*text).into(),
                    })
                    .collect(),
            },
            ..paragraph(0, "")
        }
    }

    /// the page numbers a page shows, in order
    fn numbers(engine: &mut super::Engine, page: usize) -> Vec<String> {
        engine
            .body_parts(page)
            .into_iter()
            .filter_map(|(op, part)| match (op, part) {
                (Op::Glyphs { run, text, .. }, Part::TocNumber { .. }) => {
                    let from = run.glyphs.first()?.start as usize;
                    let to = run.glyphs.last()?.end as usize;
                    Some(text[from..to].to_string())
                }
                _ => None,
            })
            .collect()
    }

    fn chapters() -> Vec<Item> {
        vec![
            toc(0, &[(1, "One"), (2, "One a"), (1, "Two")]),
            heading(2, 1, "One"),
            paragraph(8, "text"),
            heading(15, 2, "One a"),
            heading(25, 1, "Two"),
        ]
    }

    #[test]
    fn sets_in_the_pages_the_headings_start_on() {
        let mut engine = engine(chapters());
        engine.set_settings(Settings {
            new_page_before: vec![1],
            ..Default::default()
        });
        // the table of contents, then a chapter per page
        assert_eq!(engine.pages.len(), 3);
        assert_eq!(numbers(&mut engine, 0), ["2", "2", "3"]);
        // right-aligned, on the line of their entry, after the dots
        let toc = engine.laid[0].toc.clone().unwrap();
        let parts = engine.body_parts(0);
        let number = parts
            .iter()
            .find_map(|(op, part)| match (op, part) {
                (Op::Glyphs { run, .. }, Part::TocNumber { entry: 0, .. }) => Some(run.clone()),
                _ => None,
            })
            .unwrap();
        let right = engine.settings.margins.left + toc.x + toc.width;
        assert!((number.x + number.width - right).abs() < 0.01);
        // the leader dots of the first entry, up to just before its number
        let baseline = number.baseline;
        let dots: Vec<f32> = parts
            .iter()
            .filter_map(|(op, part)| match (op, part) {
                (
                    Op::Rect {
                        x,
                        y,
                        role: Role::Text,
                        ..
                    },
                    Part::Decoration,
                ) if (*y - baseline).abs() < 2.0 => Some(*x),
                _ => None,
            })
            .collect();
        assert!(dots.len() > 10, "{} leader dots", dots.len());
        let last = dots.iter().copied().fold(0.0, f32::max);
        assert!(
            number.x - last < 12.0,
            "the dots end {} before",
            number.x - last
        );
    }

    #[test]
    fn lays_out_only_the_tables_of_contents_again_for_another_number_style() {
        let mut engine = engine(chapters());
        let settings = Settings {
            new_page_before: vec![1],
            ..Default::default()
        };
        engine.set_settings(settings.clone());
        let chapter = engine.pages[2].body_version;
        engine.set_settings(Settings {
            number_style: "I".into(),
            ..settings
        });
        assert_eq!(numbers(&mut engine, 0), ["II", "II", "III"]);
        // the pages of the chapters show what they showed
        assert_eq!(engine.pages[2].body_version, chapter);
    }

    #[test]
    fn numbers_as_the_footer_does() {
        let mut engine = engine(chapters());
        engine.set_settings(Settings {
            new_page_before: vec![1],
            number_style: "i".into(),
            start_number: 3,
            ..Default::default()
        });
        assert_eq!(numbers(&mut engine, 0), ["iv", "iv", "v"]);
    }

    #[test]
    fn follows_a_heading_to_another_page_and_paints_the_page_again() {
        let page_break = |pos| Item {
            content: Content::Break { pos },
            ..paragraph(0, "")
        };
        // the table of contents alone on the first page
        let mut engine = engine(vec![
            toc(0, &[(1, "One"), (1, "Two")]),
            page_break(1),
            heading(2, 1, "One"),
            paragraph(7, "text"),
            heading(13, 1, "Two"),
        ]);
        assert_eq!(numbers(&mut engine, 0), ["2", "2"]);
        let first = engine.pages[0].clone();
        // a page break before the second chapter: the first page has what
        // it had, but another number
        engine.update(4, 0, vec![page_break(13)], 1);
        assert_eq!(engine.pages.len(), 3);
        assert_eq!(
            engine.frags[engine.pages[0].start..engine.pages[0].end],
            engine.frags[first.start..first.end]
        );
        assert_eq!(numbers(&mut engine, 0), ["2", "3"]);
        assert_ne!(engine.pages[0].body_version, first.body_version);
    }

    #[test]
    fn leaves_out_the_number_of_a_heading_that_isnt_there() {
        let mut engine = engine(vec![toc(0, &[(1, "Gone")]), paragraph(2, "text")]);
        assert!(numbers(&mut engine, 0).is_empty());
        assert_eq!(engine.toc_labels(0), Some(&[String::new()][..]));
        assert_eq!(engine.toc_target(0, 0, &engine.listed_headings()), None);
    }

    #[test]
    fn links_its_entries_to_their_headings_in_the_pdf() {
        let mut engine = engine(chapters());
        engine.set_settings(Settings {
            new_page_before: vec![1],
            ..Default::default()
        });
        let links: Vec<String> = engine
            .body_ops(0)
            .into_iter()
            .filter_map(|op| match op {
                Op::Link { href, .. } => Some(href),
                _ => None,
            })
            .collect();
        assert_eq!(links, ["#toc:0", "#toc:1", "#toc:2"]);
        let listed = engine.listed_headings();
        let (page, y) = engine.toc_target(0, 2, &listed).unwrap();
        assert_eq!(page, 2);
        assert!((y - engine.settings.content_top()).abs() < 0.01);
        let pdf = crate::pdf::write(
            &mut engine,
            &Default::default(),
            &crate::pdf::Info {
                title: String::new(),
                author: String::new(),
                date: "2026-10-01T09:30:00+02:00".into(),
            },
        )
        .unwrap();
        assert!(pdf.len() > 1000);
    }

    #[test]
    fn says_what_it_will_hold_without_headings_on_the_screen_only() {
        let engine = engine(vec![toc(0, &[]), paragraph(2, "text")]);
        let hint: Vec<Part> = engine
            .body_parts(0)
            .into_iter()
            .filter_map(|(op, part)| match op {
                Op::Glyphs {
                    role: Role::Hint, ..
                } => Some(part),
                _ => None,
            })
            .collect();
        // the PDF leaves out what only the screen shows
        assert!(!hint.is_empty());
        assert!(hint.iter().all(|part| *part == Part::Hint { item: 0 }));
        assert!(engine.laid[0].texts.is_empty());
        // and the title stays with it
        assert!(engine.laid[0].units[0].keep_next);
    }

    #[test]
    fn is_left_below_its_entries_and_entered_from_above_and_below() {
        let engine = engine(vec![
            paragraph(1, "before"),
            toc(8, &[(1, "One"), (1, "Two")]),
            heading(10, 1, "One"),
            heading(15, 1, "Two"),
        ]);
        // the title and the entries are units of their own
        assert!(engine.laid[1].units.len() > 1);
        let goal = engine.settings.margins.left;
        // ↓ from the selected table of contents goes past its entries
        let (down, _) = engine.vertical(9, false, true, goal).unwrap();
        assert_eq!(down, Hit::Text(10));
        // ↑ from it goes to the block above, and into it from either side
        let (up, _) = engine.vertical(9, false, false, goal).unwrap();
        assert!(matches!(up, Hit::Text(pos) if pos < 8), "{up:?}");
        let (from_below, _) = engine.vertical(10, false, false, goal).unwrap();
        assert_eq!(from_below, Hit::Node(8));
        let (from_above, _) = engine.vertical(1, false, true, goal).unwrap();
        assert_eq!(from_above, Hit::Node(8));
    }
}

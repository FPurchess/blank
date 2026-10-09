//! The numbers of numbered display math, (1), (2)… in the order of the
//! document. They are set in after paginating, like the page numbers of a
//! table of contents, so a formula added before others renumbers them
//! without laying them out again: only the pages that show a number that
//! changed are painted again.

use parley::Alignment;

use super::display::MATH_NUMBER;
use super::Engine;
use crate::items::number_label;
use crate::model::Content;
use crate::text::TextBox;

/// whether a formula numbers itself with `\tag` (or `\tag*`), and so gets
/// no number: the control word itself, not `\tagged`, nor one in a comment
fn tagged(latex: &str) -> bool {
    let mut chars = latex.chars().peekable();
    while let Some(next) = chars.next() {
        match next {
            // a comment, to the end of its line
            '%' => {
                for skipped in chars.by_ref() {
                    if skipped == '\n' {
                        break;
                    }
                }
            }
            '\\' => {
                let mut word = String::new();
                while let Some(letter) = chars.next_if(char::is_ascii_alphabetic) {
                    word.push(letter);
                }
                if word == "tag" {
                    return true;
                }
                // a control symbol, e.g. \% or \\, stands for no more
                if word.is_empty() {
                    chars.next();
                }
            }
            _ => {}
        }
    }
    false
}

impl Engine {
    /// the number display math at `item` shows, as it is set: "(3)"
    pub fn math_number(&self, item: usize) -> Option<String> {
        self.math_labels
            .binary_search_by_key(&item, |(index, _)| *index)
            .ok()
            .map(|found| format!("({})", self.math_labels[found].1))
    }

    /// the numbered display math by position, with its number
    pub fn math_numbers(&self) -> Vec<(u32, u32)> {
        self.math_labels
            .iter()
            .filter_map(|&(index, number)| match self.items.get(index)?.content {
                Content::Math { pos, .. } => Some((pos, number)),
                _ => None,
            })
            .collect()
    }

    /// numbers the numbered display math after paginating, and returns the
    /// items whose number changed (by `old_of`, an item's index before the
    /// change)
    pub(super) fn set_math_numbers(
        &mut self,
        old_of: impl Fn(usize) -> Option<usize>,
    ) -> Vec<usize> {
        let old = std::mem::take(&mut self.math_labels);
        let mut numbers = vec![];
        for (index, item) in self.items.iter().enumerate() {
            if let Content::Math {
                numbered: true,
                latex,
                ..
            } = &item.content
            {
                if !tagged(latex) {
                    numbers.push((index, numbers.len() as u32 + 1));
                }
            }
        }
        for &(_, number) in &numbers {
            let key = (format!("({number})"), MATH_NUMBER);
            if !self.number_boxes.contains_key(&key) {
                let boxed = TextBox::new(
                    &mut self.fonts,
                    &number_label(&key.0),
                    1000.0,
                    Alignment::Start,
                );
                self.number_boxes.insert(key, boxed);
            }
        }
        // the old numbers are in the order of their items, as the new ones
        let changed = numbers
            .iter()
            .filter(|&&(index, number)| {
                let before = old_of(index).and_then(|old_index| {
                    old.binary_search_by_key(&old_index, |(item, _)| *item)
                        .ok()
                        .map(|found| old[found].1)
                });
                before != Some(number)
            })
            .map(|(index, _)| *index)
            .collect();
        self.math_labels = numbers;
        changed
    }
}

#[cfg(test)]
mod tests {
    use super::super::test_support::*;
    use super::super::Engine;
    use crate::math::tests::math_fonts;
    use crate::model::{Content, Item};

    fn math(pos: u32, latex: &str, numbered: bool) -> Item {
        Item {
            content: Content::Math {
                pos,
                end: pos + 4 + latex.len() as u32,
                latex: latex.into(),
                numbered,
                align: None,
                preview: false,
            },
            ..paragraph(0, "")
        }
    }

    fn engine_of(items: Vec<Item>) -> Engine {
        let mut engine = Engine::new(math_fonts());
        engine.set_items(items);
        engine
    }

    #[test]
    fn knows_a_formula_that_tags_itself() {
        use super::tagged;
        assert!(tagged(r"a \tag{1}"));
        assert!(tagged(r"a \tag*{x}"));
        assert!(tagged("a \\tag{1} % \\notag"));
        assert!(!tagged(r"a \tagged{1}"));
        assert!(!tagged("a % \\tag{1}\n+ b"));
        assert!(!tagged(r"a \% \\tag"));
        assert!(!tagged(r"a \\tag"));
        assert!(tagged("a % comment\n\\tag{2}"));
    }

    #[test]
    fn numbers_in_the_order_of_the_document() {
        let engine = engine_of(vec![
            math(0, "a", true),
            math(10, "b", false),
            math(20, "c", true),
            math(30, r"d \tag{x}", true),
            math(50, "e", true),
        ]);
        assert_eq!(engine.math_number(0).as_deref(), Some("(1)"));
        assert_eq!(engine.math_number(1), None);
        assert_eq!(engine.math_number(2).as_deref(), Some("(2)"));
        assert_eq!(engine.math_number(3), None);
        assert_eq!(engine.math_number(4).as_deref(), Some("(3)"));
        assert_eq!(engine.math_numbers(), [(0, 1), (20, 2), (50, 3)]);
    }

    #[test]
    fn tells_the_characters_no_font_has_in_math() {
        use crate::model::{Cell, CellBlock, Content, Row, Span, Text};
        // display math, math in a table cell, and inline math
        let mut table = table_item(
            vec![Row {
                cells: vec![Cell {
                    blocks: vec![CellBlock::Math {
                        pos: 20,
                        latex: r"\text{本}".into(),
                        indent: 0.0,
                        marker: None,
                        bars: vec![],
                    }],
                    ..Default::default()
                }],
                header: false,
            }],
            None,
        );
        if let Content::Table { pos, end, .. } = &mut table.content {
            (*pos, *end) = (10, 40);
        }
        let mut inline = paragraph(50, "a \u{2060}\u{2060}\u{2060}\u{2060}");
        if let Content::Text(text) = &mut inline.content {
            *text = Text {
                spans: vec![Span {
                    from: 2,
                    to: 6,
                    math: Some(r"\text{語}".into()),
                    ..Default::default()
                }],
                ..text.clone()
            };
        }
        let engine = engine_of(vec![math(0, r"\text{日}", false), table, inline]);
        let mut missing = engine.missing();
        missing.sort();
        let mut wanted = vec!['日', '本', '語'];
        wanted.sort();
        assert_eq!(missing, wanted);
    }

    #[test]
    fn draws_the_number_at_the_right() {
        let mut engine = engine_of(vec![math(0, "a = b", true)]);
        let ops = engine.page_ops(0, false);
        let number: String = ops
            .iter()
            .filter_map(|op| match op {
                super::super::Op::Glyphs { run, text, .. } if run.font < 14 => Some(
                    run.glyphs
                        .iter()
                        .map(|glyph| &text[glyph.start as usize..glyph.end as usize])
                        .collect::<String>(),
                ),
                _ => None,
            })
            .collect();
        assert_eq!(number, "(1)");
    }

    #[test]
    fn renumbers_the_pages_after_a_new_formula() {
        // formulas on many pages, then one more at the start: the numbers of
        // every page change, so every page has a new version
        let items: Vec<Item> = (0..120).map(|n| math(n * 10, "x", true)).collect();
        let mut engine = engine_of(items.clone());
        assert!(engine.pages.len() > 2, "{} pages", engine.pages.len());
        let before: Vec<u32> = engine.pages.iter().map(|page| page.body_version).collect();
        let mut more = vec![math(0, "y", true)];
        more.extend(items.into_iter().map(|mut item| {
            item.shift(10);
            item
        }));
        engine.update(0, 0, vec![more[0].clone()], 10);
        let after: Vec<u32> = engine.pages.iter().map(|page| page.body_version).collect();
        let last = engine.pages.len() - 1;
        assert_ne!(
            before[last], after[last],
            "the last page keeps its old numbers"
        );
        assert_eq!(engine.math_number(120).as_deref(), Some("(121)"));
    }
}

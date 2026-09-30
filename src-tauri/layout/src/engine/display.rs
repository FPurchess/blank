//! Painting: what a page shows, as glyph runs, rectangles, images and
//! links, with its header and footer.

use parley::Alignment;

use super::Engine;
use crate::bands::{BAND_DISTANCE, BAND_LINE};
use crate::fonts::{Fonts, INK_CODE};
use crate::items::{Deco, Role};
use crate::model::{Content, Text};
use crate::style::BAR;
use crate::text::{GlyphRun, TextBox};

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

impl Engine {
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
                    // a table's caption is text; an image's alt text a hint
                    let role = if matches!(item.content, Content::Table { .. }) {
                        Role::Text
                    } else {
                        Role::Hint
                    };
                    for line in 0..label.line_count() {
                        push_text_ops(&mut ops, &self.fonts, label, line, dx, dy, role);
                    }
                }
            }
            for text in unit.texts.clone() {
                let boxed = &laid.texts[text];
                let lines = match unit.line {
                    Some(line) => line..line + 1,
                    None => 0..boxed.line_count(),
                };
                let infos = boxed.lines();
                for line in lines {
                    let info = &infos[line];
                    if unit.shows(boxed.y + info.top, boxed.y + info.bottom) {
                        push_text_ops(&mut ops, &self.fonts, boxed, line, dx, dy, Role::Text);
                    }
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::test_support::*;
    use crate::model::Item;

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
    fn sets_code_in_plex_mono() {
        let mut code = paragraph(1, "let x = 1;");
        if let Content::Text(text) = &mut code.content {
            text.style = "code".into();
        }
        let mut inline = paragraph(20, "run npm now");
        if let Content::Text(text) = &mut inline.content {
            text.spans = vec![crate::model::Span {
                from: 4,
                to: 7,
                code: true,
                ..Default::default()
            }];
        }
        let mut engine = engine(vec![code, inline]);
        let fonts: Vec<(usize, f32)> = engine
            .page_ops(0, false)
            .iter()
            .filter_map(|op| match op {
                Op::Glyphs {
                    run,
                    role: Role::Text,
                    ..
                } => Some((run.font, run.size)),
                _ => None,
            })
            .collect();
        // the code block, then plain text, inline code, plain text
        assert_eq!(fonts[0], (10, crate::style::CODE_SIZE));
        assert!(fonts.contains(&(10, 11.0 * crate::style::CODE_SCALE)));
        assert!(fonts.contains(&(0, 11.0)));
        // every glyph of a monospaced font is as wide
        assert!(engine.missing().is_empty());
    }

    #[test]
    fn keeps_long_words_on_the_page_everywhere() {
        use crate::model::{Row, Slots};
        let long = "x".repeat(400);
        let mut heading = heading(1, 1, &long);
        heading.before = 0.0;
        let mut item = paragraph(420, &long);
        item.indent = 18.0;
        item.marker = Some("•".into());
        let rows = vec![Row {
            cells: vec![cell(900, &long), cell(1400, "b")],
            header: false,
        }];
        let mut table = table_item(rows, None);
        if let Content::Table { pos, .. } = &mut table.content {
            *pos = 850;
        }
        let mut engine = engine(vec![heading, item, table]);
        let mut settings = engine.settings.clone();
        settings.header = Slots {
            left: long.clone(),
            ..Default::default()
        };
        engine.set_settings(settings);
        let right = engine.settings.width - engine.settings.margins.right;
        for page in 0..engine.pages.len() {
            for op in engine.page_ops(page, true) {
                if let Op::Glyphs { run, .. } = op {
                    for glyph in run.glyphs {
                        assert!(
                            glyph.x + glyph.advance <= right + 0.5,
                            "{} > {right}",
                            glyph.x
                        );
                    }
                }
            }
        }
    }
}

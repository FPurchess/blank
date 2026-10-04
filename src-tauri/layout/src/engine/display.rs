//! Painting: what a page shows, as glyph runs, rectangles, images and
//! links, with its header and footer.

use parley::Alignment;

use super::Engine;
use crate::bands::{BAND_DISTANCE, BAND_LINE};
use crate::fonts::{Fonts, INK_CODE};
use crate::items::{Deco, Role};
use crate::model::{Content, Text, TextKind};
use crate::style::BAR;
use crate::text::{GlyphRun, TextBox};

/// what the page shows, in points from its top left corner
#[derive(Clone, Debug, PartialEq)]
pub enum Op {
    Glyphs {
        run: GlyphRun,
        role: Role,
        /// the text the glyphs' ranges point into, shared with its text box
        text: std::sync::Arc<str>,
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
        /// what stands in its place where it can't be shown
        alt: String,
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

/// which part of the document an op draws, for the PDF's tags: the text
/// and images of an item, or what is only drawn with it
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub enum Part {
    /// drawn with an item, but not its content: rules, table lines and
    /// fills, quote bars, the fill of code, the line under a link
    Decoration,
    /// a text box of an item, see `Laid::texts`
    Text { item: usize, text: usize },
    /// the list marker of an item
    Marker { item: usize },
    /// a table's caption, or the alt text shown for an image that isn't
    /// loaded, see `Laid::label`
    Label { item: usize },
    /// the image of an item
    Image { item: usize },
    /// a list marker or alt text in a table's cell, see `Laid::extras`
    Extra { item: usize, extra: usize },
    /// an image in a table's cell, see `Laid::cell_images`
    CellImage { item: usize, image: usize },
    /// a link of a text box: its annotation, by the link's number in the box
    Link {
        item: usize,
        text: usize,
        link: usize,
    },
    /// the text of a link, drawn in its glyph runs
    Linked {
        item: usize,
        text: usize,
        link: usize,
    },
    /// the header or the footer of the page
    Band { footer: bool },
    /// a table's header rows, repeated on a page the table goes on: they
    /// are in the structure once, where they first are
    Repeat,
}

impl Engine {
    /// what a page shows: its text, decorations, images, links and, with
    /// `bands`, its header and footer
    pub fn page_ops(&mut self, page: usize, bands: bool) -> Vec<Op> {
        let mut ops = self.body_ops(page);
        if bands {
            ops.extend(self.band_ops(page));
        }
        ops
    }

    /// what a page shows besides its header and footer
    pub fn body_ops(&self, page: usize) -> Vec<Op> {
        self.body_parts(page)
            .into_iter()
            .map(|(op, _)| op)
            .collect()
    }

    /// a page's header and footer
    pub fn band_ops(&mut self, page: usize) -> Vec<Op> {
        self.band_parts(page)
            .into_iter()
            .map(|(op, _)| op)
            .collect()
    }

    /// what a page shows besides its header and footer, with the part of
    /// the document each op draws
    pub fn body_parts(&self, page: usize) -> Vec<(Op, Part)> {
        let mut ops = vec![];
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
                let part = match deco {
                    Deco::Image { x, y, .. } => match item.content {
                        Content::Table { .. } => laid
                            .cell_images
                            .iter()
                            .position(|image| {
                                image.unit == frag.unit && image.x == *x && image.y == *y
                            })
                            .map_or(Part::Decoration, |image| Part::CellImage {
                                item: frag.item,
                                image,
                            }),
                        _ => Part::Image { item: frag.item },
                    },
                    Deco::Rect { .. } => Part::Decoration,
                };
                let part = if frag.repeat && part != Part::Decoration {
                    Part::Repeat
                } else {
                    part
                };
                ops.push((deco_op(deco.moved(dx, dy)), part));
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
                    let op = Op::Rect {
                        x: left + bar,
                        y: frag.y,
                        w: BAR,
                        h: height,
                        role: Role::Text,
                    };
                    ops.push((op, Part::Decoration));
                }
            }
            if frag.unit == 0 && !frag.repeat {
                if let Some(marker) = &laid.marker {
                    let part = Part::Marker { item: frag.item };
                    push_text_ops(&mut ops, &self.fonts, marker, 0, dx, dy, Role::Text, part);
                }
                if let Some(label) = &laid.label {
                    // a table's caption is text; an image's alt text a hint
                    let role = if matches!(item.content, Content::Table { .. }) {
                        Role::Text
                    } else {
                        Role::Hint
                    };
                    let part = Part::Label { item: frag.item };
                    for line in 0..label.line_count() {
                        push_text_ops(&mut ops, &self.fonts, label, line, dx, dy, role, part);
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
                let part = if frag.repeat {
                    Part::Repeat
                } else {
                    Part::Text {
                        item: frag.item,
                        text,
                    }
                };
                for line in lines {
                    let info = &infos[line];
                    if unit.shows(boxed.y + info.top, boxed.y + info.bottom) {
                        push_text_ops(&mut ops, &self.fonts, boxed, line, dx, dy, Role::Text, part);
                    }
                }
            }
            // the list markers and alt texts in a table's cells
            for extra in unit.extras.clone() {
                let (boxed, role) = &laid.extras[extra];
                let part = if frag.repeat {
                    Part::Repeat
                } else {
                    Part::Extra {
                        item: frag.item,
                        extra,
                    }
                };
                for (line, info) in boxed.lines().iter().enumerate() {
                    if unit.shows(boxed.y + info.top, boxed.y + info.bottom) {
                        push_text_ops(&mut ops, &self.fonts, boxed, line, dx, dy, *role, part);
                    }
                }
            }
        }
        ops
    }

    /// a page's header and footer, with which of them each op draws
    pub fn band_parts(&mut self, page: usize) -> Vec<(Op, Part)> {
        let mut ops = vec![];
        let middle = self.settings.height / 2.0;
        for (boxed, dx, dy) in &self.band_boxes(page) {
            let part = Part::Band {
                footer: *dy > middle,
            };
            for line in 0..boxed.line_count() {
                push_text_ops(
                    &mut ops,
                    &self.fonts,
                    boxed,
                    line,
                    *dx,
                    *dy,
                    Role::Band,
                    part,
                );
            }
        }
        ops
    }

    /// the header and footer of a page, laid out, with where they stand
    fn band_boxes(&mut self, page: usize) -> Vec<(TextBox, f32, f32)> {
        let Some(page) = self.pages.get(page) else {
            return vec![];
        };
        // borrowed apart, since laying the text out needs the fonts mutably
        let (texts, settings, fonts) = (&page.bands, &self.settings, &mut self.fonts);
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
                style: TextKind::Band,
                ..Default::default()
            };
            let boxed = TextBox::new(fonts, &text, width, alignments[slot]);
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
        Deco::Image {
            src,
            alt,
            x,
            y,
            w,
            h,
        } => Op::Image {
            src,
            alt,
            x,
            y,
            w,
            h,
        },
    }
}

/// the ops of a line of a text box: its glyphs, as `part`, and what is
/// drawn with them, the fill of inline code, the line under a link and the
/// link
#[allow(clippy::too_many_arguments)]
fn push_text_ops(
    ops: &mut Vec<(Op, Part)>,
    fonts: &Fonts,
    boxed: &TextBox,
    line: usize,
    dx: f32,
    dy: f32,
    role: Role,
    part: Part,
) {
    let (ox, oy) = (dx + boxed.x, dy + boxed.y);
    let lines = boxed.lines();
    let Some(info) = lines.get(line) else {
        return;
    };
    // a link's text and its annotation are the link's parts
    let link_parts = |run_ink| match (part, crate::fonts::ink_link(run_ink)) {
        (Part::Text { item, text }, Some(link)) => (
            Part::Linked { item, text, link },
            Part::Link { item, text, link },
        ),
        _ => (part, part),
    };
    let decoration = match part {
        Part::Band { .. } => part,
        _ => Part::Decoration,
    };
    for mut run in boxed.glyph_runs(fonts, line) {
        for glyph in &mut run.glyphs {
            glyph.x += ox;
            glyph.y += oy;
        }
        run.baseline += oy;
        run.x += ox;
        if run.ink & INK_CODE != 0 {
            let op = Op::Rect {
                x: run.x - 1.0,
                y: oy + info.top,
                w: run.width + 2.0,
                h: info.bottom - info.top,
                role: Role::CodeFill,
            };
            ops.push((op, decoration));
        }
        if let Some((offset, thickness)) = run.underline {
            let op = Op::Rect {
                x: run.x,
                y: run.baseline + offset,
                w: run.width,
                h: thickness,
                role: if role == Role::Text {
                    Role::LinkLine
                } else {
                    role
                },
            };
            ops.push((op, decoration));
        }
        if let Some(href) = boxed.link_of(run.ink) {
            let op = Op::Link {
                href: href.to_string(),
                x: run.x,
                y: oy + info.top,
                w: run.width,
                h: info.bottom - info.top,
            };
            ops.push((op, link_parts(run.ink).1));
        }
        if run.glyphs.is_empty() {
            continue;
        }
        let glyphs = link_parts(run.ink).0;
        let op = Op::Glyphs {
            run,
            role,
            text: boxed.text.clone(),
        };
        ops.push((op, glyphs));
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

//! Painting: what a page shows, as glyph runs, rectangles, images and
//! links, with its header and footer.

use parley::Alignment;

use super::Engine;
use crate::bands::{BAND_DISTANCE, BAND_LINE};
use crate::fonts::{Fonts, INK_CODE, INK_UNDERLINE};
use crate::items::{leaders, Deco, Role};
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
    /// the page number of a table of contents' entry
    TocNumber { item: usize, entry: usize },
    /// the link of a table of contents' entry to its heading
    TocLink { item: usize, entry: usize },
    /// what only the screen shows, as what an empty table of contents will
    /// hold or the placeholder of an empty field: the PDF leaves it out
    Hint { item: usize },
    /// the header or the footer of the page
    Band { footer: bool },
    /// a table's header rows, repeated on a page the table goes on: they
    /// are in the structure once, where they first are
    Repeat,
}

/// the start of the link of a table of contents' entry, followed by the
/// entry's number: the PDF makes it a link to the heading, and the editor
/// scrolls to it
pub const TOC_LINK: &str = "#toc:";

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
                    // the box of a picture to come is the screen's only
                    Deco::Rect { .. } => match &item.content {
                        Content::Text(text) if text.picture && text.text.is_empty() => {
                            Part::Hint { item: frag.item }
                        }
                        _ => Part::Decoration,
                    },
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
                // not to another column of a grid, which stands beside it
                let next = (index + 1 < range.end)
                    .then(|| self.frags[index + 1])
                    .filter(|next| !item.beside(&self.items[next.item]));
                if let Some(next) = next {
                    if !last_unit || item.bars_continue {
                        height = next.y - frag.y;
                    }
                }
                let column = item.edges(&self.settings).0;
                for bar in &item.bars {
                    let op = Op::Rect {
                        x: left + column + bar,
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
                    // a table's caption and a table of contents' title
                    // are text; an image's alt text a hint
                    let role =
                        if matches!(item.content, Content::Table { .. } | Content::Toc { .. }) {
                            Role::Text
                        } else {
                            Role::Hint
                        };
                    // what an empty text says is the screen's only
                    let part = match item.content {
                        Content::Text(_) => Part::Hint { item: frag.item },
                        _ => Part::Label { item: frag.item },
                    };
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
            // a table of contents' page number and the link to its heading
            // a table of contents' entry: its page number, the dots up to
            // it and its link to the heading, once the heading is placed
            let entry = laid.toc.as_ref().and_then(|toc| {
                let entry = toc.entry_at(frag.unit)?;
                let label = self.toc_labels(frag.item)?.get(entry)?;
                let boxed = self.number_box(label, toc.entries[entry].style)?;
                Some((toc, entry, boxed))
            });
            if let Some((toc, entry, boxed)) = entry {
                let line = &toc.entries[entry];
                let baseline = boxed.lines().first().map_or(0.0, |info| info.baseline);
                // the number's left, in the item's coordinates
                let left = toc.x + toc.width - boxed.layout.width();
                for dot in leaders(line, left) {
                    ops.push((deco_op(dot.moved(dx, dy)), Part::Decoration));
                }
                let (x, y) = (dx + left - boxed.x, dy + line.baseline - baseline - boxed.y);
                let part = Part::TocNumber {
                    item: frag.item,
                    entry,
                };
                push_text_ops(&mut ops, &self.fonts, boxed, 0, x, y, Role::Text, part);
                let start = laid.extras.get(entry).map_or(toc.x, |(text, _)| text.x);
                let link = Op::Link {
                    href: format!("{TOC_LINK}{entry}"),
                    x: dx + start,
                    y: frag.y,
                    w: toc.x + toc.width - start,
                    h: unit.height,
                };
                let part = Part::TocLink {
                    item: frag.item,
                    entry,
                };
                ops.push((link, part));
            }
            // the list markers and alt texts in a table's cells, and the
            // entries of a table of contents, or what an empty one will hold
            for extra in unit.extras.clone() {
                let (boxed, role) = &laid.extras[extra];
                let part = if frag.repeat {
                    Part::Repeat
                } else if laid.toc.is_some() && *role == Role::Hint {
                    Part::Hint { item: frag.item }
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
                // a link's underline is softer than the text, an underline
                // the text's own, also on a link
                role: if role == Role::Text && run.ink & INK_UNDERLINE == 0 {
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
                align: None,
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
    fn aligns_an_image_like_its_paragraph() {
        let x_of = |align: Option<&str>| {
            let image = Item {
                content: Content::Image {
                    pos: 0,
                    src: "a.png".into(),
                    width: 100.0,
                    height: 50.0,
                    alt: String::new(),
                    align: align.map(String::from),
                },
                ..paragraph(0, "")
            };
            engine(vec![image])
                .page_ops(0, false)
                .iter()
                .find_map(|op| match op {
                    Op::Image { x, .. } => Some(*x),
                    _ => None,
                })
                .unwrap()
        };
        let (left, center, right) = (x_of(None), x_of(Some("center")), x_of(Some("right")));
        assert!(right - left > 100.0, "{left} {right}");
        assert!(((center - left) * 2.0 - (right - left)).abs() < 0.5);
    }

    #[test]
    fn aligns_a_paragraph_and_keeps_the_caret_on_its_text() {
        let caret_x = |align: Option<&str>| {
            let mut item = paragraph(1, "Hi");
            if let Content::Text(text) = &mut item.content {
                text.align = align.map(String::from);
            }
            engine(vec![item]).caret(1, false).unwrap().1
        };
        let (left, center, right) = (
            caret_x(None),
            caret_x(Some("center")),
            caret_x(Some("right")),
        );
        assert!(center > left + 100.0, "{left} {center}");
        assert!(right > center + 100.0, "{center} {right}");
        // justify leaves a paragraph's only line as it is
        assert_eq!(caret_x(Some("justify")), left);
    }

    #[test]
    fn underlines_text_in_its_ink_and_links_softer() {
        let lines = |underline: bool, link: bool| {
            let mut item = paragraph(1, "word");
            if let Content::Text(text) = &mut item.content {
                text.spans = vec![crate::model::Span {
                    from: 0,
                    to: 4,
                    underline,
                    link: link.then(|| "https://example.org".into()),
                    ..Default::default()
                }];
            }
            engine(vec![item])
                .page_ops(0, false)
                .iter()
                .filter_map(|op| match op {
                    Op::Rect { role, .. } if matches!(role, Role::Text | Role::LinkLine) => {
                        Some(*role)
                    }
                    _ => None,
                })
                .collect::<Vec<_>>()
        };
        assert_eq!(lines(true, false), [Role::Text]);
        assert_eq!(lines(false, true), [Role::LinkLine]);
        // one line under an underlined link, in the text's ink
        assert_eq!(lines(true, true), [Role::Text]);
        assert!(lines(false, false).is_empty());
    }

    #[test]
    fn shows_a_boxed_item_as_its_label_in_an_outline() {
        let boxed = Item {
            content: Content::Boxed {
                pos: 1,
                label: "Block Blank can't show".into(),
            },
            ..paragraph(0, "")
        };
        let mut engine = engine(vec![paragraph(3, "after"), boxed.clone()]);
        engine.set_items(vec![boxed, paragraph(3, "after")]);
        let ops = engine.page_ops(0, false);
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
        assert!(hint.starts_with("Block"));
        let outline = ops
            .iter()
            .filter(|op| {
                matches!(
                    op,
                    Op::Rect {
                        role: Role::TableLine,
                        ..
                    }
                )
            })
            .count();
        assert_eq!(outline, 4);
        // the label isn't text of the document: the item stands for one
        // position, like a rule
        assert!(engine.laid[0].texts.is_empty());
        assert_eq!((engine.items[0].from(), engine.items[0].to()), (1, 2));
        assert!(engine.laid[0].units[0].height > 16.0);
    }

    #[test]
    fn says_what_an_empty_text_holds_on_the_screen_only() {
        let mut empty = paragraph(1, "");
        if let Content::Text(text) = &mut empty.content {
            text.hint = Some("Recipe name".into());
        }
        let engine = engine(vec![empty]);
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
        assert!(!hint.is_empty());
        assert!(hint.iter().all(|part| *part == Part::Hint { item: 0 }));
        // the caret is in the empty text, not in the hint
        assert!(engine.laid[0].texts[0].empty());
        // a hint that wraps takes the room it needs
        let mut long = paragraph(1, "");
        if let Content::Text(text) = &mut long.content {
            text.hint = Some("word ".repeat(80));
        }
        let wrapped = super::super::test_support::engine(vec![long]);
        let label = wrapped.laid[0].label.as_ref().unwrap();
        assert!(label.line_count() > 1);
        assert!(wrapped.laid[0].units[0].height >= label.height());
        // a text that isn't empty says nothing more
        let mut typed = paragraph(1, "Pancakes");
        if let Content::Text(text) = &mut typed.content {
            text.hint = Some("Recipe name".into());
        }
        assert!(super::super::test_support::engine(vec![typed]).laid[0]
            .label
            .is_none());
    }

    #[test]
    fn shows_a_picture_to_come_as_a_box_on_the_screen_only() {
        let mut empty = paragraph(1, "");
        if let Content::Text(text) = &mut empty.content {
            text.hint = Some("A photo of it".into());
            text.picture = true;
        }
        let engine = engine(vec![empty]);
        let width = engine.settings.content_width();
        let laid = &engine.laid[0];
        // as high as a picture would be, what it says in its middle
        let height = laid.units[0].height;
        assert!((height - (width * 0.6).min(220.0)).abs() < 0.01);
        let label = laid.label.as_ref().unwrap();
        assert!((label.y + label.height() / 2.0 - height / 2.0).abs() < 0.01);
        let boxes: Vec<Part> = engine
            .body_parts(0)
            .into_iter()
            .filter_map(|(op, part)| match op {
                Op::Rect {
                    role: Role::Placeholder,
                    h,
                    ..
                } if (h - height).abs() < 0.01 => Some(part),
                _ => None,
            })
            .collect();
        assert_eq!(boxes, vec![Part::Hint { item: 0 }]);
        // the caret is in the empty text, at the box's top
        assert!(laid.texts[0].empty());
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

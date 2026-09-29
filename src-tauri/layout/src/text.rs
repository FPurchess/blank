//! Laying out one textblock with Parley: line breaking, bidi, shaping and
//! the cursor geometry, in points.

use parley::{
    Affinity, Alignment, AlignmentOptions, Cursor, FontFamily, FontStyle, FontWeight, Layout,
    LineHeight, PositionedLayoutItem, Selection, StyleProperty,
};

use crate::fonts::{ink_link, Fonts, Ink, INK_CODE};
use crate::model::{byte_of_utf16, utf16_len, utf16_of_byte, Span, Text};
use crate::style::{text_style, TextStyle, BOLD, FONT_STACK, MEDIUM};

/// A laid out textblock and where it stands in its item.
pub struct TextBox {
    pub layout: Layout<Ink>,
    /// the text as laid out: a space for an empty block, which still takes
    /// a line
    pub text: String,
    /// the length of the block's text in ProseMirror positions
    pub len: u32,
    /// the ProseMirror position of its first character
    pub pos: u32,
    pub links: Vec<String>,
    /// where it stands in its item, in points
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub style: TextStyle,
}

/// one glyph, positioned on the page
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Glyph {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub advance: f32,
    /// its offsets from the pen, which the PDF takes as they are
    pub dx: f32,
    pub dy: f32,
    /// the bytes of the text its cluster covers
    pub start: u32,
    pub end: u32,
}

/// a run of glyphs in one font, size and ink
#[derive(Clone, Debug, PartialEq)]
pub struct GlyphRun {
    pub font: usize,
    pub size: f32,
    pub ink: Ink,
    pub glyphs: Vec<Glyph>,
    /// the underline of a link: its offset below the baseline and thickness
    pub underline: Option<(f32, f32)>,
    pub baseline: f32,
    pub x: f32,
    pub width: f32,
}

pub struct LineInfo {
    pub top: f32,
    pub bottom: f32,
    pub baseline: f32,
    pub start: usize,
    pub end: usize,
}

fn weight(bold: bool, style: &TextStyle) -> f32 {
    if bold {
        BOLD
    } else {
        style.weight
    }
}

impl TextBox {
    /// lays out `text` in `width` points
    pub fn new(fonts: &mut Fonts, text: &Text, width: f32, alignment: Alignment) -> TextBox {
        let style = text_style(&text.style);
        let len = utf16_len(&text.text);
        let laid_text = if text.text.is_empty() {
            " ".to_string()
        } else {
            text.text.clone()
        };
        let mut links: Vec<String> = vec![];
        let layout = {
            let Fonts { fcx, lcx, .. } = fonts;
            let mut builder = lcx.ranged_builder(fcx, &laid_text, 1.0, false);
            builder.push_default(StyleProperty::FontFamily(FontFamily::Source(
                FONT_STACK.into(),
            )));
            builder.push_default(StyleProperty::FontSize(style.size));
            builder.push_default(StyleProperty::LineHeight(LineHeight::Absolute(style.line)));
            builder.push_default(StyleProperty::FontWeight(FontWeight::new(style.weight)));
            if style.italic {
                builder.push_default(StyleProperty::FontStyle(FontStyle::Italic));
            }
            if style.tracking != 0.0 {
                builder.push_default(StyleProperty::LetterSpacing(style.tracking));
            }
            // no ligatures, like the editor, so every character is a cluster
            // of its own for the cursor
            builder.push_default(StyleProperty::FontFeatures("\"liga\" 0, \"clig\" 0".into()));
            if !text.text.is_empty() {
                for span in &text.spans {
                    let range =
                        byte_of_utf16(&laid_text, span.from)..byte_of_utf16(&laid_text, span.to);
                    if range.is_empty() {
                        continue;
                    }
                    push_span(&mut builder, span, range, &style, &mut links);
                }
            }
            builder.build(&laid_text)
        };
        let mut boxed = TextBox {
            layout,
            text: laid_text,
            len,
            pos: text.pos,
            links,
            x: 0.0,
            y: 0.0,
            width,
            style,
        };
        boxed.layout.break_all_lines(Some(width));
        boxed.layout.align(
            alignment,
            AlignmentOptions {
                align_when_overflowing: false,
            },
        );
        boxed
    }

    pub fn empty(&self) -> bool {
        self.len == 0
    }

    pub fn height(&self) -> f32 {
        self.layout.height()
    }

    pub fn lines(&self) -> Vec<LineInfo> {
        self.layout
            .lines()
            .map(|line| {
                let metrics = line.metrics();
                let range = line.text_range();
                LineInfo {
                    top: metrics.block_min_coord,
                    bottom: metrics.block_max_coord,
                    baseline: metrics.baseline,
                    start: range.start,
                    end: range.end,
                }
            })
            .collect()
    }

    pub fn line_count(&self) -> usize {
        self.layout.len()
    }

    /// the glyph runs of a line, in the box's own coordinates
    pub fn glyph_runs(&self, fonts: &Fonts, line_index: usize) -> Vec<GlyphRun> {
        let mut result = vec![];
        if self.empty() {
            return result;
        }
        let Some(line) = self.layout.get(line_index) else {
            return result;
        };
        // the glyphs of each run with their clusters, which the glyph runs
        // of a line split by style
        let mut taken: Vec<(usize, usize)> = vec![];
        for item in line.items() {
            let PositionedLayoutItem::GlyphRun(run) = item else {
                continue;
            };
            let parley_run = run.run();
            let index = parley_run.index();
            let mut clustered: Vec<(parley::Glyph, std::ops::Range<usize>)> = vec![];
            for cluster in parley_run.visual_clusters() {
                let range = cluster.text_range();
                for glyph in cluster.glyphs() {
                    clustered.push((glyph, range.clone()));
                }
            }
            let skip = match taken.iter_mut().find(|(run, _)| *run == index) {
                Some((_, count)) => *count,
                None => {
                    taken.push((index, 0));
                    0
                }
            };
            let count = run.glyphs().count();
            if let Some((_, taken)) = taken.iter_mut().find(|(run, _)| *run == index) {
                *taken += count;
            }
            let size = parley_run.font_size();
            let mut pen = run.offset();
            let baseline = run.baseline();
            let glyphs: Vec<Glyph> = clustered
                .into_iter()
                .skip(skip)
                .take(count)
                .map(|(glyph, range)| {
                    let positioned = Glyph {
                        id: glyph.id,
                        x: pen + glyph.x,
                        y: baseline + glyph.y,
                        advance: glyph.advance,
                        dx: glyph.x,
                        dy: glyph.y,
                        start: range.start as u32,
                        end: range.end as u32,
                    };
                    pen += glyph.advance;
                    positioned
                })
                .collect();
            let ink = run.style().brush;
            let font = fonts.index_of(parley_run.font());
            let underline = run.style().underline.as_ref().map(|_| {
                let (offset, thickness) = fonts.files[font].underline;
                (offset * size, thickness * size)
            });
            if glyphs.is_empty() && ink & INK_CODE == 0 {
                continue;
            }
            result.push(GlyphRun {
                font,
                size,
                ink,
                glyphs,
                underline,
                baseline,
                x: run.offset(),
                width: run.advance(),
            });
        }
        result
    }

    /// the link of a glyph run
    pub fn link_of(&self, ink: Ink) -> Option<&str> {
        ink_link(ink).and_then(|index| self.links.get(index).map(String::as_str))
    }

    /// the byte index of a ProseMirror position in this box
    pub fn byte_of(&self, pos: u32) -> usize {
        if self.empty() {
            return 0;
        }
        byte_of_utf16(&self.text, pos.saturating_sub(self.pos).min(self.len))
    }

    /// the ProseMirror position of a byte index
    pub fn pos_of(&self, byte: usize) -> u32 {
        if self.empty() {
            return self.pos;
        }
        self.pos + utf16_of_byte(&self.text, byte)
    }

    /// where the cursor stands at a position: its line and rectangle in the
    /// box's own coordinates
    pub fn caret(&self, pos: u32, after: bool) -> (usize, f32, f32, f32) {
        let byte = self.byte_of(pos);
        let affinity = if after {
            Affinity::Upstream
        } else {
            Affinity::Downstream
        };
        let cursor = Cursor::from_byte_index(&self.layout, byte, affinity);
        let rect = cursor.geometry(&self.layout, 0.0);
        let line = self.line_at((rect.y0 + rect.y1) as f32 / 2.0);
        (
            line,
            rect.x0 as f32,
            rect.y0 as f32,
            (rect.y1 - rect.y0) as f32,
        )
    }

    /// the line at a height, or the nearest
    pub fn line_at(&self, y: f32) -> usize {
        let lines = self.lines();
        lines
            .iter()
            .position(|line| y < line.bottom)
            .unwrap_or(lines.len().saturating_sub(1))
    }

    /// the position nearest to a point in the box's coordinates
    pub fn hit(&self, x: f32, y: f32) -> u32 {
        let cursor = Cursor::from_point(&self.layout, x, y);
        self.pos_of(cursor.index())
    }

    /// the word at a point, as ProseMirror positions
    pub fn word(&self, x: f32, y: f32) -> (u32, u32) {
        let range = Selection::word_from_point(&self.layout, x, y).text_range();
        (self.pos_of(range.start), self.pos_of(range.end))
    }

    /// the first and last position of a line
    pub fn line_bounds(&self, line: usize) -> (u32, u32) {
        let lines = self.lines();
        let Some(info) = lines.get(line) else {
            return (self.pos, self.pos + self.len);
        };
        let mut end = info.end;
        // before the space or line break the line ends with, unless it is
        // the last line
        if line + 1 < lines.len() {
            while end > info.start && self.text[..end].ends_with(|c: char| c.is_whitespace()) {
                end = self.text[..end]
                    .char_indices()
                    .last()
                    .map(|(index, _)| index)
                    .unwrap_or(info.start);
            }
        }
        (self.pos_of(info.start), self.pos_of(end))
    }

    /// the selection's rectangles between two byte indexes, in the box's
    /// coordinates, with the line each is on
    pub fn selection(&self, from: usize, to: usize) -> Vec<(usize, f32, f32, f32, f32)> {
        let selection = Selection::new(
            Cursor::from_byte_index(&self.layout, from, Affinity::Downstream),
            Cursor::from_byte_index(&self.layout, to, Affinity::Upstream),
        );
        selection
            .geometry(&self.layout)
            .into_iter()
            .map(|(rect, line)| {
                (
                    line,
                    rect.x0 as f32,
                    rect.y0 as f32,
                    (rect.x1 - rect.x0) as f32,
                    (rect.y1 - rect.y0) as f32,
                )
            })
            .collect()
    }
}

fn push_span(
    builder: &mut parley::RangedBuilder<'_, Ink>,
    span: &Span,
    range: std::ops::Range<usize>,
    style: &TextStyle,
    links: &mut Vec<String>,
) {
    if span.bold {
        builder.push(
            StyleProperty::FontWeight(FontWeight::new(weight(true, style))),
            range.clone(),
        );
    } else if style.weight == MEDIUM {
        // medium headings stay medium
    }
    if span.italic {
        builder.push(StyleProperty::FontStyle(FontStyle::Italic), range.clone());
    }
    let mut ink: Ink = 0;
    if let Some(href) = &span.link {
        links.push(href.clone());
        ink |= links.len() as Ink;
        builder.push(StyleProperty::Underline(true), range.clone());
    }
    if span.code {
        ink |= INK_CODE;
    }
    if ink != 0 {
        builder.push(StyleProperty::Brush(ink), range);
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fonts::repository_fonts;

    fn text(value: &str) -> Text {
        Text {
            pos: 1,
            text: value.into(),
            ..Default::default()
        }
    }

    #[test]
    fn breaks_lines_at_the_width() {
        let mut fonts = repository_fonts();
        let words = "The quick brown fox jumps over the lazy dog. ".repeat(6);
        let wide = TextBox::new(&mut fonts, &text(&words), 1000.0, Alignment::Start);
        let narrow = TextBox::new(&mut fonts, &text(&words), 200.0, Alignment::Start);
        assert_eq!(wide.line_count(), 2);
        assert!(narrow.line_count() >= 6, "{}", narrow.line_count());
        // lines are as high as the style says, 11 pt at 1.3 × 1.12
        let lines = narrow.lines();
        assert!((lines[0].bottom - lines[0].top - 16.016).abs() < 0.01);
        assert!((lines[1].top - lines[0].bottom).abs() < 0.01);
        // no line is wider than the box
        for index in 0..narrow.line_count() {
            for run in narrow.glyph_runs(&fonts, index) {
                for glyph in run.glyphs {
                    let text = &narrow.text[glyph.start as usize..glyph.end as usize];
                    assert!(text == " " || glyph.x + glyph.advance <= 200.5);
                }
            }
        }
    }

    #[test]
    fn empty_blocks_take_a_line() {
        let mut fonts = repository_fonts();
        let empty = TextBox::new(&mut fonts, &text(""), 300.0, Alignment::Start);
        assert_eq!(empty.line_count(), 1);
        assert!((empty.height() - 16.016).abs() < 0.01);
        assert_eq!(empty.caret(1, false).1, 0.0);
        assert!(empty.glyph_runs(&fonts, 0).is_empty());
        assert_eq!(empty.hit(50.0, 5.0), 1);
    }

    #[test]
    fn maps_positions_and_points() {
        let mut fonts = repository_fonts();
        let boxed = TextBox::new(&mut fonts, &text("Hello world"), 300.0, Alignment::Start);
        let (line, x, _, height) = boxed.caret(1 + 5, false);
        assert_eq!(line, 0);
        assert!(x > 20.0 && x < 40.0, "{x}");
        assert!(height > 10.0);
        assert_eq!(boxed.hit(x + 0.5, 5.0), 6);
        assert_eq!(boxed.hit(-10.0, 5.0), 1);
        assert_eq!(boxed.hit(1000.0, 5.0), 12);
        assert_eq!(boxed.word(x + 10.0, 5.0), (7, 12));
    }

    #[test]
    fn falls_back_to_dejavu() {
        let mut fonts = repository_fonts();
        let boxed = TextBox::new(&mut fonts, &text("a ⇒ b"), 300.0, Alignment::Start);
        let runs = boxed.glyph_runs(&fonts, 0);
        assert!(
            runs.iter().any(|run| run.font == 6),
            "{:?}",
            runs.iter().map(|r| r.font).collect::<Vec<_>>()
        );
        assert!(runs.iter().any(|run| run.font == 0));
    }

    #[test]
    fn styles_spans() {
        let mut fonts = repository_fonts();
        let mut styled = text("plain bold link");
        styled.spans = vec![
            Span {
                from: 6,
                to: 10,
                bold: true,
                ..Default::default()
            },
            Span {
                from: 11,
                to: 15,
                link: Some("https://example.com".into()),
                ..Default::default()
            },
        ];
        let boxed = TextBox::new(&mut fonts, &styled, 300.0, Alignment::Start);
        let runs = boxed.glyph_runs(&fonts, 0);
        assert!(runs.iter().any(|run| run.font == 4));
        let link = runs.iter().find(|run| run.underline.is_some()).unwrap();
        assert_eq!(boxed.link_of(link.ink), Some("https://example.com"));
        assert!(link.underline.unwrap().0 > 0.0);
    }
}

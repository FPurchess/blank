//! Laying out one textblock with Parley: line breaking, bidi, shaping and
//! the cursor geometry, in points.

use std::sync::Arc;

use parley::{
    Affinity, Alignment, AlignmentOptions, Cursor, FontStyle, FontWeight, Layout, LineHeight,
    OverflowWrap, PositionedLayoutItem, Selection, StyleProperty,
};

use crate::fonts::{family_list, ink_link, Fonts, Ink, INK_CODE};
use crate::model::{byte_of_utf16, utf16_len, utf16_of_byte, Span, Text};
use crate::style::{text_style, TextStyle, BOLD, CODE_SCALE};

/// A laid out textblock and where it stands in its item.
pub struct TextBox {
    pub layout: Layout<Ink>,
    /// the text as laid out: a space for an empty block, which still takes
    /// a line; shared with the glyph runs painted from it
    pub text: Arc<str>,
    /// the length of the block's text in ProseMirror positions
    pub len: u32,
    /// the ProseMirror position of its first character
    pub pos: u32,
    pub links: Vec<String>,
    /// where it stands in its item, in points
    pub x: f32,
    pub y: f32,
    pub width: f32,
    /// the characters no font had a glyph for, see Engine::missing
    pub missing: Vec<char>,
    /// its lines, as Parley broke them
    lines: Vec<LineInfo>,
    /// the font index of each of its runs, by its line and Parley's index
    /// of the run in it: a face, or an instance of a variable one, see
    /// `Fonts::font_of`
    pub run_fonts: Vec<((usize, usize), usize)>,
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

#[derive(Clone, Copy, Debug, PartialEq)]
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
            let Fonts {
                fcx,
                lcx,
                stack,
                mono_stack,
                ..
            } = fonts;
            let mut builder = lcx.ranged_builder(fcx, &laid_text, 1.0, false);
            let family = if style.mono { &*mono_stack } else { &*stack };
            builder.push_default(StyleProperty::FontFamily(family_list(family)));
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
            // a word wider than the line, e.g. a long URL, breaks where it
            // must instead of running off the page, as the editor's CSS
            // (overflow-wrap) did
            builder.push_default(StyleProperty::OverflowWrap(OverflowWrap::Anywhere));
            if !text.text.is_empty() {
                for span in &text.spans {
                    let range =
                        byte_of_utf16(&laid_text, span.from)..byte_of_utf16(&laid_text, span.to);
                    if range.is_empty() {
                        continue;
                    }
                    push_span(&mut builder, span, range, &style, mono_stack, &mut links);
                }
            }
            builder.build(&laid_text)
        };
        let mut boxed = TextBox {
            layout,
            text: laid_text.into(),
            len,
            pos: text.pos,
            links,
            x: 0.0,
            y: 0.0,
            width,
            missing: vec![],
            lines: vec![],
            run_fonts: vec![],
        };
        boxed.layout.break_all_lines(Some(width));
        boxed.layout.align(
            alignment,
            AlignmentOptions {
                align_when_overflowing: false,
            },
        );
        boxed.lines = boxed.read_lines();
        boxed.missing = boxed.notdef();
        boxed.run_fonts = boxed.fonts_of_runs(fonts);
        boxed
    }

    /// the font index of each run, at the coordinates Parley set a variable
    /// font at, e.g. its bold
    fn fonts_of_runs(&self, fonts: &mut Fonts) -> Vec<((usize, usize), usize)> {
        let mut found: Vec<((usize, usize), usize)> = vec![];
        for (line_index, line) in self.layout.lines().enumerate() {
            for item in line.items() {
                let PositionedLayoutItem::GlyphRun(run) = item else {
                    continue;
                };
                let parley_run = run.run();
                let index = (line_index, parley_run.index());
                if found.iter().any(|(known, _)| *known == index) {
                    continue;
                }
                let variations: Vec<([u8; 4], f32)> = parley_run
                    .synthesis()
                    .variation_settings()
                    .iter()
                    .map(|(tag, value)| (tag.to_be_bytes(), *value))
                    .collect();
                let font = fonts.font_of(
                    parley_run.font(),
                    &variations,
                    parley_run.normalized_coords(),
                );
                found.push((index, font));
            }
        }
        found
    }

    /// the characters laid out as the missing glyph, which no font has
    fn notdef(&self) -> Vec<char> {
        let mut missing: Vec<char> = vec![];
        if self.empty() {
            return missing;
        }
        for line in self.layout.lines() {
            for item in line.items() {
                let PositionedLayoutItem::GlyphRun(run) = item else {
                    continue;
                };
                // a cluster's text with the marks and ligature parts that
                // belong to it: a mark no font has is in the base letter's
                // cluster, which Parley gives only the letter's text
                let ranges = cluster_ranges(run.run());
                for cluster in run.run().visual_clusters() {
                    if cluster.glyphs().any(|glyph| glyph.id == 0) {
                        let own = cluster.text_range();
                        let range = ranges
                            .iter()
                            .find(|(known, _)| *known == own)
                            .map_or(own, |(_, text)| text.clone());
                        for char in self.text[range].chars() {
                            if !char.is_whitespace()
                                && !char.is_control()
                                && !missing.contains(&char)
                            {
                                missing.push(char);
                            }
                        }
                    }
                }
            }
        }
        missing
    }

    pub fn empty(&self) -> bool {
        self.len == 0
    }

    pub fn height(&self) -> f32 {
        self.layout.height()
    }

    /// its lines, as Parley broke them
    pub fn lines(&self) -> &[LineInfo] {
        &self.lines
    }

    fn read_lines(&self) -> Vec<LineInfo> {
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
            let ranges = cluster_ranges(parley_run);
            let mut clustered: Vec<(parley::Glyph, std::ops::Range<usize>)> = vec![];
            for cluster in parley_run.visual_clusters() {
                let range = cluster.text_range();
                let range = ranges
                    .iter()
                    .find(|(own, _)| *own == range)
                    .map_or(range, |(_, text)| text.clone());
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
            let font = self
                .run_fonts
                .iter()
                .find(|(run, _)| *run == (line_index, index))
                .map_or_else(|| fonts.index_of(parley_run.font()), |(_, font)| *font);
            let underline = run.style().underline.as_ref().map(|_| {
                let (offset, thickness) = fonts
                    .face(font)
                    .map_or((0.1, 0.05), |(file, _)| file.underline);
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
        self.pos.saturating_add(utf16_of_byte(&self.text, byte))
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
            return (self.pos, self.pos.saturating_add(self.len));
        };
        (self.pos_of(info.start), self.pos_of(self.end_byte(line)))
    }

    /// the byte a line ends at: before the space or line break it ends
    /// with, unless it is the last line
    fn end_byte(&self, line: usize) -> usize {
        let lines = self.lines();
        let Some(info) = lines.get(line) else {
            return self.text.len();
        };
        let mut end = info.end;
        // at a hard break, before the break only: the spaces before it are
        // text, as the editor keeps them
        if line + 1 < lines.len() && self.text[..end].ends_with('\n') {
            return end - 1;
        }
        if line + 1 < lines.len() {
            while end > info.start && self.text[..end].ends_with(|c: char| c.is_whitespace()) {
                end = self.text[..end]
                    .char_indices()
                    .last()
                    .map(|(index, _)| index)
                    .unwrap_or(info.start);
            }
        }
        end
    }

    /// the end of a line, and whether the caret there must be painted with
    /// the line before it (`after`, as `caret` takes it): true where a word
    /// wider than the line was broken, so the line's end is also where the
    /// next one starts
    pub fn line_end(&self, line: usize) -> (u32, bool) {
        let end = self.end_byte(line);
        let next_start = self.lines().get(line + 1).map(|next| next.start);
        (self.pos_of(end), next_start == Some(end))
    }

    /// the position on a line nearest to `x`, in the box's coordinates, and
    /// whether the caret there is painted on this line as the end of it
    /// (`after`). Past the end of the line, that is its end, never the
    /// start of the next line.
    pub fn hit_line(&self, line: usize, x: f32) -> (u32, bool) {
        let lines = self.lines();
        let Some(info) = lines.get(line) else {
            return (self.pos, false);
        };
        let cursor = Cursor::from_point(&self.layout, x, (info.top + info.bottom) / 2.0);
        let byte = cursor.index();
        if line + 1 < lines.len() && byte >= self.end_byte(line) {
            return self.line_end(line);
        }
        (self.pos_of(byte), false)
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

/// the text each cluster with glyphs stands for, by the cluster's own
/// range: its own text, and that of the clusters without glyphs that
/// continue its ligature, a combining mark or the other letters of a
/// ligature (lam-alef, a conjunct). Parley gives those no glyphs, so their
/// text would be lost in the PDF, for copying and searching. In a run left
/// to right they follow the cluster they belong to, and right to left they
/// come before it, in the order of the text. Other clusters without glyphs,
/// e.g. a line break, stand for no glyph's text.
fn cluster_ranges(
    run: &parley::Run<'_, Ink>,
) -> Vec<(std::ops::Range<usize>, std::ops::Range<usize>)> {
    let clusters: Vec<(std::ops::Range<usize>, bool, bool)> = run
        .clusters()
        .map(|cluster| {
            (
                cluster.text_range(),
                cluster.glyphs().next().is_some(),
                cluster.is_ligature_continuation(),
            )
        })
        .collect();
    let mut ranges: Vec<(std::ops::Range<usize>, std::ops::Range<usize>)> = clusters
        .iter()
        .filter(|(_, glyphs, _)| *glyphs)
        .map(|(range, ..)| (range.clone(), range.clone()))
        .collect();
    if ranges.is_empty() {
        return ranges;
    }
    let bearers: Vec<usize> = (0..clusters.len())
        .filter(|&index| clusters[index].1)
        .collect();
    for (index, (range, glyphs, continuation)) in clusters.iter().enumerate() {
        if *glyphs || !continuation {
            continue;
        }
        let before = bearers.iter().rposition(|&bearer| bearer < index);
        let after = bearers.iter().position(|&bearer| bearer > index);
        let owner = if run.is_rtl() {
            after.or(before)
        } else {
            before.or(after)
        };
        if let Some(owner) = owner {
            let text = &mut ranges[owner].1;
            *text = text.start.min(range.start)..text.end.max(range.end);
        }
    }
    ranges
}

fn push_span(
    builder: &mut parley::RangedBuilder<'_, Ink>,
    span: &Span,
    range: std::ops::Range<usize>,
    style: &TextStyle,
    mono_stack: &[String],
    links: &mut Vec<String>,
) {
    // inline code in IBM Plex Mono, a little smaller than the text around it
    if span.code && !style.mono {
        builder.push(
            StyleProperty::FontFamily(family_list(mono_stack)),
            range.clone(),
        );
        builder.push(
            StyleProperty::FontSize(style.size * CODE_SCALE),
            range.clone(),
        );
    }
    if span.bold {
        builder.push(
            StyleProperty::FontWeight(FontWeight::new(weight(true, style))),
            range.clone(),
        );
    }
    if span.italic {
        builder.push(StyleProperty::FontStyle(FontStyle::Italic), range.clone());
    }
    let mut ink: Ink = 0;
    // a link's number shares the ink's bits with code, so no more than fit
    if let Some(href) = span
        .link
        .as_ref()
        .filter(|_| links.len() < INK_CODE as usize - 1)
    {
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
    fn breaks_words_wider_than_the_line() {
        let mut fonts = repository_fonts();
        let long_word = "a".repeat(300);
        let url = format!("see https://example.com/{} here", "path/".repeat(60));
        for value in [long_word.as_str(), url.as_str()] {
            let boxed = TextBox::new(&mut fonts, &text(value), 200.0, Alignment::Start);
            assert!(boxed.line_count() > 3, "{}", boxed.line_count());
            for index in 0..boxed.line_count() {
                for run in boxed.glyph_runs(&fonts, index) {
                    for glyph in run.glyphs {
                        assert!(
                            glyph.x + glyph.advance <= 200.5,
                            "{} > 200",
                            glyph.x + glyph.advance
                        );
                    }
                }
            }
            // every position has one place, and the caret moves along the
            // forced breaks: each position's caret is after the one before
            let mut last = (0usize, -1.0f32);
            for pos in 1..=boxed.len {
                let (line, x, ..) = boxed.caret(1 + pos, false);
                assert!(line > last.0 || (line == last.0 && x >= last.1), "{pos}");
                assert_eq!(
                    boxed.hit(
                        x + 0.01,
                        (boxed.lines()[line].top + boxed.lines()[line].bottom) / 2.0
                    ),
                    1 + pos,
                    "{pos}"
                );
                last = (line, x);
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
    fn sets_every_style_in_its_own_face_of_plex() {
        let mut fonts = repository_fonts();
        // the faces by their place in FONT_FILES
        let face = |fonts: &mut Fonts, style: &str, span: Option<Span>| {
            let mut value = text("Words");
            value.style = style.into();
            value.spans = span.into_iter().collect();
            let boxed = TextBox::new(fonts, &value, 300.0, Alignment::Start);
            let runs = boxed.glyph_runs(fonts, 0);
            runs.iter().map(|run| run.font).collect::<Vec<_>>()
        };
        let whole = |bold: bool, italic: bool| {
            Some(Span {
                from: 0,
                to: 5,
                bold,
                italic,
                ..Default::default()
            })
        };
        assert_eq!(face(&mut fonts, "p", None), [0]);
        assert_eq!(face(&mut fonts, "p", whole(false, true)), [1]);
        assert_eq!(face(&mut fonts, "h1", None), [2]);
        assert_eq!(face(&mut fonts, "h1", whole(false, true)), [3]);
        assert_eq!(face(&mut fonts, "p", whole(true, false)), [4]);
        assert_eq!(face(&mut fonts, "p", whole(true, true)), [5]);
        assert_eq!(face(&mut fonts, "code", None), [10]);
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

    /// the text ranges of a line's glyphs, in the order they are painted
    fn glyph_ranges(value: &str) -> Vec<(u32, u32)> {
        let mut fonts = repository_fonts();
        let boxed = TextBox::new(&mut fonts, &text(value), 300.0, Alignment::Start);
        boxed
            .glyph_runs(&fonts, 0)
            .iter()
            .flat_map(|run| run.glyphs.iter().map(|glyph| (glyph.start, glyph.end)))
            .collect()
    }

    #[test]
    fn gives_marks_and_ligatures_their_text() {
        // é as e and a combining acute: one glyph for both
        assert_eq!(glyph_ranges("e\u{301}x"), [(0, 3), (3, 4)]);
        // lam-alef: one glyph for both letters, right to left
        assert_eq!(glyph_ranges("\u{644}\u{627}"), [(0, 4)]);
        // alef, lam-alef, meem: the lam goes with the alef after it
        assert_eq!(
            glyph_ranges("\u{627}\u{644}\u{627}\u{645}"),
            [(6, 8), (2, 6), (0, 2)]
        );
        // beh with a fatha: two glyphs, both for the two characters
        assert_eq!(
            glyph_ranges("\u{628}\u{64e}\u{628}"),
            [(4, 6), (0, 4), (0, 4)]
        );
        // shin with two points: three glyphs for all three
        assert_eq!(
            glyph_ranges("\u{5e9}\u{5b8}\u{5c1}"),
            [(0, 6), (0, 6), (0, 6)]
        );
        // a conjunct no font has: its missing glyphs stand for all of it
        assert_eq!(
            glyph_ranges("\u{915}\u{94d}\u{937}"),
            [(0, 6), (0, 6), (6, 9)]
        );
        // and plain text as it was, a line break standing for no glyph
        assert_eq!(glyph_ranges("ab"), [(0, 1), (1, 2)]);
        assert_eq!(glyph_ranges("a;\nb")[..2], [(0, 1), (1, 2)]);
    }

    /// the font index and first glyph of a crab, in bold or not, in the
    /// variable Noto Emoji
    fn crab(fonts: &mut Fonts, bold: bool) -> (usize, u32) {
        let mut value = text("\u{1f980}");
        value.spans = vec![Span {
            from: 0,
            to: 2,
            bold,
            ..Default::default()
        }];
        let boxed = TextBox::new(fonts, &value, 300.0, Alignment::Start);
        let runs = boxed.glyph_runs(fonts, 0);
        (runs[0].font, runs[0].glyphs[0].id)
    }

    #[test]
    fn sets_variable_fonts_at_their_coordinates() {
        let mut fonts = repository_fonts();
        let emoji = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fonts/NotoEmoji-VariableFont_wght.ttf"
        ))
        .unwrap();
        fonts.add(emoji, "Noto Emoji");
        let regular = crab(&mut fonts, false);
        let bold = crab(&mut fonts, true);
        // the regular weight is the face itself, the bold an instance of it
        assert_eq!(regular.0, fonts.files.len() - 1);
        assert_eq!(bold.0, crate::fonts::INSTANCE_BASE);
        assert_eq!(bold.1, regular.1);
        assert_eq!(fonts.instances[0].variations, [(*b"wght", 700.0)]);
        // painted with its own outline
        let (regular_path, bold_path) = (
            fonts.glyph_path(regular.0, regular.1),
            fonts.glyph_path(bold.0, bold.1),
        );
        assert!(!bold_path.is_empty());
        assert_ne!(regular_path, bold_path);
        assert_eq!(
            fonts.face(bold.0).unwrap().0.upem,
            fonts.face(regular.0).unwrap().0.upem
        );
        // the same instance again, and its number stays when fonts are
        // added after it
        assert_eq!(crab(&mut fonts, true).0, bold.0);
        let dejavu = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fonts/dejavu-sans-bold.ttf"
        ))
        .unwrap();
        fonts.add(dejavu, "Other");
        assert_eq!(fonts.glyph_path(bold.0, bold.1), bold_path);
        assert_eq!(fonts.share().glyph_path(bold.0, bold.1), bold_path);
    }

    #[test]
    fn keeps_each_run_in_its_font_on_every_line() {
        // inline code on several lines: Parley counts the runs of each
        // line from 0, so a run's font is known by its line and its index
        let mut fonts = repository_fonts();
        let words = "press Mod Alt N to jump to it and pick what you meant ".repeat(4);
        let mut value = text(&words);
        value.spans = words
            .match_indices("Alt")
            .map(|(index, _)| Span {
                from: index as u32,
                to: index as u32 + 3,
                code: true,
                ..Default::default()
            })
            .collect();
        let boxed = TextBox::new(&mut fonts, &value, 180.0, Alignment::Start);
        assert!(boxed.line_count() > 3);
        for line in 0..boxed.line_count() {
            for run in boxed.glyph_runs(&fonts, line) {
                let code = run.ink & INK_CODE != 0;
                assert_eq!(run.font, if code { 10 } else { 0 }, "line {line}");
            }
        }
    }

    #[test]
    fn ends_a_line_at_a_hard_break_after_its_spaces() {
        let mut fonts = repository_fonts();
        let boxed = TextBox::new(&mut fonts, &text("foo  \nbar"), 300.0, Alignment::Start);
        assert_eq!(boxed.line_count(), 2);
        // after "foo" and its two spaces, before the break
        assert_eq!(boxed.line_end(0), (6, false));
        // a soft break still ends before the space it breaks at
        let wrapped = TextBox::new(
            &mut fonts,
            &text("aaaa bbbb cccc dddd"),
            40.0,
            Alignment::Start,
        );
        let (end, _) = wrapped.line_end(0);
        assert_eq!(&wrapped.text[..(end - 1) as usize], "aaaa");
    }

    #[test]
    fn tells_a_mark_no_font_has() {
        // U+1AB5, a combining mark Blank's fonts lack, on an a: the a's
        // cluster shows the missing glyph, and the mark is what's missing
        let mut fonts = repository_fonts();
        let boxed = TextBox::new(&mut fonts, &text("a\u{1AB5}b"), 300.0, Alignment::Start);
        assert!(boxed.missing.contains(&'\u{1AB5}'), "{:?}", boxed.missing);
    }
}

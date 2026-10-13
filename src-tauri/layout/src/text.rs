//! Laying out one textblock with Parley: line breaking, bidi, shaping and
//! the cursor geometry, in points.

use std::sync::Arc;

use parley::{
    Affinity, Alignment, AlignmentOptions, BreakReason, Cursor, FontStyle, FontWeight, InlineBox,
    InlineBoxKind, Layout, LineHeight, OverflowWrap, PositionedLayoutItem, Selection,
    StyleProperty,
};

use crate::fonts::{family_list, ink_link, Fonts, Ink, INK_CODE, INK_DIM, INK_UNDERLINE};
use crate::math::{MathBox, MathLaid};
use crate::model::{byte_of_utf16, utf16_len, utf16_of_byte, Span, Text};
use crate::style::{text_style, TextStyle, BOLD, CODE_SCALE, TAB_STOP};

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
    /// its lines, as Parley broke them, with room made for their formulas
    lines: Vec<LineInfo>,
    /// how far each line is painted below where Parley set it, for the
    /// room the formulas on it and on the lines before take
    shifts: Vec<f32>,
    /// the font index of each of its runs, by its line and Parley's index
    /// of the run in it: a face, or an instance of a variable one, see
    /// `Fonts::font_of`
    pub run_fonts: Vec<((usize, usize), usize)>,
    /// its inline math, in the order of the text
    pub maths: Vec<InlineMath>,
}

/// a formula in a line of text: an inline box of Parley's after the
/// characters of no width that stand for its node's positions
pub struct InlineMath {
    /// its characters, bytes `start..end` of the text
    pub start: usize,
    pub end: usize,
    pub shown: Shown,
    /// its source, what the PDF's structure says it is
    pub latex: String,
}

/// what an inline formula shows: the formula, or its source as code
/// while it can't be set (an error, or no math fonts yet)
pub enum Shown {
    Math(Arc<MathBox>),
    Source(Box<TextBox>),
}

impl InlineMath {
    pub fn width(&self) -> f32 {
        match &self.shown {
            Shown::Math(math) => math.width,
            Shown::Source(boxed) => boxed.layout.width(),
        }
    }

    /// how far it reaches above and below the baseline
    fn extent(&self) -> (f32, f32) {
        match &self.shown {
            Shown::Math(math) => (math.height, math.depth),
            Shown::Source(boxed) => {
                let line = boxed.lines.first();
                let baseline = line.map_or(0.0, |line| line.baseline);
                (baseline, boxed.height() - baseline)
            }
        }
    }
}

/// what a line is made of, in the order it is painted: Parley's runs of
/// text, and inline math
enum Piece<'a> {
    Run(parley::Run<'a, Ink>),
    Math { index: usize, width: f32 },
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
    /// the underline of a link or of underlined text: its offset below the
    /// baseline and thickness
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

/// how text set `align` lines up: a paragraph's or heading's alignment, or
/// a table cell's (center, right, justify, anything else the start)
pub fn alignment_of(align: Option<&str>) -> Alignment {
    match align {
        Some("center") => Alignment::Center,
        Some("right") => Alignment::Right,
        Some("justify") => Alignment::Justify,
        _ => Alignment::Start,
    }
}

/// where a box `width` wide starts in `room`, aligned `align` like text: in
/// the middle for center, at the end for right, at the start otherwise
pub fn align_offset(align: Option<&str>, room: f32, width: f32) -> f32 {
    let free = (room - width).max(0.0);
    match align {
        Some("center") => free / 2.0,
        Some("right") => free,
        _ => 0.0,
    }
}

impl TextBox {
    /// lays out `text` in `width` points
    pub fn new(fonts: &mut Fonts, text: &Text, width: f32, alignment: Alignment) -> TextBox {
        TextBox::new_at(fonts, text, width, alignment, 0.0)
    }

    /// lays out `text` in `width` points, `origin` points from where its
    /// tab stops are counted, e.g. the edge of the text column for a
    /// quote's or a list's text, as Word counts them from the margin
    pub fn new_at(
        fonts: &mut Fonts,
        text: &Text,
        width: f32,
        alignment: Alignment,
        origin: f32,
    ) -> TextBox {
        // each tab reaches the next stop: it's widened by letter spacing on
        // it alone. The tabs are measured in a layout, each one moving the
        // ones after it on its line, and laid out again until they stay where
        // they are, which is once unless widening them breaks the lines
        // anew; a line with many tabs, e.g. pasted columns, isn't laid out
        // once for each of them
        let mut tabs: Vec<(std::ops::Range<usize>, f32)> = text
            .text
            .match_indices('\t')
            .map(|(byte, _)| (byte..byte + 1, 0.0))
            .collect();
        if tabs.is_empty() {
            return TextBox::lay_out(fonts, text, width, alignment, &tabs);
        }
        for _ in 0..=tabs.len() {
            let boxed = TextBox::lay_out(fonts, text, width, Alignment::Start, &tabs);
            let mut moved = false;
            // how far the tabs before on the line moved what follows them
            let mut shift = (usize::MAX, 0.0);
            for tab in tabs.iter_mut() {
                let cursor =
                    Cursor::from_byte_index(&boxed.layout, tab.0.start, Affinity::Downstream);
                let [_, Some(cluster)] = cursor.visual_clusters(&boxed.layout) else {
                    continue;
                };
                let line = cluster.path().line_index();
                if shift.0 != line {
                    shift = (line, 0.0);
                }
                let x = origin + boxed.cluster_x(&cluster) + shift.1;
                // the next stop, not the one the tab stands at
                let stop = ((x + 0.01) / TAB_STOP).floor() * TAB_STOP + TAB_STOP;
                let change = stop - x - cluster.advance();
                if change.abs() > 0.01 {
                    tab.1 += change;
                    shift.1 += change;
                    moved = true;
                }
            }
            if !moved {
                if alignment == Alignment::Start {
                    return boxed;
                }
                break;
            }
        }
        TextBox::lay_out(fonts, text, width, alignment, &tabs)
    }

    /// lays out `text` with the letter spacing of each of its tabs
    fn lay_out(
        fonts: &mut Fonts,
        text: &Text,
        width: f32,
        alignment: Alignment,
        tabs: &[(std::ops::Range<usize>, f32)],
    ) -> TextBox {
        let style = text_style(text.style);
        let len = utf16_len(&text.text);
        let laid_text = if text.text.is_empty() {
            " ".to_string()
        } else {
            text.text.clone()
        };
        let mut links: Vec<String> = vec![];
        // the formulas, laid out before the text, which leaves room for them
        let mut maths: Vec<InlineMath> = vec![];
        if !text.text.is_empty() {
            for span in &text.spans {
                let Some(latex) = &span.math else {
                    continue;
                };
                let (start, end) = (
                    byte_of_utf16(&laid_text, span.from),
                    byte_of_utf16(&laid_text, span.to),
                );
                if start >= end {
                    continue;
                }
                let shown = match crate::math::layout(fonts, latex, false, style.size) {
                    MathLaid::Ok(math) => Shown::Math(math),
                    // its source as inline code, on one line
                    MathLaid::Err(_) | MathLaid::NoFonts => {
                        let source = Text {
                            pos: 0,
                            text: latex.clone(),
                            spans: vec![Span {
                                from: 0,
                                to: utf16_len(latex),
                                code: true,
                                ..Default::default()
                            }],
                            style: text.style,
                            ..Default::default()
                        };
                        let boxed = TextBox::new(fonts, &source, f32::MAX, Alignment::Start);
                        Shown::Source(Box::new(boxed))
                    }
                };
                maths.push(InlineMath {
                    start,
                    end,
                    shown,
                    latex: latex.clone(),
                });
            }
        }
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
            for (range, spacing) in tabs {
                builder.push(
                    StyleProperty::LetterSpacing(style.tracking + spacing),
                    range.clone(),
                );
            }
            // after the formula's characters, so the caret before them is
            // before the formula and after them after it. Of no height:
            // Parley counts all of a box's height above the baseline and as
            // the line's height, so a formula's depth would get no room
            // below it; `read_lines` makes room above and below instead
            for (index, inline) in maths.iter().enumerate() {
                builder.push_inline_box(InlineBox {
                    id: index as u64,
                    kind: InlineBoxKind::InFlow,
                    index: inline.end,
                    width: inline.width(),
                    height: 0.0,
                });
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
            shifts: vec![],
            run_fonts: vec![],
            maths,
        };
        boxed.layout.break_all_lines(Some(width));
        boxed.layout.align(
            alignment,
            AlignmentOptions {
                align_when_overflowing: false,
            },
        );
        (boxed.lines, boxed.shifts) = boxed.read_lines();
        boxed.missing = boxed.notdef();
        // and those of its formulas, which `notdef` skips
        for inline in &boxed.maths {
            let missing = match &inline.shown {
                Shown::Math(math) => &math.missing,
                Shown::Source(source) => &source.missing,
            };
            for char in missing {
                if !boxed.missing.contains(char) {
                    boxed.missing.push(*char);
                }
            }
        }
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
                        if self.in_math(range.start) {
                            continue;
                        }
                        for char in self.text[range].chars() {
                            if !char.is_whitespace()
                                && !char.is_control()
                                && !is_invisible(char)
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
        // Parley's height, and the room the formulas took
        let last = self.lines.len().wrapping_sub(1);
        let grown = match (self.lines.last(), self.layout.get(last)) {
            (Some(info), Some(line)) => info.bottom - line.metrics().block_max_coord,
            _ => 0.0,
        };
        self.layout.height() + grown
    }

    /// its lines, as Parley broke them
    pub fn lines(&self) -> &[LineInfo] {
        &self.lines
    }

    /// its lines, each as high as its text and its formulas reach above and
    /// below the baseline, and how far each moved down from where Parley
    /// set it for that
    fn read_lines(&self) -> (Vec<LineInfo>, Vec<f32>) {
        let mut lines = vec![];
        let mut shifts = vec![];
        // how much lower the line before ends than Parley set it
        let mut grown = 0.0;
        for line in self.layout.lines() {
            let metrics = line.metrics();
            let range = line.text_range();
            let mut above = metrics.baseline - metrics.block_min_coord;
            let mut below = metrics.block_max_coord - metrics.baseline;
            for item in line.items() {
                if let PositionedLayoutItem::InlineBox(inline) = item {
                    if let Some(math) = self.maths.get(inline.id as usize) {
                        let (height, depth) = math.extent();
                        above = above.max(height);
                        below = below.max(depth);
                    }
                }
            }
            let top = metrics.block_min_coord + grown;
            let baseline = top + above;
            let bottom = baseline + below;
            shifts.push(baseline - metrics.baseline);
            grown = bottom - metrics.block_max_coord;
            lines.push(LineInfo {
                top,
                bottom,
                baseline,
                start: range.start,
                end: range.end,
            });
        }
        (lines, shifts)
    }

    /// how far a line is painted below where Parley set it
    fn shift(&self, line: usize) -> f32 {
        self.shifts.get(line).copied().unwrap_or(0.0)
    }

    /// the line at a height as Parley set the lines, which its cursor and
    /// selection geometry measure by
    fn parley_line_at(&self, y: f32) -> usize {
        self.layout
            .lines()
            .position(|line| y < line.metrics().block_max_coord)
            .unwrap_or(self.layout.len().saturating_sub(1))
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
            let baseline = run.baseline() + self.shift(line_index);
            let text = &self.text;
            // a tab is the room up to its stop, with nothing in it: the
            // fonts have no glyph for it. The run is split there, since
            // the PDF sets a run's glyphs one after the other.
            let mut pieces: Vec<Vec<Glyph>> = vec![vec![]];
            for (glyph, range) in clustered.into_iter().skip(skip).take(count) {
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
                if self.in_math(range.start) {
                    // the characters of a formula, drawn as the formula,
                    // between the text before and after it: the PDF reads
                    // them in that order
                    if pieces.last().is_some_and(|piece| !piece.is_empty()) {
                        pieces.push(vec![]);
                    }
                    continue;
                }
                if text.get(range) == Some("\t") {
                    pieces.push(vec![]);
                } else if let Some(piece) = pieces.last_mut() {
                    piece.push(positioned);
                }
            }
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
            // a run of a tab alone, e.g. in inline code, keeps its fill
            if pieces.len() == 1 || pieces.iter().all(Vec::is_empty) {
                let glyphs = pieces.into_iter().flatten().collect::<Vec<_>>();
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
                continue;
            }
            for glyphs in pieces.into_iter().filter(|piece| !piece.is_empty()) {
                let x = glyphs[0].x - glyphs[0].dx;
                let width = glyphs.iter().map(|glyph| glyph.advance).sum();
                result.push(GlyphRun {
                    font,
                    size,
                    ink,
                    glyphs,
                    underline,
                    baseline,
                    x,
                    width,
                });
            }
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
        let line = self.parley_line_at((rect.y0 + rect.y1) as f32 / 2.0);
        let x = self.caret_x(cursor).unwrap_or(rect.x0 as f32);
        // as high as its line, with the room made for its formulas
        match self.lines.get(line) {
            Some(info) => (line, x, info.top, info.bottom - info.top),
            None => (line, x, rect.y0 as f32, (rect.y1 - rect.y0) as f32),
        }
    }

    /// whether a byte is one of the characters a formula stands on
    fn in_math(&self, byte: usize) -> bool {
        self.maths
            .iter()
            .any(|inline| (inline.start..inline.end).contains(&byte))
    }

    /// what a line is made of, in the order it is painted: each run once,
    /// though Parley splits its glyphs by style, and the formulas
    fn pieces(&self, line: usize) -> Vec<Piece<'_>> {
        let Some(line) = self.layout.get(line) else {
            return vec![];
        };
        let mut pieces = vec![];
        let mut seen: Vec<usize> = vec![];
        for item in line.items() {
            match item {
                PositionedLayoutItem::GlyphRun(run) => {
                    let run = *run.run();
                    if !seen.contains(&run.index()) {
                        seen.push(run.index());
                        pieces.push(Piece::Run(run));
                    }
                }
                PositionedLayoutItem::InlineBox(inline) => pieces.push(Piece::Math {
                    index: inline.id as usize,
                    width: inline.width,
                }),
            }
        }
        pieces
    }

    /// the formulas of a line: each with where its baseline starts, in the
    /// box's coordinates, painted where the clusters before it end
    pub fn line_maths(&self, line: usize) -> Vec<(f32, f32, &InlineMath)> {
        let (Some(parley_line), Some(info)) = (self.layout.get(line), self.lines.get(line)) else {
            return vec![];
        };
        let metrics = parley_line.metrics();
        let mut x = metrics.offset + metrics.inline_min_coord;
        let mut found = vec![];
        for piece in self.pieces(line) {
            match piece {
                Piece::Run(run) => x += run.visual_clusters().map(|c| c.advance()).sum::<f32>(),
                Piece::Math { index, width } => {
                    if let Some(inline) = self.maths.get(index) {
                        found.push((x, info.baseline, inline));
                    }
                    x += width;
                }
            }
        }
        found
    }

    /// where a cluster's left edge is painted on its line. Parley's own
    /// cursor geometry and hit-testing (`Cluster::visual_offset`,
    /// `Cluster::from_point`) step over the runs before a cluster by
    /// `Run::advance`, which justifying leaves as shaped, while it widens
    /// the spaces' clusters, so on a justified line they fall behind the
    /// glyphs past a change of run (a bold word, code, another font). The
    /// glyphs are painted by their advances, which take the widening, as
    /// the advances of the clusters do: summing those is where they stand.
    fn cluster_x(&self, cluster: &parley::Cluster<'_, Ink>) -> f32 {
        let path = cluster.path();
        let Some(line) = self.layout.get(path.line_index()) else {
            return 0.0;
        };
        let metrics = line.metrics();
        let mut x = metrics.offset + metrics.inline_min_coord;
        for piece in self.pieces(path.line_index()) {
            let run = match piece {
                Piece::Run(run) => run,
                Piece::Math { width, .. } => {
                    x += width;
                    continue;
                }
            };
            if run.index() == path.run_index() {
                let visual = run.logical_to_visual(path.logical_index()).unwrap_or(0);
                return x + run
                    .visual_clusters()
                    .take(visual)
                    .map(|c| c.advance())
                    .sum::<f32>();
            }
            x += run.visual_clusters().map(|c| c.advance()).sum::<f32>();
        }
        x
    }

    /// the width of a line as painted, its spaces at the end included
    fn painted_width(&self, line: usize) -> f32 {
        self.pieces(line)
            .into_iter()
            .map(|piece| match piece {
                Piece::Run(run) => (0..run.len())
                    .filter_map(|index| run.get(index))
                    .map(|c| c.advance())
                    .sum::<f32>(),
                Piece::Math { width, .. } => width,
            })
            .sum()
    }

    /// the caret's x as Parley's `Cursor::geometry` places it, at the edge
    /// of the same cluster, but where that cluster is painted; None where
    /// it stands at no cluster (an empty last line)
    fn caret_x(&self, cursor: Cursor) -> Option<f32> {
        let (cluster, at_end) = match cursor.visual_clusters(&self.layout) {
            [Some(left), Some(right)] => {
                // at the end of a line, the start of the next unless the
                // cursor comes from the line's end at a soft break
                let downstream = cursor.affinity() == Affinity::Downstream;
                if !left.is_end_of_line()
                    || left.is_soft_line_break() && left.is_rtl() == downstream
                {
                    (left, true)
                } else {
                    (right, false)
                }
            }
            [Some(left), None] if left.is_hard_line_break() => return None,
            [Some(left), _] => (left, true),
            [_, Some(right)] => (right, false),
            _ => return None,
        };
        let mut end = if at_end { cluster.advance() } else { 0.0 };
        // after a formula's characters, past the formula, which stands
        // between them and what follows
        if at_end {
            let range_end = cluster.text_range().end;
            if let Some(inline) = self.maths.iter().find(|inline| inline.end == range_end) {
                end += inline.width();
            }
        }
        Some(self.cluster_x(&cluster) + end)
    }

    /// the cluster nearest to a point and whether the point is on its
    /// right half, as `Cluster::from_point` finds it, but by where the
    /// clusters are painted (see `cluster_x`)
    fn cluster_at(&self, x: f32, y: f32) -> Option<(parley::Cluster<'_, Ink>, bool)> {
        let line_index = self.line_at(y);
        let line = self.layout.get(line_index)?;
        let metrics = line.metrics();
        let mut edge = metrics.offset + metrics.inline_min_coord;
        let mut last = None;
        for piece in self.pieces(line_index) {
            let run = match piece {
                Piece::Run(run) => run,
                Piece::Math { width, .. } => {
                    edge += width;
                    continue;
                }
            };
            let clusters =
                (0..run.len()).filter_map(|visual| run.get(run.visual_to_logical(visual)?));
            for cluster in clusters {
                let advance = cluster.advance();
                if x <= edge + advance {
                    let right = x > edge + advance / 2.0;
                    return Some((cluster, right));
                }
                edge += advance;
                last = Some(cluster);
            }
        }
        // past the end of the line, its last cluster
        last.map(|cluster| (cluster, true))
    }

    /// the cursor nearest to a point, as `Cursor::from_point` takes it
    fn cursor_at(&self, x: f32, y: f32) -> Cursor {
        let Some((cluster, right)) = self.cluster_at(x, y) else {
            return Cursor::from_byte_index(&self.layout, self.text.len(), Affinity::Downstream);
        };
        let range = cluster.text_range();
        // never after a hard break, which would put it on the next line
        let start = if cluster.is_rtl() {
            right
        } else {
            !right || cluster.is_line_break() == Some(BreakReason::Explicit)
        };
        if start {
            Cursor::from_byte_index(&self.layout, range.start, Affinity::Downstream)
        } else {
            Cursor::from_byte_index(&self.layout, range.end, Affinity::Upstream)
        }
    }

    /// the line at a height, or the nearest
    pub fn line_at(&self, y: f32) -> usize {
        let lines = self.lines();
        lines
            .iter()
            .position(|line| y < line.bottom)
            .unwrap_or(lines.len().saturating_sub(1))
    }

    /// the position nearest to a point in the box's coordinates: in a
    /// formula, at the end of its source, which opens it
    pub fn hit(&self, x: f32, y: f32) -> u32 {
        if let Some(inline) = self.math_at(x, y) {
            return self.pos_of(inline.end - PLACEHOLDER.len_utf8());
        }
        self.pos_of(self.cursor_at(x, y).index())
    }

    /// the formula at a point, if there is one
    fn math_at(&self, x: f32, y: f32) -> Option<&InlineMath> {
        let line = self.line_at(y);
        self.line_maths(line)
            .into_iter()
            .find(|(left, _, inline)| x >= *left && x < left + inline.width())
            .map(|(_, _, inline)| inline)
    }

    /// the word at a point, as ProseMirror positions, as
    /// `Selection::word_from_point` finds it but by where the clusters are
    /// painted
    pub fn word(&self, x: f32, y: f32) -> (u32, u32) {
        let Some((mut cluster, _)) = self.cluster_at(x, y) else {
            let end = self.pos_of(self.text.len());
            return (end, end);
        };
        if !cluster.is_word_boundary() {
            if let Some(previous) = cluster.previous_logical_word() {
                cluster = previous;
            }
        }
        let affinity = if cluster.is_rtl() {
            Affinity::Upstream
        } else {
            Affinity::Downstream
        };
        let anchor = Cursor::from_byte_index(&self.layout, cluster.text_range().start, affinity);
        let range = Selection::new(anchor, anchor.next_logical_word(&self.layout)).text_range();
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
        let end = info.end;
        if line + 1 == lines.len() {
            return end;
        }
        // at a hard break, before the break only: the spaces before it are
        // text, as the editor keeps them
        if self.text[..end].ends_with('\n') {
            return end - 1;
        }
        // at a soft break, before the spaces the line ends with
        info.start + self.text[info.start..end].trim_end().len()
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
        let byte = self.cursor_at(x, (info.top + info.bottom) / 2.0).index();
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
        // Parley measures the first and last line by their clusters, which
        // take a justified line's widened spaces, but the lines between by
        // the line's advance, which doesn't: those take the clusters' too
        let line_of = |cursor: Cursor| {
            let rect = cursor.geometry(&self.layout, 0.0);
            self.parley_line_at((rect.y0 + rect.y1) as f32 / 2.0)
        };
        let (first, last) = (line_of(selection.anchor()), line_of(selection.focus()));
        let mut rects: Vec<(usize, f32, f32, f32, f32)> = selection
            .geometry(&self.layout)
            .into_iter()
            .map(|(rect, line)| {
                let mut width = (rect.x1 - rect.x0) as f32;
                if line > first && line < last {
                    width += self.painted_width(line)
                        - self.layout.get(line).map_or(0.0, |l| l.metrics().advance);
                }
                // as high as its line, with the room made for its formulas
                let (top, height) = self
                    .lines
                    .get(line)
                    .map_or((rect.y0 as f32, (rect.y1 - rect.y0) as f32), |info| {
                        (info.top, info.bottom - info.top)
                    });
                (line, rect.x0 as f32, top, width, height)
            })
            .collect();
        // a formula is selected with any of its positions, and only then:
        // Parley's box stands after its characters, so a range that ends
        // with them, or stays inside them, would leave it out, and one that
        // starts after them would take it in
        for (line, info) in self.lines.iter().enumerate() {
            for (x, _, inline) in self.line_maths(line) {
                let (left, right) = (x, x + inline.width());
                if from >= inline.end || to <= inline.start {
                    for (_, x, _, width, _) in rects.iter_mut().filter(|rect| rect.0 == line) {
                        let end = *x + *width;
                        if *x >= left - 0.01 && *x < right - 0.01 {
                            *x = right.min(end);
                        } else if end > left + 0.01 && end <= right + 0.01 {
                            *width = (left - *x).max(0.0);
                            continue;
                        }
                        *width = end - *x;
                    }
                    continue;
                }
                let touching = rects.iter_mut().find(|(at, x, _, width, _)| {
                    *at == line && *x <= right + 0.01 && x + width >= left - 0.01
                });
                match touching {
                    Some((_, x, _, width, _)) => {
                        let end = (*x + *width).max(right);
                        *x = x.min(left);
                        *width = end - *x;
                    }
                    None => {
                        rects.push((line, left, info.top, right - left, info.bottom - info.top))
                    }
                }
            }
        }
        rects.sort_by(|a, b| a.0.cmp(&b.0).then(a.1.total_cmp(&b.1)));
        rects
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

/// the character a formula's positions are written as: a word joiner,
/// which has no width and keeps the formula with the text around it
pub const PLACEHOLDER: char = '\u{2060}';

/// a character with nothing to draw, which no font needs to have
fn is_invisible(char: char) -> bool {
    matches!(char, '\u{200b}'..='\u{200f}' | '\u{2060}'..='\u{2064}' | '\u{feff}')
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
            StyleProperty::FontWeight(FontWeight::new(BOLD)),
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
    if span.underline {
        builder.push(StyleProperty::Underline(true), range.clone());
        ink |= INK_UNDERLINE;
    }
    if span.dim {
        ink |= INK_DIM;
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
    fn tabs_reach_the_next_stop() {
        let mut fonts = repository_fonts();
        let caret_x = |boxed: &TextBox, pos: u32| boxed.caret(pos, false).1;
        // positions: 1 before "ab", 3 at the tab, 4 after it
        let boxed = TextBox::new(&mut fonts, &text("ab\tcd\te"), 300.0, Alignment::Start);
        assert!((caret_x(&boxed, 4) - TAB_STOP).abs() < 0.01);
        assert!((caret_x(&boxed, 7) - 2.0 * TAB_STOP).abs() < 0.01);
        // a leading tab, and one standing at a stop, which goes on to the next
        let leading = TextBox::new(&mut fonts, &text("\t\tx"), 300.0, Alignment::Start);
        assert!((caret_x(&leading, 2) - TAB_STOP).abs() < 0.01);
        assert!((caret_x(&leading, 3) - 2.0 * TAB_STOP).abs() < 0.01);
        // counted from the origin: 10 pt in, the first stop is 26 pt away
        let indented = TextBox::new_at(&mut fonts, &text("\tx"), 300.0, Alignment::Start, 10.0);
        assert!((caret_x(&indented, 2) - (TAB_STOP - 10.0)).abs() < 0.01);
        // the tab is painted as nothing, and the glyphs after it at its stop
        let runs = boxed.glyph_runs(&fonts, 0);
        let glyphs: Vec<&Glyph> = runs.iter().flat_map(|run| &run.glyphs).collect();
        assert_eq!(glyphs.len(), 5);
        assert!(glyphs.iter().all(|glyph| glyph.id != 0));
        assert!((glyphs[2].x - glyphs[2].dx - TAB_STOP).abs() < 0.01);
        // each run starts where its first glyph is drawn
        for run in &runs {
            assert!((run.x - (run.glyphs[0].x - run.glyphs[0].dx)).abs() < 0.01);
        }
        assert!(boxed.missing.is_empty());
        // a click in the tab's room goes to its nearer side
        let middle = (boxed.lines()[0].top + boxed.lines()[0].bottom) / 2.0;
        assert_eq!(boxed.hit(caret_x(&boxed, 3) + 2.0, middle), 3);
        assert_eq!(boxed.hit(TAB_STOP - 2.0, middle), 4);
    }

    #[test]
    fn many_tabs_on_a_line_reach_their_stops() {
        let mut fonts = repository_fonts();
        let columns = "ab\t".repeat(40);
        let boxed = TextBox::new(&mut fonts, &text(&columns), 2000.0, Alignment::Center);
        assert_eq!(boxed.line_count(), 1);
        let shift = boxed.caret(1, false).1;
        // each "ab" after a tab starts at a stop, from where the line starts
        for column in 1..40 {
            let x = boxed.caret(1 + 3 * column, false).1 - shift;
            assert!((x - column as f32 * TAB_STOP).abs() < 0.02, "{column}: {x}");
        }
    }

    #[test]
    fn tabs_break_lines_like_spaces() {
        let mut fonts = repository_fonts();
        let boxed = TextBox::new(
            &mut fonts,
            &text("word\tword\tword"),
            60.0,
            Alignment::Start,
        );
        assert_eq!(boxed.line_count(), 3);
        // a justified line widens its spaces, never its tabs
        let line = format!("{} end", "a\tb c d e f g ".repeat(3));
        let justified = TextBox::new(&mut fonts, &text(&line), 200.0, Alignment::Justify);
        assert!((justified.caret(3, false).1 - TAB_STOP).abs() < 0.01);
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

    /// where the ink of each line starts and ends: its first and last glyph
    /// that isn't a space, as painted
    fn line_edges(fonts: &Fonts, boxed: &TextBox) -> Vec<(f32, f32)> {
        (0..boxed.line_count())
            .map(|line| {
                let glyphs: Vec<Glyph> = boxed
                    .glyph_runs(fonts, line)
                    .into_iter()
                    .flat_map(|run| run.glyphs)
                    .filter(|glyph| {
                        !boxed.text[glyph.start as usize..glyph.end as usize]
                            .trim()
                            .is_empty()
                    })
                    .collect();
                let left = glyphs.iter().map(|g| g.x).fold(f32::MAX, f32::min);
                let right = glyphs
                    .iter()
                    .map(|g| g.x + g.advance)
                    .fold(f32::MIN, f32::max);
                (left, right)
            })
            .collect()
    }

    #[test]
    fn maps_alignments_and_offsets() {
        assert_eq!(alignment_of(Some("center")), Alignment::Center);
        assert_eq!(alignment_of(Some("right")), Alignment::Right);
        assert_eq!(alignment_of(Some("justify")), Alignment::Justify);
        assert_eq!(alignment_of(Some("left")), Alignment::Start);
        assert_eq!(alignment_of(None), Alignment::Start);
        assert_eq!(align_offset(Some("center"), 100.0, 40.0), 30.0);
        assert_eq!(align_offset(Some("right"), 100.0, 40.0), 60.0);
        assert_eq!(align_offset(Some("justify"), 100.0, 40.0), 0.0);
        assert_eq!(align_offset(None, 100.0, 140.0), 0.0);
    }

    #[test]
    fn centers_and_right_aligns_each_line() {
        let mut fonts = repository_fonts();
        let words = "Some words that wrap onto a second line here";
        let center = TextBox::new(&mut fonts, &text(words), 200.0, Alignment::Center);
        let right = TextBox::new(&mut fonts, &text(words), 200.0, Alignment::Right);
        assert!(center.line_count() >= 2);
        for (left, end) in line_edges(&fonts, &center) {
            assert!(((200.0 - end) - left).abs() < 1.0, "{left} {end}");
        }
        for (_, end) in line_edges(&fonts, &right) {
            assert!((end - 200.0).abs() < 0.5, "{end}");
        }
    }

    #[test]
    fn justifies_every_line_but_the_last_and_those_before_a_break() {
        let mut fonts = repository_fonts();
        let words = "Some words that wrap onto more lines than one, all of them full but the last one\nand this.";
        let mut value = text(words);
        // a run in another face in the middle of the first line
        value.spans = vec![Span {
            from: 5,
            to: 10,
            bold: true,
            ..Default::default()
        }];
        let boxed = TextBox::new(&mut fonts, &value, 200.0, Alignment::Justify);
        let edges = line_edges(&fonts, &boxed);
        let last = edges.len() - 1;
        assert!(last >= 2, "{edges:?}");
        for (line, (left, end)) in edges.iter().enumerate() {
            assert!(left.abs() < 0.5, "line {line} starts at {left}");
            // line_end counts from the text's position, 1
            let end_at = (boxed.line_end(line).0 - 1) as usize;
            let before_break = boxed.text[..end_at].trim_end().ends_with("last one");
            if line == last || before_break {
                assert!(*end < 199.0, "line {line} ends at {end}");
            } else {
                assert!((end - 200.0).abs() < 0.5, "line {line} ends at {end}");
            }
        }
    }

    #[test]
    fn justifies_a_heading_with_its_tracking() {
        let mut fonts = repository_fonts();
        let mut value = text("A heading long enough that it takes two lines");
        value.style = "h1".into();
        let boxed = TextBox::new(&mut fonts, &value, 300.0, Alignment::Justify);
        let edges = line_edges(&fonts, &boxed);
        assert!(edges.len() >= 2, "{edges:?}");
        let (_, end) = edges[0];
        // the tracking after the last letter may stand past the ink
        assert!(end > 297.0 && end <= 300.5, "{end}");
    }

    /// a justified line that changes run mid line, as caret, hit and
    /// selection must take it: a bold word in the first of its lines
    fn justified_with_a_run() -> (Fonts, TextBox) {
        let mut fonts = repository_fonts();
        let mut value = text(
            "Some words that wrap onto more lines than one, all of them full but the last one of them",
        );
        value.spans = vec![Span {
            from: 5,
            to: 10,
            bold: true,
            ..Default::default()
        }];
        let boxed = TextBox::new(&mut fonts, &value, 200.0, Alignment::Justify);
        assert!(boxed.line_count() >= 2);
        (fonts, boxed)
    }

    #[test]
    fn puts_the_caret_on_the_glyphs_of_a_justified_line() {
        let (fonts, boxed) = justified_with_a_run();
        let runs = boxed.glyph_runs(&fonts, 0);
        assert!(runs.len() >= 3, "{runs:?}");
        for glyph in runs.iter().flat_map(|run| &run.glyphs) {
            let pos = boxed.pos_of(glyph.start as usize);
            let (line, x, ..) = boxed.caret(pos, false);
            assert_eq!(line, 0);
            assert!(
                (x - glyph.x).abs() < 0.5,
                "caret at {pos} is at {x}, its glyph at {}",
                glyph.x
            );
            let middle = glyph.x + glyph.advance / 2.0;
            let y = (boxed.lines()[0].top + boxed.lines()[0].bottom) / 2.0;
            // just left of the middle is before the glyph, right of it after
            let before = boxed.hit(middle - 0.1, y);
            let after = boxed.hit(middle + 0.1, y);
            assert_eq!(before, pos, "hit left of the middle of {pos}");
            assert_eq!(
                after,
                boxed.pos_of(glyph.end as usize),
                "hit right of {pos}"
            );
            assert_eq!(boxed.hit_line(0, middle - 0.1).0, pos);
        }
    }

    #[test]
    fn selects_the_glyphs_of_a_justified_line() {
        let (fonts, boxed) = justified_with_a_run();
        let glyphs: Vec<Glyph> = boxed
            .glyph_runs(&fonts, 0)
            .iter()
            .flat_map(|run| run.glyphs.clone())
            .collect();
        // each word after the bold one, selected alone
        for glyph in glyphs.iter().filter(|glyph| glyph.start > 10) {
            let rects = boxed.selection(glyph.start as usize, glyph.end as usize);
            assert_eq!(rects.len(), 1, "{rects:?}");
            let (line, x, _, width, _) = rects[0];
            assert_eq!(line, 0);
            assert!((x - glyph.x).abs() < 0.5, "{x} for {glyph:?}");
            assert!((width - glyph.advance).abs() < 0.5, "{width} for {glyph:?}");
        }
        // a full line in the middle of a selection reaches the right edge
        let lines = boxed.line_count();
        assert!(lines >= 3);
        let rects = boxed.selection(0, boxed.text.len());
        assert_eq!(rects.len(), lines, "{rects:?}");
        for &(line, x, _, width, _) in &rects[..lines - 1] {
            assert!(x.abs() < 0.5 && x + width > 199.5, "line {line}: {rects:?}");
        }
        // as wide as the same line selected from its start, with its spaces
        let starts: Vec<usize> = boxed.lines().iter().map(|line| line.start).collect();
        let alone = boxed.selection(starts[1], starts[2]);
        assert!(
            (alone[0].3 - rects[1].3).abs() < 0.01,
            "{alone:?} {rects:?}"
        );
    }
}

#[cfg(test)]
mod math_tests {
    use super::*;
    use crate::math::tests::math_fonts;

    /// "a $x^2$ b" as flatten.ts writes it: the formula's node as word
    /// joiners, one per position (the node, its 3 characters, its end)
    fn with_math(before: &str, latex: &str, after: &str) -> Text {
        let size = latex.encode_utf16().count() + 2;
        let placeholders: String = std::iter::repeat_n(PLACEHOLDER, size).collect();
        let from = utf16_len(before);
        Text {
            pos: 1,
            text: format!("{before}{placeholders}{after}"),
            spans: vec![Span {
                from,
                to: from + size as u32,
                math: Some(latex.into()),
                ..Default::default()
            }],
            ..Default::default()
        }
    }

    fn laid(text: &Text, width: f32) -> (Fonts, TextBox) {
        let mut fonts = math_fonts();
        let boxed = TextBox::new(&mut fonts, text, width, Alignment::Start);
        (fonts, boxed)
    }

    #[test]
    fn sets_a_formula_in_the_line() {
        let (fonts, boxed) = laid(&with_math("a ", "x^2", " b"), 300.0);
        assert!(boxed.missing.is_empty(), "{:?}", boxed.missing);
        let maths = boxed.line_maths(0);
        assert_eq!(maths.len(), 1);
        let (x, baseline, inline) = maths[0];
        // after "a ", on the line's baseline
        assert!(x > 0.0);
        assert_eq!(baseline, boxed.lines()[0].baseline);
        // the word joiners draw nothing
        let drawn: String = boxed
            .glyph_runs(&fonts, 0)
            .iter()
            .flat_map(|run| run.glyphs.iter())
            .map(|glyph| &boxed.text[glyph.start as usize..glyph.end as usize])
            .collect();
        assert_eq!(drawn, "a  b");
        assert!(inline.width() > 0.0);
    }

    #[test]
    fn puts_the_caret_beside_a_formula() {
        let text = with_math("a ", "x^2", " b");
        let (_, boxed) = laid(&text, 300.0);
        let (x, _, inline) = boxed.line_maths(0)[0];
        let width = inline.width();
        // before the node: before the formula; after it: after it
        let node = 1 + 2;
        let size = 5;
        let (_, before, _, _) = boxed.caret(node, false);
        let (_, after, _, _) = boxed.caret(node + size, false);
        assert!((before - x).abs() < 0.01, "{before} {x}");
        assert!((after - (x + width)).abs() < 0.01, "{after} {}", x + width);
        // and the text after it stands after it too
        let (_, b, _, _) = boxed.caret(node + size + 1, false);
        assert!(b > after);
    }

    #[test]
    fn opens_a_formula_clicked() {
        let (_, boxed) = laid(&with_math("a ", "x^2", " b"), 300.0);
        let (x, baseline, inline) = boxed.line_maths(0)[0];
        let hit = boxed.hit(x + inline.width() / 2.0, baseline - 2.0);
        // the end of its source, inside the node
        assert_eq!(hit, 1 + 2 + 4);
    }

    #[test]
    fn measures_a_line_with_a_formula() {
        let (_, plain) = laid(&with_math("a ", "", " b"), 300.0);
        let (_, boxed) = laid(&with_math("a ", r"\frac{a}{b}", " b"), 300.0);
        let width = boxed.line_maths(0)[0].2.width();
        let painted = boxed.painted_width(0);
        assert!(
            (painted - plain.painted_width(0) - width).abs() < 0.5,
            "{painted}"
        );
        // and a tall formula makes the line taller
        assert!(
            boxed.lines()[0].bottom - boxed.lines()[0].top
                > plain.lines()[0].bottom - plain.lines()[0].top
        );
    }

    #[test]
    fn shows_the_source_of_a_formula_it_cant_set() {
        let (_, boxed) = laid(&with_math("a ", r"\nope", " b"), 300.0);
        let (_, _, inline) = boxed.line_maths(0)[0];
        let Shown::Source(source) = &inline.shown else {
            panic!("not the source");
        };
        assert_eq!(&*source.text, r"\nope");
        assert!(inline.width() > 0.0);
        // without the math fonts, too
        let mut plain = crate::fonts::repository_fonts();
        let boxed = TextBox::new(
            &mut plain,
            &with_math("a ", "x", " b"),
            300.0,
            Alignment::Start,
        );
        assert!(matches!(boxed.line_maths(0)[0].2.shown, Shown::Source(_)));
    }

    #[test]
    fn makes_room_for_a_formula_above_and_below_its_line() {
        for latex in [r"\frac{a}{b}", r"\begin{pmatrix}a\\b\\c\end{pmatrix}"] {
            let (fonts, boxed) = laid(&with_math("a ", latex, " b\nnext"), 300.0);
            let plain_text = Text {
                pos: 1,
                text: "a b\nnext".into(),
                ..Default::default()
            };
            let (_, plain) = laid(&plain_text, 300.0);
            let lines = boxed.lines();
            assert_eq!(lines.len(), 2);
            let (_, baseline, inline) = boxed.line_maths(0)[0];
            let (height, depth) = inline.extent();
            let line = lines[0];
            assert_eq!(baseline, line.baseline);
            assert!(line.bottom >= baseline + depth - 0.01, "{latex}: {line:?}");
            assert!(line.top <= baseline - height + 0.01, "{latex}: {line:?}");
            // no room wasted above: as high as the formula or the text
            let text_above = plain.lines()[0].baseline - plain.lines()[0].top;
            assert!(
                (baseline - line.top - height.max(text_above)).abs() < 0.01,
                "{latex}: {line:?}"
            );
            // the text on the line stands on the same baseline
            let runs = boxed.glyph_runs(&fonts, 0);
            assert!(runs
                .iter()
                .all(|run| (run.baseline - baseline).abs() < 0.01));
            // the next line starts below it, its text on its own baseline
            let next = lines[1];
            assert!(next.top >= line.bottom - 0.01, "{latex}: {lines:?}");
            let plain_next = plain.lines()[1];
            let next_runs = boxed.glyph_runs(&fonts, 1);
            assert!(next_runs
                .iter()
                .all(|run| (run.baseline - next.baseline).abs() < 0.01));
            assert!(
                (next.baseline - next.top - (plain_next.baseline - plain_next.top)).abs() < 0.01
            );
            assert!((boxed.height() - next.bottom).abs() < 0.01);
            // the caret, the selection and a click take the moved lines
            let end = boxed.pos + boxed.len;
            let (caret_line, _, caret_y, caret_h) = boxed.caret(end, false);
            assert_eq!(caret_line, 1);
            assert!(
                (caret_y - next.top).abs() < 0.01
                    && (caret_h - (next.bottom - next.top)).abs() < 0.01
            );
            let rects = boxed.selection(0, boxed.text.len());
            assert_eq!(rects[1].2, next.top);
            assert_eq!(boxed.hit(1000.0, next.top + 1.0), end);
        }
    }

    /// the carets before and after a formula's node of `size` positions,
    /// and the formula's left and right on its line
    fn caret_edges(boxed: &TextBox, node: u32, size: u32, line: usize) -> ((f32, f32), (f32, f32)) {
        let (_, before, _, _) = boxed.caret(node, false);
        let (_, after, _, _) = boxed.caret(node + size, false);
        let (x, _, inline) = boxed
            .line_maths(line)
            .into_iter()
            .find(|(_, _, inline)| boxed.pos_of(inline.start) == node)
            .expect("the formula on its line");
        ((before, after), (x, x + inline.width()))
    }

    #[test]
    fn puts_the_caret_beside_a_formula_in_a_justified_line() {
        let before = "Some words that wrap onto more lines than one, with ";
        let text = with_math(
            before,
            "x^2",
            " in the first of them and more words after it",
        );
        let mut fonts = math_fonts();
        let boxed = TextBox::new(&mut fonts, &text, 200.0, Alignment::Justify);
        let node = 1 + utf16_len(before);
        let (line, ..) = boxed.caret(node, false);
        assert!(line + 1 < boxed.line_count(), "on the last line");
        let ((before, after), (left, right)) = caret_edges(&boxed, node, 5, line);
        assert!((before - left).abs() < 0.01, "{before} {left}");
        assert!((after - right).abs() < 0.01, "{after} {right}");
        // the glyphs after it stand after it
        let next = boxed
            .glyph_runs(&fonts, line)
            .into_iter()
            .flat_map(|run| run.glyphs)
            .find(|glyph| glyph.start as usize == boxed.maths[0].end)
            .expect("a glyph after the formula");
        assert!(next.x >= right - 0.01, "{} {right}", next.x);
        // and a click on it opens it
        let middle = (boxed.lines()[line].top + boxed.lines()[line].bottom) / 2.0;
        assert_eq!(boxed.hit((left + right) / 2.0, middle), node + 4);
    }

    #[test]
    fn puts_the_caret_beside_a_formula_in_a_right_to_left_line() {
        let before = "\u{5e9}\u{5dc}\u{5d5}\u{5dd} ";
        let text = with_math(before, "x", " \u{5e2}\u{5d5}\u{5dc}\u{5dd}");
        let (_, boxed) = laid(&text, 300.0);
        let node = 1 + utf16_len(before);
        let ((before, after), (left, right)) = caret_edges(&boxed, node, 3, 0);
        // right to left: before the formula at its right, after it at its left
        assert!((before - right).abs() < 0.01, "{before} {left}..{right}");
        assert!((after - left).abs() < 0.01, "{after} {left}..{right}");
        // the word before it to its right, the word after it to its left
        let (_, start, _, _) = boxed.caret(1, false);
        let (_, end, _, _) = boxed.caret(boxed.pos + boxed.len, false);
        assert!(start > right && end < left, "{start} {end} {left}..{right}");
        // and a click on it opens it
        assert_eq!(boxed.hit((left + right) / 2.0, 8.0), node + 2);
    }

    #[test]
    fn selects_a_formula_with_any_of_its_positions() {
        // "a " is 1–3, the formula's node 3–8, its source 4–7, " b" 8–10
        let (_, boxed) = laid(&with_math("a ", "x^2", " b"), 300.0);
        let (x, _, inline) = boxed.line_maths(0)[0];
        let (left, right) = (x, x + inline.width());
        let (_, space, _, _) = boxed.caret(2, false);
        let (_, b, _, _) = boxed.caret(9, false);
        let selected = |from: u32, to: u32| {
            let rects = boxed.selection(boxed.byte_of(from), boxed.byte_of(to));
            assert_eq!(rects.len(), 1, "{from}..{to}: {rects:?}");
            let (_, x, _, width, _) = rects[0];
            (x, x + width)
        };
        let near = |a: (f32, f32), b: (f32, f32)| {
            assert!(
                (a.0 - b.0).abs() < 0.01 && (a.1 - b.1).abs() < 0.01,
                "{a:?} {b:?}"
            );
        };
        near(selected(3, 8), (left, right));
        near(selected(3, 9), (left, b));
        near(selected(2, 8), (space, right));
        near(selected(2, 9), (space, b));
        // inside its source too
        near(selected(4, 7), (left, right));
        near(selected(5, 6), (left, right));
        // and not when the range stops before it or starts after it
        assert!(selected(2, 3).1 <= left + 0.01);
        assert!(selected(8, 9).0 >= right - 0.01);
    }

    #[test]
    fn hits_text_after_a_formula() {
        let (_, boxed) = laid(&with_math("a ", "xyz", " bcd"), 300.0);
        let end = 1 + utf16_len(&boxed.text);
        let (_, x_end, y, h) = boxed.caret(end, false);
        assert_eq!(boxed.hit(x_end + 1.0, y + h / 2.0), end);
    }

    #[test]
    fn moves_a_tab_after_a_formula() {
        let mut text = with_math("a ", "xyz", "\tb");
        text.pos = 1;
        let (_, boxed) = laid(&text, 400.0);
        let tab_end = 1 + utf16_len(&text.text) - 1;
        let (_, x, _, _) = boxed.caret(tab_end, false);
        // b at the next tab stop past the formula
        assert!(
            (x / crate::style::TAB_STOP).fract().abs() < 0.01
                || (x / crate::style::TAB_STOP).fract() > 0.99,
            "{x}"
        );
    }
}

//! Blank's module for math: it lays a formula's LaTeX out with RaTeX, a
//! port of KaTeX, and writes it as a drawing (see `blank_layout::drawing`):
//! its glyphs by the KaTeX font they're in and their characters, which the
//! layout engine maps through the KaTeX fonts it has, and its rules and
//! shapes as paths. The pages and the PDF draw it as they draw text, which
//! stays text. It loads only with the first formula, so the engine starts
//! without it.
//!
//! A drawing is in em, from the top left of the formula's box, y down; the
//! engine sets it at the size of the text it stands in. RaTeX's black is
//! Blank's ink, which follows the theme; any other colour is the author's
//! own (`\color`, `\colorbox`), kept as it is.

use std::fmt::Write;

use ratex_types::color::Color;
use ratex_types::display_item::DisplayItem;
use ratex_types::path_command::PathCommand;

#[cfg(target_arch = "wasm32")]
mod wasm;

/// the family of the engine's math fonts, each `math:<RaTeX's name>`
pub const MATH_FAMILY: &str = "math:";

/// the largest formula drawn, in em: larger than any page at any size of
/// text (`\hspace{100000000em}`), and drawing it would cost as much as its
/// size
const MAX_EM: f64 = 2048.0;

/// the most dashes a dashed rule (`\hdashline`) gets; a longer one is solid
const MAX_DASHES: usize = 2000;

/// KaTeX's default rule thickness, in em, which RaTeX's outlined paths are
/// stroked at
const RULE: f64 = 0.04;

/// what a formula says when it's larger than any page could show
pub const TOO_LARGE: &str = "The formula is too large";

/// line and column (1-based, in characters) of a byte offset of `source`
fn line_column(source: &str, offset: usize) -> (u32, u32) {
    // an offset inside a character counts from the character's start
    let end = (0..=offset.min(source.len()))
        .rev()
        .find(|end| source.is_char_boundary(*end))
        .unwrap_or(0);
    let before = source.get(..end).unwrap_or("");
    let line = before.matches('\n').count() as u32 + 1;
    let start = before.rfind('\n').map_or(0, |at| at + 1);
    (line, before[start..].chars().count() as u32 + 1)
}

/// the message of RaTeX, which reads like KaTeX's, without its prefix
fn message(error: &ratex_parser::ParseError) -> String {
    let text = error.message.trim();
    text.strip_prefix("KaTeX parse error: ")
        .unwrap_or(text)
        .to_string()
}

/// a string as JSON
fn quoted(out: &mut String, text: &str) {
    out.push('"');
    for ch in text.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            ch if (ch as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", ch as u32);
            }
            ch => out.push(ch),
        }
    }
    out.push('"');
}

/// a number as JSON and as path data: fixed, never with an exponent, at
/// most five decimals, which is finer than any page shows
fn number(out: &mut String, value: f64) {
    let value = if value.is_finite() { value } else { 0.0 };
    let text = format!("{value:.5}");
    let text = text.trim_end_matches('0').trim_end_matches('.');
    out.push_str(if text == "-0" || text.is_empty() {
        "0"
    } else {
        text
    });
}

/// what something is painted in: the ink for RaTeX's black, at its
/// strength, else the author's colour
fn paint(out: &mut String, color: &Color) {
    out.push_str("\"paint\":{\"alpha\":");
    number(out, color.a.clamp(0.0, 1.0) as f64);
    let rgb = [color.r, color.g, color.b];
    if rgb.iter().any(|channel| *channel != 0.0) {
        let [r, g, b] = rgb.map(|channel| (channel.clamp(0.0, 1.0) * 255.0).round() as u8);
        let _ = write!(out, ",\"color\":[{r},{g},{b}]");
    }
    out.push('}');
}

/// a rectangle's path op, filled
fn rect(ops: &mut Vec<String>, (x, y, w, h): (f64, f64, f64, f64), color: &Color) {
    let mut op = String::from("{\"op\":\"path\",\"d\":\"");
    for (letter, px, py) in [
        ('M', x, y),
        ('L', x + w, y),
        ('L', x + w, y + h),
        ('L', x, y + h),
    ] {
        op.push(letter);
        number(&mut op, px);
        op.push(' ');
        number(&mut op, py);
    }
    op.push_str("Z\",");
    paint(&mut op, color);
    op.push('}');
    ops.push(op);
}

/// an error as the engine reads it
fn error(message: &str, line: u32, column: u32) -> String {
    let mut out = String::from("{\"error\":");
    quoted(&mut out, message);
    let _ = write!(out, ",\"line\":{line},\"column\":{column}}}");
    out
}

/// a formula's glyphs of one font, size and paint, in a row
struct Run {
    font: String,
    scale: f64,
    color: Color,
    glyphs: String,
    text: String,
}

impl Run {
    fn write(self, ops: &mut Vec<String>) {
        let mut op = String::from("{\"op\":\"glyphs\",\"font\":");
        quoted(&mut op, &format!("{MATH_FAMILY}{}", self.font));
        op.push_str(",\"size\":");
        number(&mut op, self.scale);
        let _ = write!(op, ",\"chars\":true,\"glyphs\":[{}],\"text\":", self.glyphs);
        quoted(&mut op, &self.text);
        op.push(',');
        paint(&mut op, &self.color);
        op.push('}');
        ops.push(op);
    }
}

/// draws a formula: display math in display style, inline math in text
/// style. It returns the drawing's JSON, `{width, height, depth, ops}`, or
/// what is wrong with it, `{error, line, column}`.
pub fn draw(latex: &str, display: bool) -> String {
    let nodes = match ratex_parser::parser::parse(latex) {
        Ok(nodes) => nodes,
        Err(failure) => {
            let at = failure.loc.as_ref().map_or(0, |loc| loc.start);
            let (line, column) = line_column(latex, at);
            return error(&message(&failure), line, column);
        }
    };
    let options = ratex_layout::LayoutOptions {
        style: if display {
            ratex_types::math_style::MathStyle::Display
        } else {
            ratex_types::math_style::MathStyle::Text
        },
        ..Default::default()
    };
    let root = ratex_layout::layout(&nodes, &options);
    let list = ratex_layout::to_display_list(&root);
    let fits = |extent: f64| extent.is_finite() && extent.abs() <= MAX_EM;
    if !(fits(list.width) && fits(list.height) && fits(list.depth)) {
        return error(TOO_LARGE, 1, 1);
    }
    let mut ops: Vec<String> = Vec::with_capacity(list.items.len());
    let mut run: Option<Run> = None;
    for item in &list.items {
        if let DisplayItem::GlyphPath {
            x,
            y,
            scale,
            font,
            char_code,
            color,
        } = item
        {
            let Some(ch) = char::from_u32(*char_code) else {
                continue;
            };
            let same = run
                .as_ref()
                .is_some_and(|run| run.font == *font && run.scale == *scale && run.color == *color);
            if !same {
                if let Some(done) = run.take() {
                    done.write(&mut ops);
                }
                run = Some(Run {
                    font: font.clone(),
                    scale: *scale,
                    color: *color,
                    glyphs: String::new(),
                    text: String::new(),
                });
            }
            let current = run.as_mut().expect("a run was started");
            if !current.glyphs.is_empty() {
                current.glyphs.push(',');
            }
            let _ = write!(current.glyphs, "[{},", ch as u32);
            number(&mut current.glyphs, *x);
            current.glyphs.push(',');
            number(&mut current.glyphs, *y);
            current.glyphs.push(']');
            current.text.push(ch);
            continue;
        }
        if let Some(done) = run.take() {
            done.write(&mut ops);
        }
        match item {
            DisplayItem::GlyphPath { .. } => {}
            DisplayItem::Line {
                x,
                y,
                width,
                thickness,
                color,
                dashed,
            } => {
                let top = *y - *thickness / 2.0;
                // dashes of four rule widths with as much space between,
                // counted up front
                let dash = (*thickness * 4.0).max(0.05);
                let dashes = (*width / (dash * 2.0)).ceil();
                if *dashed && dashes <= MAX_DASHES as f64 {
                    for n in 0..dashes as usize {
                        let from = n as f64 * dash * 2.0;
                        let w = dash.min(*width - from);
                        rect(&mut ops, (*x + from, top, w, *thickness), color);
                    }
                } else {
                    rect(&mut ops, (*x, top, *width, *thickness), color);
                }
            }
            DisplayItem::Rect {
                x,
                y,
                width,
                height,
                color,
            } => rect(&mut ops, (*x, *y, *width, *height), color),
            DisplayItem::Path {
                x,
                y,
                commands,
                fill,
                color,
            } => {
                let mut op = String::from("{\"op\":\"path\",\"d\":\"");
                let point = |op: &mut String, px: f64, py: f64| {
                    number(op, *x + px);
                    op.push(' ');
                    number(op, *y + py);
                };
                for command in commands {
                    match *command {
                        PathCommand::MoveTo { x, y } => {
                            op.push('M');
                            point(&mut op, x, y);
                        }
                        PathCommand::LineTo { x, y } => {
                            op.push('L');
                            point(&mut op, x, y);
                        }
                        PathCommand::QuadTo { x1, y1, x, y } => {
                            op.push('Q');
                            point(&mut op, x1, y1);
                            op.push(' ');
                            point(&mut op, x, y);
                        }
                        PathCommand::CubicTo {
                            x1,
                            y1,
                            x2,
                            y2,
                            x,
                            y,
                        } => {
                            op.push('C');
                            point(&mut op, x1, y1);
                            op.push(' ');
                            point(&mut op, x2, y2);
                            op.push(' ');
                            point(&mut op, x, y);
                        }
                        PathCommand::Close => op.push('Z'),
                    }
                }
                op.push('"');
                if !*fill {
                    op.push_str(",\"stroke\":");
                    number(&mut op, RULE);
                }
                op.push(',');
                paint(&mut op, color);
                op.push('}');
                ops.push(op);
            }
        }
    }
    if let Some(done) = run.take() {
        done.write(&mut ops);
    }
    let mut out = String::from("{\"width\":");
    // no less than nothing: `\!` and `\kern-1em` alone take room back
    number(&mut out, list.width.max(0.0));
    out.push_str(",\"height\":");
    number(&mut out, list.height);
    out.push_str(",\"depth\":");
    number(&mut out, list.depth);
    out.push_str(",\"ops\":[");
    out.push_str(&ops.join(","));
    out.push_str("]}");
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn draws_a_fraction_as_glyphs_and_a_rule() {
        let json = draw("\\frac{a}{b}", false);
        assert!(json.starts_with("{\"width\":"), "{json}");
        assert!(json.contains("\"font\":\"math:Math-Italic\""), "{json}");
        assert!(json.contains("\"chars\":true"));
        assert!(json.contains("\"op\":\"path\""));
        assert!(!json.contains("e-"), "no exponents: {json}");
    }

    #[test]
    fn draws_formulas_of_no_width() {
        for latex in ["", "\\phantom{}", "\\!", "\\hspace{-1em}"] {
            let json = draw(latex, false);
            assert!(json.starts_with("{\"width\":0,"), "{latex}: {json}");
        }
    }

    #[test]
    fn says_where_the_error_is() {
        assert_eq!(
            draw("x +\n\\nope", false),
            "{\"error\":\"Undefined control sequence: \\\\nope\",\"line\":2,\"column\":1}"
        );
    }

    #[test]
    fn keeps_an_authors_colour_and_leaves_black_the_ink() {
        let json = draw("x\\color{red}{y}", false);
        assert!(json.contains("\"color\":[255,0,0]"), "{json}");
        assert_eq!(draw("x", false).matches("\"color\"").count(), 0);
    }

    #[test]
    fn draws_textcolor_and_a_colorbox() {
        assert!(draw("\\textcolor{blue}{x}", false).contains("\"color\":[0,0,255]"));
        let boxed = draw("\\colorbox{yellow}{x}", false);
        assert!(boxed.contains("\"color\":[255,255,0]"), "{boxed}");
    }

    #[test]
    fn refuses_a_formula_larger_than_a_page() {
        for latex in [
            "\\begin{array}{c}\\hspace{100000000em}\\\\\\hdashline x\\end{array}",
            "\\begin{array}{c}\\rule{99999999999em}{1em}\\end{array}",
        ] {
            assert!(draw(latex, true).starts_with("{\"error\":"), "{latex}");
        }
    }

    #[test]
    fn dashes_a_dashed_rule() {
        let json = draw("\\begin{array}{c}a\\\\\\hdashline b\\end{array}", true);
        assert!(json.matches("\"op\":\"path\"").count() > 3, "{json}");
    }

    #[test]
    fn counts_lines_and_columns_in_characters() {
        assert_eq!(line_column("ä\nöx", 5), (2, 2));
        assert_eq!(line_column("ä", 1), (1, 1));
    }
}

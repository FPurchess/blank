//! Drawings: what a module of its own (a diagram's, maths') made of a
//! source, which the engine places like an image and draws with its own
//! ops: paths, and glyphs in its own fonts, so text stays text in the PDF.
//! The webview hands them over as JSON (`addDrawing`), keyed like images.

use std::sync::Arc;

use serde::Deserialize;
use skrifa::raw::TableProvider;
use skrifa::{FontRef, MetadataProvider};

use crate::fonts::Fonts;

/// a command of a path, in the drawing's units (y down)
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PathCmd {
    Move(f32, f32),
    Line(f32, f32),
    Quad(f32, f32, f32, f32),
    Cubic(f32, f32, f32, f32, f32, f32),
    Close,
}

/// reads a path as SVG writes one with absolute commands only (M, L, Q, C,
/// Z), the numbers apart by spaces or commas; None for anything else
pub fn read_path(d: &str) -> Option<Vec<PathCmd>> {
    let mut commands = vec![];
    let mut letter = None;
    let mut numbers: Vec<f32> = vec![];
    let finish = |letter: Option<char>, numbers: &[f32], commands: &mut Vec<PathCmd>| {
        let Some(letter) = letter else {
            return numbers.is_empty();
        };
        let (count, make): (usize, fn(&[f32]) -> PathCmd) = match letter {
            'M' => (2, |n| PathCmd::Move(n[0], n[1])),
            'L' => (2, |n| PathCmd::Line(n[0], n[1])),
            'Q' => (4, |n| PathCmd::Quad(n[0], n[1], n[2], n[3])),
            'C' => (6, |n| PathCmd::Cubic(n[0], n[1], n[2], n[3], n[4], n[5])),
            'Z' => {
                commands.push(PathCmd::Close);
                return numbers.is_empty();
            }
            _ => return false,
        };
        if numbers.is_empty() || !numbers.len().is_multiple_of(count) {
            return false;
        }
        commands.extend(numbers.chunks(count).map(make));
        true
    };
    for token in d
        .split(|c: char| c.is_whitespace() || c == ',')
        .filter(|token| !token.is_empty())
        .flat_map(|token| {
            // a letter may stand right before its first number
            let mut parts = vec![];
            let mut rest = token;
            while let Some(first) = rest.chars().next() {
                if first.is_ascii_alphabetic() {
                    parts.push(&rest[..1]);
                    rest = &rest[1..];
                } else {
                    let end = rest[1..]
                        .find(|c: char| c.is_ascii_alphabetic())
                        .map_or(rest.len(), |at| at + 1);
                    parts.push(&rest[..end]);
                    rest = &rest[end..];
                }
            }
            parts
        })
    {
        let first = token.chars().next()?;
        if first.is_ascii_alphabetic() {
            if !finish(letter, &numbers, &mut commands) {
                return None;
            }
            letter = Some(first);
            numbers.clear();
        } else {
            let number: f32 = token.parse().ok()?;
            if !number.is_finite() {
                return None;
            }
            numbers.push(number);
        }
    }
    finish(letter, &numbers, &mut commands).then_some(commands)
}

fn path<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Arc<[PathCmd]>, D::Error> {
    let d = String::deserialize(deserializer)?;
    read_path(&d)
        .map(Arc::from)
        .ok_or_else(|| serde::de::Error::custom("not a path of M, L, Q, C and Z"))
}

/// what a path or glyphs are painted in: the text's ink at a strength (0 to
/// 1), which follows the theme on the screen and prints black, or a colour
/// the author gave, as it is
#[derive(Clone, Copy, Debug, PartialEq, Deserialize)]
pub struct Paint {
    #[serde(default = "one")]
    pub alpha: f32,
    #[serde(default)]
    pub color: Option<[u8; 3]>,
}

fn one() -> f32 {
    1.0
}

impl Default for Paint {
    fn default() -> Self {
        Paint {
            alpha: 1.0,
            color: None,
        }
    }
}

/// how a line ends
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Cap {
    #[default]
    Butt,
    Round,
    Square,
}

/// how two lines meet
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Join {
    #[default]
    Miter,
    Round,
    Bevel,
}

/// the most dashes a pattern may have
pub const MAX_DASHES: usize = 64;

/// how a path's line is drawn, and which of its insides are filled: e.g.
/// Mermaid's dotted links and the replies of sequence diagrams are dashed
#[derive(Clone, Debug, Default, PartialEq, Deserialize)]
#[serde(default)]
pub struct LineStyle {
    /// lengths of dashes and gaps, in the drawing's units; none for a whole
    /// line
    #[serde(deserialize_with = "dashes")]
    pub dash: Option<Arc<[f32]>>,
    /// where the pattern starts
    pub offset: f32,
    pub cap: Cap,
    pub join: Join,
    /// the even-odd fill rule, which leaves holes where shapes overlap
    pub evenodd: bool,
}

impl LineStyle {
    pub fn is_plain(&self) -> bool {
        *self == LineStyle::default()
    }
}

/// a dash pattern of finite lengths, not all of them zero, or none
fn dashes<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<Arc<[f32]>>, D::Error> {
    let dash = Option::<Vec<f32>>::deserialize(deserializer)?;
    Ok(dash
        .filter(|dash| {
            !dash.is_empty()
                && dash.len() <= MAX_DASHES
                && dash
                    .iter()
                    .all(|length| length.is_finite() && *length >= 0.0)
                && dash.iter().any(|length| *length > 0.0)
        })
        .map(Arc::from))
}

/// the font of a drawing's glyphs: a font file of the engine by its index,
/// or a family the engine has (e.g. `math:Main-Regular`)
#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(untagged)]
pub enum GlyphFont {
    Index(usize),
    Family(String),
}

#[derive(Clone, Debug, PartialEq, Deserialize)]
#[serde(tag = "op", rename_all = "lowercase")]
pub enum DrawOp {
    /// a shape: filled, or stroked at a width
    Path {
        #[serde(deserialize_with = "path")]
        d: Arc<[PathCmd]>,
        #[serde(default)]
        stroke: Option<f32>,
        #[serde(default)]
        paint: Paint,
        #[serde(flatten)]
        style: LineStyle,
    },
    /// glyphs of one font and size, each at its place on its baseline: by
    /// their ids, or by the characters they show (`chars`), which the
    /// engine maps; `text` is what they read as, which the PDF keeps
    Glyphs {
        font: GlyphFont,
        size: f32,
        /// [glyph or character, x, y] for each
        glyphs: Vec<(u32, f32, f32)>,
        #[serde(default)]
        chars: bool,
        #[serde(default)]
        text: String,
        #[serde(default)]
        paint: Paint,
    },
}

/// a drawing: its size, how far it reaches below its baseline (maths, 0
/// for a picture), and its ops, in its own units from its top left
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct Drawing {
    pub width: f32,
    pub height: f32,
    #[serde(default)]
    pub depth: f32,
    pub ops: Vec<DrawOp>,
}

/// the most ops a drawing may have, so a broken one can't stall the pages
pub const MAX_OPS: usize = 200_000;

/// the narrowest drawing, in its units: anything narrower would be scaled
/// up past what a number can hold
pub const MIN_SIZE: f32 = 1e-3;

impl Drawing {
    /// reads a drawing as the webview sends it, None for one it can't
    pub fn read(json: &str) -> Option<Arc<Drawing>> {
        let drawing: Drawing = serde_json::from_str(json).ok()?;
        let mut drawing = drawing;
        let finite = [drawing.width, drawing.height, drawing.depth]
            .iter()
            .all(|value| value.is_finite() && *value >= 0.0);
        // too small to scale into a box without overflowing
        if !finite || drawing.width < MIN_SIZE || drawing.ops.len() > MAX_OPS {
            return None;
        }
        // what can't be drawn: glyphs of no size, lines of no width
        drawing.ops.retain(|op| match op {
            DrawOp::Glyphs { size, glyphs, .. } => {
                size.is_finite()
                    && *size > 0.0
                    && glyphs
                        .iter()
                        .all(|(_, x, y)| x.is_finite() && y.is_finite())
            }
            DrawOp::Path { stroke, style, .. } => {
                stroke.is_none_or(|width| width.is_finite() && width > 0.0)
                    && style.offset.is_finite()
            }
        });
        Some(Arc::new(drawing))
    }
}

/// writes a path as SVG path data, its commands scaled by `scale` and placed
/// at `x`, `y`, the numbers with at most three decimals
pub fn path_data(out: &mut String, d: &[PathCmd], x: f32, y: f32, scale: f32) {
    let point = |out: &mut String, letter: char, points: &[(f32, f32)]| {
        out.push(letter);
        for (index, (px, py)) in points.iter().enumerate() {
            if index > 0 {
                out.push(' ');
            }
            out.push_str(&crate::model::json_number(x + px * scale));
            out.push(' ');
            out.push_str(&crate::model::json_number(y + py * scale));
        }
    };
    for command in d {
        match *command {
            PathCmd::Move(px, py) => point(out, 'M', &[(px, py)]),
            PathCmd::Line(px, py) => point(out, 'L', &[(px, py)]),
            PathCmd::Quad(x1, y1, px, py) => point(out, 'Q', &[(x1, y1), (px, py)]),
            PathCmd::Cubic(x1, y1, x2, y2, px, py) => {
                point(out, 'C', &[(x1, y1), (x2, y2), (px, py)])
            }
            PathCmd::Close => out.push('Z'),
        }
    }
}

/// glyphs as a drawing gives them: [glyph or character, x, y]
pub type DrawnGlyphs = Vec<(u32, f32, f32)>;

/// a glyph run of a drawing as the engine draws it: its font index and its
/// glyph ids, the characters mapped through the font's charmap
pub fn resolve_glyphs(
    fonts: &Fonts,
    font: &GlyphFont,
    glyphs: &[(u32, f32, f32)],
    chars: bool,
) -> Option<(usize, DrawnGlyphs)> {
    let index = match font {
        GlyphFont::Index(index) => (*index < fonts.files.len()).then_some(*index)?,
        GlyphFont::Family(family) => fonts.files.iter().position(|file| &file.family == family)?,
    };
    let file = &fonts.files[index];
    let face = FontRef::from_index(&file.data, file.index).ok()?;
    // an id past the font's glyphs would make the PDF leave out the font,
    // the document's text in it too: the missing glyph instead
    let count = face.maxp().map_or(0, |maxp| u32::from(maxp.num_glyphs()));
    let charmap = face.charmap();
    Some((
        index,
        glyphs
            .iter()
            .map(|&(code, x, y)| {
                let glyph = if chars {
                    char::from_u32(code)
                        .and_then(|char| charmap.map(char))
                        .map_or(0, |id| id.to_u32())
                } else {
                    code
                };
                (if glyph < count { glyph } else { 0 }, x, y)
            })
            .collect(),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fonts::repository_fonts;

    const BOX: &str = r#"{"width":120,"height":40,"ops":[
        {"op":"path","d":"M0 0L120 0L120 40Z","paint":{"alpha":0.1}},
        {"op":"path","d":"M0,0 C1 2 3 4 5 6","stroke":1.5,"paint":{"color":[255,0,0]}},
        {"op":"glyphs","font":0,"size":14,"glyphs":[[40,10,25],[41,18,25]],"text":"Id"}
    ]}"#;

    #[test]
    fn reads_a_drawing() {
        let drawing = Drawing::read(BOX).unwrap();
        assert_eq!(
            (drawing.width, drawing.height, drawing.depth),
            (120.0, 40.0, 0.0)
        );
        assert_eq!(drawing.ops.len(), 3);
        assert!(matches!(
            &drawing.ops[1],
            DrawOp::Path { stroke: Some(width), paint: Paint { color: Some([255, 0, 0]), .. }, .. } if *width == 1.5
        ));
    }

    #[test]
    fn reads_paths_of_absolute_commands() {
        assert_eq!(
            read_path("M1 2L3,4Q5 6 7 8C1 2 3 4 5 6Z M0 0 L1 1 2 2").unwrap(),
            vec![
                PathCmd::Move(1.0, 2.0),
                PathCmd::Line(3.0, 4.0),
                PathCmd::Quad(5.0, 6.0, 7.0, 8.0),
                PathCmd::Cubic(1.0, 2.0, 3.0, 4.0, 5.0, 6.0),
                PathCmd::Close,
                PathCmd::Move(0.0, 0.0),
                PathCmd::Line(1.0, 1.0),
                PathCmd::Line(2.0, 2.0),
            ]
        );
        assert_eq!(
            read_path("M-15 .5").unwrap(),
            vec![PathCmd::Move(-15.0, 0.5)]
        );
        for broken in ["m1 2", "M1", "L1 2 3", "A1 1 0 0 1 2 2", "M1 x", "M NaN 1"] {
            assert!(read_path(broken).is_none(), "{broken}");
        }
    }

    #[test]
    fn writes_a_path_placed_and_scaled() {
        let mut out = String::new();
        let d = read_path("M0 0L10 0Q1 2 3 4Z").unwrap();
        path_data(&mut out, &d, 100.0, 50.0, 0.5);
        assert_eq!(out, "M100 50L105 50Q100.5 51 101.5 52Z");
    }

    #[test]
    fn reads_a_line_style_and_drops_what_cant_be_drawn() {
        let drawing = Drawing::read(
            r#"{"width":10,"height":10,"ops":[
                {"op":"path","d":"M0 0L1 1","stroke":1,"dash":[3,3],"offset":1,"cap":"round","join":"bevel"},
                {"op":"path","d":"M0 0L1 1Z","evenodd":true},
                {"op":"path","d":"M0 0L1 1","stroke":1,"dash":[0,0]},
                {"op":"path","d":"M0 0L1 1","stroke":0},
                {"op":"glyphs","font":0,"size":0,"glyphs":[[1,0,0]]}
            ]}"#,
        )
        .unwrap();
        assert_eq!(drawing.ops.len(), 3);
        let DrawOp::Path { style, .. } = &drawing.ops[0] else {
            panic!()
        };
        assert_eq!(style.dash.as_deref(), Some(&[3.0, 3.0][..]));
        assert_eq!(
            (style.offset, style.cap, style.join),
            (1.0, Cap::Round, Join::Bevel)
        );
        let DrawOp::Path { style, .. } = &drawing.ops[1] else {
            panic!()
        };
        assert!(style.evenodd);
        // a pattern of nothing is a whole line
        let DrawOp::Path { style, .. } = &drawing.ops[2] else {
            panic!()
        };
        assert!(style.is_plain());
        assert!(Drawing::read(r#"{"width":1e-38,"height":1,"ops":[]}"#).is_none());
    }

    #[test]
    fn rejects_what_isnt_one() {
        assert!(Drawing::read("{").is_none());
        assert!(Drawing::read(r#"{"width":0,"height":1,"ops":[]}"#).is_none());
        assert!(Drawing::read(r#"{"width":-1,"height":1,"ops":[]}"#).is_none());
    }

    #[test]
    fn finds_glyphs_by_font_index_or_family_and_by_character() {
        let fonts = repository_fonts();
        let (index, glyphs) =
            resolve_glyphs(&fonts, &GlyphFont::Index(0), &[(7, 1.0, 2.0)], false).unwrap();
        assert_eq!((index, glyphs), (0, vec![(7, 1.0, 2.0)]));
        let family = fonts.files[0].family.clone();
        let (index, glyphs) = resolve_glyphs(
            &fonts,
            &GlyphFont::Family(family),
            &[('A' as u32, 0.0, 0.0)],
            true,
        )
        .unwrap();
        assert_eq!(index, 0);
        assert_ne!(glyphs[0].0, 0, "the font has an A");
        assert!(resolve_glyphs(&fonts, &GlyphFont::Index(9999), &[], false).is_none());
        // an id past the font's glyphs is the missing glyph
        let (_, glyphs) =
            resolve_glyphs(&fonts, &GlyphFont::Index(0), &[(65000, 0.0, 0.0)], false).unwrap();
        assert_eq!(glyphs[0].0, 0);
        assert!(resolve_glyphs(&fonts, &GlyphFont::Family("nope".into()), &[], false).is_none());
    }
}

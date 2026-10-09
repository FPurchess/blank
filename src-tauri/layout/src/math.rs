//! Math, which the math module (src-tauri/math, RaTeX, a Rust port of
//! KaTeX) lays out as drawings (`crate::drawing`) in em, set here in the
//! KaTeX fonts at the size of the text: a formula's glyphs and paths in
//! points, laid out once and kept, for the pages and the PDF alike. The
//! webview hands each formula's drawing over (`Maths::add`); until it has,
//! a formula shows its source, as without its fonts. The fonts come in as
//! private faces of `Fonts`, see `MATH_FAMILY`, and never set ordinary text.

use std::collections::HashMap;
use std::sync::Arc;

use serde::Deserialize;
use skrifa::instance::{LocationRef, Size};
use skrifa::MetadataProvider;
use skrifa::{FontRef, GlyphId};

pub use crate::drawing::PathCmd;
use crate::drawing::{DrawOp, Drawing, GlyphFont, Paint};
use crate::fonts::Fonts;
use crate::model::MAX_PAGE;

/// how much larger than the text math is set: the KaTeX fonts' x-height
/// (442 units) to IBM Plex Sans' (516), so that x looks as tall in both
pub const MATH_SCALE: f32 = 516.0 / 442.0;

/// the family a math font is added as, before its RaTeX name, e.g.
/// "math:Main-Regular": `Fonts::add` keeps it out of the text's stacks
pub const MATH_FAMILY: &str = "math:";

/// the most formulas kept laid out; past it the cache starts over
const CACHE_LIMIT: usize = 4000;

/// the most formulas kept as the module drew them; the webview takes back
/// those its documents no longer hold, so this only bounds a mistake
const FORMULAS_LIMIT: usize = 20_000;

/// what a formula says when it's larger than any page could show
pub const TOO_LARGE: &str = "The formula is too large";

/// what a formula says whose drawing the engine can't read
const UNREADABLE: &str = "Blank can't set this formula";

/// what a formula draws, in points from the left of its box and its
/// baseline, y down
#[derive(Clone, Debug, PartialEq)]
pub enum MathOp {
    Glyph {
        font: usize,
        id: u32,
        /// its character's bytes in `MathBox::text`
        start: u32,
        end: u32,
        x: f32,
        y: f32,
        size: f32,
        /// how far it moves the pen, for the PDF's text
        advance: f32,
        paint: Paint,
    },
    /// filled, or stroked at a width: rules, radicals, big delimiters
    Path {
        d: Arc<[PathCmd]>,
        stroke: Option<f32>,
        paint: Paint,
    },
}

/// a formula laid out: its advance, how far it reaches above and below the
/// baseline, and what it draws
#[derive(Clone, Debug, PartialEq)]
pub struct MathBox {
    pub width: f32,
    pub height: f32,
    pub depth: f32,
    pub ops: Vec<MathOp>,
    /// the characters of its glyphs, in order: what the PDF's text holds
    pub text: Arc<str>,
    /// the characters no font has a glyph for, which it leaves out, see
    /// Engine::missing
    pub missing: Vec<char>,
}

/// why a formula can't be set, with where in its source (1-based)
#[derive(Clone, Debug, PartialEq, Deserialize)]
pub struct MathError {
    #[serde(rename = "error")]
    pub message: String,
    pub line: u32,
    pub column: u32,
}

#[derive(Clone, Debug, PartialEq)]
pub enum MathLaid {
    Ok(Arc<MathBox>),
    Err(MathError),
    /// the math fonts or the formula's drawing aren't there yet: the
    /// webview adds them when a document has math
    NoFonts,
}

/// what the math module made of a formula
#[derive(Clone, Debug, PartialEq)]
enum Formula {
    Drawn(Arc<Drawing>),
    Failed(MathError),
}

/// the math fonts by their RaTeX names, the formulas as the module drew
/// them, and the formulas laid out so far
#[derive(Default, Clone)]
pub struct Maths {
    pub fonts: HashMap<String, usize>,
    glyphs: HashMap<(usize, u32), Option<u32>>,
    formulas: HashMap<(String, bool), Formula>,
    cache: HashMap<(String, bool, u32), MathLaid>,
    /// how wide the widest number of a formula is, in the text's fonts,
    /// see `items::math`
    pub number_width: Option<f32>,
}

impl Maths {
    /// a math font was added: what was laid out without it is stale
    pub fn add_font(&mut self, name: &str, file: usize) {
        self.fonts.insert(name.to_string(), file);
        self.forget();
    }

    /// forgets the formulas laid out and the width of a number, after a
    /// font was added: a text font may have what a formula lacked
    pub fn forget(&mut self) {
        self.cache.clear();
        self.number_width = None;
    }

    /// keeps what the math module made of a formula: a drawing, or what is
    /// wrong with it (`{error, line, column}`); false for JSON it can't read
    pub fn add(&mut self, latex: &str, display: bool, json: &str) -> bool {
        // what is wrong with it, or a drawing, each read once
        let formula = if json.starts_with("{\"error\"") {
            match serde_json::from_str::<MathError>(json) {
                Ok(failed) => Formula::Failed(failed),
                Err(_) => return false,
            }
        } else {
            match Drawing::read_at_least(json, 0.0) {
                Some(drawing) => Formula::Drawn(drawing),
                // one the engine can't draw (too many ops): kept as one it
                // can't set, so it isn't sent again
                None if json.starts_with('{') => Formula::Failed(MathError {
                    message: UNREADABLE.to_string(),
                    line: 1,
                    column: 1,
                }),
                None => return false,
            }
        };
        if self.formulas.len() >= FORMULAS_LIMIT {
            self.formulas.clear();
            self.cache.clear();
        }
        self.uncache(latex, display);
        self.formulas.insert((latex.to_string(), display), formula);
        true
    }

    /// takes back a formula the webview's documents no longer hold
    pub fn remove(&mut self, latex: &str, display: bool) {
        self.formulas.remove(&(latex.to_string(), display));
        self.uncache(latex, display);
    }

    fn uncache(&mut self, latex: &str, display: bool) {
        self.cache
            .retain(|(known, shown, _), _| !(known == latex && *shown == display));
    }

    /// how many formulas are laid out, for the tests
    #[cfg(test)]
    pub fn cached(&self) -> usize {
        self.cache.len()
    }

    pub fn has_fonts(&self) -> bool {
        !self.fonts.is_empty()
    }
}

/// lays out a formula at a text size in points: display math in display
/// style, inline math in text style, as the math module drew it
pub fn layout(fonts: &mut Fonts, latex: &str, display: bool, size: f32) -> MathLaid {
    if !fonts.maths.has_fonts() {
        return MathLaid::NoFonts;
    }
    let key = (latex.to_string(), display, size.to_bits());
    if let Some(laid) = fonts.maths.cache.get(&key) {
        return laid.clone();
    }
    // the tests draw with the module itself, as the webview would have
    #[cfg(all(test, not(target_arch = "wasm32")))]
    if !fonts
        .maths
        .formulas
        .contains_key(&(latex.to_string(), display))
    {
        let json = blank_math::draw(latex, display);
        fonts.maths.add(latex, display, &json);
    }
    let laid = match fonts.maths.formulas.get(&(latex.to_string(), display)) {
        // drawn soon, and laid out again then
        None => return MathLaid::NoFonts,
        Some(Formula::Failed(failed)) => MathLaid::Err(failed.clone()),
        Some(Formula::Drawn(drawing)) => {
            let drawing = drawing.clone();
            set(fonts, &drawing, size)
        }
    };
    if fonts.maths.cache.len() >= CACHE_LIMIT {
        fonts.maths.cache.clear();
    }
    fonts.maths.cache.insert(key, laid.clone());
    laid
}

/// sets a drawing of the module, in em from its top left, at a text size:
/// in points from its baseline, its glyphs found in the math fonts
fn set(fonts: &mut Fonts, drawing: &Drawing, size: f32) -> MathLaid {
    let em = size * MATH_SCALE;
    // a formula larger than the largest page (`\hspace{100000000em}`) can't
    // be shown, and drawing it would cost as much as its size
    let fits = |extent: f32| {
        let points = extent * em;
        points.is_finite() && points.abs() <= MAX_PAGE
    };
    if !(fits(drawing.width) && fits(drawing.height) && fits(drawing.depth)) {
        return MathLaid::Err(MathError {
            message: TOO_LARGE.to_string(),
            line: 1,
            column: 1,
        });
    }
    let baseline = drawing.height;
    let at = |x: f32, y: f32| (x * em, (y - baseline) * em);
    let mut ops = Vec::with_capacity(drawing.ops.len());
    let mut text = String::new();
    let mut missing = vec![];
    for op in &drawing.ops {
        match op {
            DrawOp::Glyphs {
                font: GlyphFont::Family(family),
                size: scale,
                glyphs,
                paint,
                ..
            } => {
                let name = family.strip_prefix(MATH_FAMILY).unwrap_or(family);
                for &(code, x, y) in glyphs {
                    let Some(ch) = char::from_u32(code) else {
                        continue;
                    };
                    let Some((font, id)) = glyph(fonts, name, ch) else {
                        // told, so that a fallback font for it gets added
                        if !ch.is_whitespace() && !ch.is_control() && !missing.contains(&ch) {
                            missing.push(ch);
                        }
                        continue;
                    };
                    let (x, y) = at(x, y);
                    let size = scale * em;
                    let start = text.len() as u32;
                    text.push(ch);
                    ops.push(MathOp::Glyph {
                        font,
                        id,
                        start,
                        end: text.len() as u32,
                        x,
                        y,
                        size,
                        advance: advance(fonts, font, id) * size,
                        paint: *paint,
                    });
                }
            }
            // the module names its fonts by family, never by index
            DrawOp::Glyphs { .. } => {}
            DrawOp::Path {
                d, stroke, paint, ..
            } => {
                let point = |x: f32, y: f32| at(x, y);
                let d: Vec<PathCmd> = d
                    .iter()
                    .map(|command| match *command {
                        PathCmd::Move(x, y) => {
                            let (x, y) = point(x, y);
                            PathCmd::Move(x, y)
                        }
                        PathCmd::Line(x, y) => {
                            let (x, y) = point(x, y);
                            PathCmd::Line(x, y)
                        }
                        PathCmd::Quad(x1, y1, x, y) => {
                            let (x1, y1) = point(x1, y1);
                            let (x, y) = point(x, y);
                            PathCmd::Quad(x1, y1, x, y)
                        }
                        PathCmd::Cubic(x1, y1, x2, y2, x, y) => {
                            let (x1, y1) = point(x1, y1);
                            let (x2, y2) = point(x2, y2);
                            let (x, y) = point(x, y);
                            PathCmd::Cubic(x1, y1, x2, y2, x, y)
                        }
                        PathCmd::Close => PathCmd::Close,
                    })
                    .collect();
                ops.push(MathOp::Path {
                    d: d.into(),
                    stroke: stroke.map(|width| width * em),
                    paint: *paint,
                });
            }
        }
    }
    MathLaid::Ok(Arc::new(MathBox {
        width: drawing.width * em,
        height: drawing.height * em,
        depth: drawing.depth * em,
        ops,
        text: text.into(),
        missing,
    }))
}

/// a glyph's advance in em
fn advance(fonts: &Fonts, font: usize, id: u32) -> f32 {
    let face = &fonts.files[font];
    FontRef::from_index(&face.data, face.index)
        .ok()
        .and_then(|font| {
            font.glyph_metrics(Size::unscaled(), LocationRef::default())
                .advance_width(GlyphId::new(id))
        })
        .map_or(0.0, |width| width / face.upem)
}

/// the font and glyph of a character in a RaTeX font: one of the KaTeX
/// fonts, else (for what they lack, e.g. the scripts RaTeX names CJK, or
/// Chinese in `\text`) the first text font that has it, a fallback font
/// among them
fn glyph(fonts: &mut Fonts, name: &str, ch: char) -> Option<(usize, u32)> {
    let named = fonts.maths.fonts.get(name).copied();
    let candidates: Vec<usize> = named
        .into_iter()
        .chain(
            (0..fonts.files.len())
                .filter(|file| !fonts.files[*file].family.starts_with(MATH_FAMILY)),
        )
        .collect();
    candidates.into_iter().find_map(|file| {
        let key = (file, ch as u32);
        let id = match fonts.maths.glyphs.get(&key) {
            Some(id) => *id,
            None => {
                let face = &fonts.files[file];
                let id = FontRef::from_index(&face.data, face.index)
                    .ok()
                    .and_then(|font| font.charmap().map(ch))
                    .map(GlyphId::to_u32)
                    .filter(|id| *id != 0);
                fonts.maths.glyphs.insert(key, id);
                id
            }
        };
        id.map(|id| (file, id))
    })
}

#[cfg(all(test, not(target_arch = "wasm32")))]
pub mod tests {
    use super::*;
    use crate::fonts::repository_fonts;

    /// the repository's fonts with the KaTeX fonts added as math fonts
    pub fn math_fonts() -> Fonts {
        let mut fonts = repository_fonts();
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../fonts/katex/");
        for name in MATH_FONT_FILES {
            let bytes = std::fs::read(format!("{dir}KaTeX_{name}.ttf")).expect("math font");
            fonts.add(bytes, &format!("{MATH_FAMILY}{name}"));
        }
        fonts
    }

    /// the KaTeX fonts by their RaTeX names, as src/math/fonts.ts loads them
    pub const MATH_FONT_FILES: [&str; 20] = [
        "AMS-Regular",
        "Caligraphic-Bold",
        "Caligraphic-Regular",
        "Fraktur-Bold",
        "Fraktur-Regular",
        "Main-Bold",
        "Main-BoldItalic",
        "Main-Italic",
        "Main-Regular",
        "Math-BoldItalic",
        "Math-Italic",
        "SansSerif-Bold",
        "SansSerif-Italic",
        "SansSerif-Regular",
        "Script-Regular",
        "Size1-Regular",
        "Size2-Regular",
        "Size3-Regular",
        "Size4-Regular",
        "Typewriter-Regular",
    ];

    fn laid(fonts: &mut Fonts, latex: &str, display: bool) -> Arc<MathBox> {
        match layout(fonts, latex, display, 12.0) {
            MathLaid::Ok(laid) => laid,
            other => panic!("{latex}: {other:?}"),
        }
    }

    #[test]
    fn needs_its_fonts() {
        let mut fonts = repository_fonts();
        assert_eq!(layout(&mut fonts, "x", false, 12.0), MathLaid::NoFonts);
    }

    #[test]
    fn keeps_math_fonts_out_of_the_text() {
        let fonts = math_fonts();
        assert_eq!(fonts.maths.fonts.len(), MATH_FONT_FILES.len());
        assert!(fonts
            .stack
            .iter()
            .all(|family| !family.starts_with(MATH_FAMILY)));
        assert!(fonts
            .mono_stack
            .iter()
            .all(|family| !family.starts_with(MATH_FAMILY)));
    }

    #[test]
    fn lays_out_a_fraction() {
        let mut fonts = math_fonts();
        let box_ = laid(&mut fonts, r"\frac{a}{b}", true);
        let glyphs: Vec<char> = box_
            .ops
            .iter()
            .filter_map(|op| match op {
                MathOp::Glyph { start, end, .. } => {
                    Some(box_.text[*start as usize..*end as usize].to_string())
                }
                _ => None,
            })
            .collect::<Vec<String>>()
            .concat()
            .chars()
            .collect();
        assert_eq!(glyphs, ['a', 'b']);
        assert_eq!(&*box_.text, "ab");
        // the bar
        assert!(box_.ops.iter().any(|op| matches!(op, MathOp::Path { .. })));
        // a above the baseline, b below it
        let ys: Vec<f32> = box_
            .ops
            .iter()
            .filter_map(|op| match op {
                MathOp::Glyph { y, .. } => Some(*y),
                _ => None,
            })
            .collect();
        assert!(ys[0] < 0.0 && ys[1] > 0.0, "{ys:?}");
        assert!(box_.height > 0.0 && box_.depth > 0.0 && box_.width > 0.0);
    }

    #[test]
    fn inline_is_smaller_than_display() {
        let mut fonts = math_fonts();
        let inline = laid(&mut fonts, r"\sum_{i=1}^n i", false);
        let display = laid(&mut fonts, r"\sum_{i=1}^n i", true);
        assert!(display.height > inline.height);
    }

    #[test]
    fn sets_every_formula_of_the_corpus() {
        let mut fonts = math_fonts();
        let corpus = include_str!("../tests/math_corpus.txt");
        for latex in corpus.lines().filter(|line| !line.trim().is_empty()) {
            let box_ = laid(&mut fonts, latex, true);
            assert!(box_.width > 0.0, "{latex}");
            let glyphs = box_
                .ops
                .iter()
                .filter(|op| matches!(op, MathOp::Glyph { .. }))
                .count();
            assert!(glyphs > 0, "{latex} draws no glyph");
        }
    }

    #[test]
    fn finds_every_glyph_in_the_katex_fonts() {
        let mut fonts = math_fonts();
        let corpus = include_str!("../tests/math_corpus.txt");
        for latex in corpus.lines().filter(|line| !line.trim().is_empty()) {
            let drawing = Drawing::read(&blank_math::draw(latex, true)).expect(latex);
            for op in &drawing.ops {
                let DrawOp::Glyphs {
                    font: GlyphFont::Family(family),
                    glyphs,
                    ..
                } = op
                else {
                    continue;
                };
                let name = family.strip_prefix(MATH_FAMILY).unwrap();
                for &(code, ..) in glyphs {
                    let ch = char::from_u32(code).unwrap();
                    let file = glyph(&mut fonts, name, ch).map(|(file, _)| file);
                    assert!(
                        file.is_some() && file == fonts.maths.fonts.get(name).copied(),
                        "{latex}: no glyph for {ch:?} in {name}"
                    );
                }
            }
        }
    }

    #[test]
    fn agrees_with_the_math_module() {
        // the module names the fonts and words the errors as the engine does
        assert_eq!(MATH_FAMILY, blank_math::MATH_FAMILY);
        assert_eq!(TOO_LARGE, blank_math::TOO_LARGE);
    }

    #[test]
    fn keeps_the_authors_colour() {
        let mut fonts = math_fonts();
        let box_ = laid(&mut fonts, r"x\color{red}{y}", false);
        let colors: Vec<Option<[u8; 3]>> = box_
            .ops
            .iter()
            .filter_map(|op| match op {
                MathOp::Glyph { paint, .. } => Some(paint.color),
                _ => None,
            })
            .collect();
        assert_eq!(colors, [None, Some([255, 0, 0])]);
    }

    #[test]
    fn keeps_a_drawing_until_it_is_taken_back() {
        let mut fonts = math_fonts();
        assert!(fonts
            .maths
            .add("y", false, r#"{"error":"Nope","line":1,"column":2}"#));
        assert_eq!(
            layout(&mut fonts, "y", false, 12.0),
            MathLaid::Err(MathError {
                message: "Nope".into(),
                line: 1,
                column: 2
            })
        );
        assert!(!fonts.maths.add("y", false, "not json"));
        // what can't be drawn is a formula that can't be set
        assert!(fonts.maths.add("z", false, r#"{"width":-1}"#));
        assert!(matches!(
            layout(&mut fonts, "z", false, 12.0),
            MathLaid::Err(_)
        ));
        // taken back, the module's drawing comes in its place
        fonts.maths.remove("y", false);
        assert!(matches!(
            layout(&mut fonts, "y", false, 12.0),
            MathLaid::Ok(_)
        ));
    }

    #[test]
    fn tells_the_characters_no_font_has() {
        let mut fonts = math_fonts();
        let box_ = laid(&mut fonts, r"x + \text{日本}", false);
        assert_eq!(box_.missing, ['日', '本']);
        assert_eq!(&*box_.text, "x+");
        // what the math fonts lack, a text font sets: ŋ from IBM Plex Sans
        let box_ = laid(&mut fonts, r"\text{ŋ}", false);
        assert!(box_.missing.is_empty(), "{:?}", box_.missing);
        assert!(box_.ops.iter().any(|op| matches!(
            op,
            MathOp::Glyph { font, .. } if !fonts.files[*font].family.starts_with(MATH_FAMILY)
        )));
    }

    #[test]
    fn sets_a_formula_again_once_a_fallback_font_is_added() {
        let mut fonts = math_fonts();
        assert_eq!(laid(&mut fonts, r"\text{🦀}", false).missing, ['🦀']);
        let noto = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fonts/NotoEmoji-VariableFont_wght.ttf"
        ))
        .unwrap();
        fonts.add(noto, "Noto Emoji");
        let crab = laid(&mut fonts, r"\text{🦀}", false);
        assert!(crab.missing.is_empty(), "{:?}", crab.missing);
        assert_eq!(&*crab.text, "🦀");
    }

    #[test]
    fn says_where_the_error_is() {
        let mut fonts = math_fonts();
        let MathLaid::Err(error) = layout(&mut fonts, "a +\n\\nosuchthing", true, 12.0) else {
            panic!("no error");
        };
        assert_eq!((error.line, error.column), (2, 1));
        assert!(error.message.contains("nosuchthing"), "{}", error.message);
    }

    #[test]
    fn keeps_what_it_laid_out() {
        let mut fonts = math_fonts();
        let first = laid(&mut fonts, "x^2", false);
        let again = laid(&mut fonts, "x^2", false);
        assert!(Arc::ptr_eq(&first, &again));
    }

    #[test]
    fn refuses_a_formula_larger_than_a_page() {
        let mut fonts = math_fonts();
        for latex in [
            r"\begin{array}{c}\hspace{100000000em}\\\hdashline x\end{array}",
            r"\begin{array}{c}\rule{99999999999em}{1em}\\\hdashline x\end{array}",
        ] {
            let started = std::time::Instant::now();
            let MathLaid::Err(error) = layout(&mut fonts, latex, true, 12.0) else {
                panic!("{latex} was set");
            };
            assert_eq!(error.message, TOO_LARGE);
            assert!(started.elapsed().as_secs() < 2, "{latex} took too long");
        }
    }

    #[test]
    fn dashes_a_long_rule() {
        let mut fonts = math_fonts();
        let box_ = laid(
            &mut fonts,
            r"\begin{array}{c}\hspace{20em}\\\hdashline x\end{array}",
            true,
        );
        let rules = box_
            .ops
            .iter()
            .filter(|op| matches!(op, MathOp::Path { .. }))
            .count();
        assert!(rules > 10, "{rules} rules");
    }
}

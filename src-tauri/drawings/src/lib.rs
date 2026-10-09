//! Blank's module for diagrams: it reads a diagram's SVG with usvg and
//! writes it as a drawing (see `blank_layout::drawing`), its shapes as paths
//! and its text as glyphs of the layout engine's own font files, so the
//! pages and the PDF draw it as they draw text, which stays text. It loads
//! only with the first diagram, so the engine starts without it.
//!
//! The SVG's colours come as Blank's ink in `INK` (`rgb(1,2,3)` at a
//! strength, see src/engine/vectors.ts), a colour no author writes, so an
//! author's own black stays black: `INK` becomes the ink at that
//! strength, any other colour the author's own. What a drawing can't hold
//! degrades: gradients become their average colour, patterns, images,
//! filters, masks and clip paths are left out, and text that isn't upright
//! becomes paths.

use std::collections::HashMap;
use std::fmt::Write;
use std::sync::Arc;

use usvg::fontdb::{Database, Source, ID};
use usvg::tiny_skia_path::{PathSegment, Transform};
use usvg::{
    FillRule, FontResolver, Group, ImageHrefResolver, LineCap, LineJoin, Node, Options, Paint, Tree,
};

#[cfg(target_arch = "wasm32")]
mod wasm;

/// the largest drawing read, as `sanitizeSvg` takes no larger one
pub const MAX_SVG: usize = 2 * 1024 * 1024;

/// the family a drawing's text gets when it names none the module has
const FAMILY: &str = "IBM Plex Sans";

/// a drawing, and the characters of its labels no font has
pub struct Drawn {
    pub json: String,
    pub missing: String,
}

/// The fonts drawings are set in: the layout engine's files, in its order,
/// each face by the index the engine knows it by.
pub struct Drawings {
    db: Arc<Database>,
    /// the engine's index of each face
    indices: HashMap<ID, usize>,
    /// how many faces the engine has, the next one's index
    faces: usize,
}

impl Default for Drawings {
    fn default() -> Self {
        Drawings {
            db: Arc::new(Database::new()),
            indices: HashMap::new(),
            faces: 0,
        }
    }
}

impl Drawings {
    /// adds a font file, as the engine adds it: each of its faces gets the
    /// next index, counted as the engine counts them (src-tauri/layout's
    /// fonts.rs: every face of a collection, or one), even those fontdb
    /// leaves out, so the indices after them stay the engine's
    pub fn add_font(&mut self, bytes: Vec<u8>) {
        let count = ttf_parser::fonts_in_collection(&bytes).map_or(1, |count| count as usize);
        let base = self.faces;
        let db = Arc::make_mut(&mut self.db);
        let ids = db.load_font_source(Source::Binary(Arc::new(bytes)));
        for id in ids {
            if let Some(face) = db.face(id) {
                self.indices.insert(id, base + face.index as usize);
            }
        }
        self.faces += count;
        db.set_sans_serif_family(FAMILY);
        db.set_serif_family(FAMILY);
        db.set_monospace_family("IBM Plex Mono");
    }

    /// a diagram's SVG as a drawing, in the JSON the engine reads, and the
    /// characters of its labels no font has, which the webview looks up in
    /// the system's fonts (src/engine/fallback.ts) and draws it again with;
    /// None for one too large or that isn't SVG. Only `data:` pictures
    /// inside it are read, never files.
    pub fn draw(&self, svg: &str) -> Option<Drawn> {
        if svg.len() > MAX_SVG {
            return None;
        }
        let options = Options {
            font_family: FAMILY.to_string(),
            fontdb: self.db.clone(),
            image_href_resolver: ImageHrefResolver {
                resolve_data: ImageHrefResolver::default_data_resolver(),
                resolve_string: Box::new(|_, _| None),
            },
            font_resolver: FontResolver {
                select_font: FontResolver::default_font_selector(),
                select_fallback: Box::new(fallback),
            },
            ..Options::default()
        };
        let tree = Tree::from_str(svg, &options).ok()?;
        let mut ops = vec![];
        let mut missing = String::new();
        self.group(tree.root(), 1.0, &mut ops, &mut missing);
        let size = tree.size();
        Some(Drawn {
            json: format!(
                "{{\"width\":{},\"height\":{},\"ops\":[{}]}}",
                number(size.width()),
                number(size.height()),
                ops.join(",")
            ),
            missing,
        })
    }

    fn group(&self, group: &Group, opacity: f32, ops: &mut Vec<String>, missing: &mut String) {
        let opacity = opacity * group.opacity().get();
        for node in group.children() {
            match node {
                Node::Group(inner) => self.group(inner, opacity, ops, missing),
                Node::Path(path) if path.is_visible() => {
                    let d = path_data(path.data(), path.abs_transform());
                    if d.is_empty() {
                        continue;
                    }
                    if let Some(fill) = path.fill() {
                        if let Some(paint) = paint_of(fill.paint(), fill.opacity().get() * opacity)
                        {
                            let rule = if fill.rule() == FillRule::EvenOdd {
                                ",\"evenodd\":true"
                            } else {
                                ""
                            };
                            ops.push(format!(
                                "{{\"op\":\"path\",\"d\":\"{d}\",\"paint\":{paint}{rule}}}"
                            ));
                        }
                    }
                    if let Some(stroke) = path.stroke() {
                        let scale = scale_of(path.abs_transform());
                        let width = stroke.width().get() * scale;
                        if let Some(paint) =
                            paint_of(stroke.paint(), stroke.opacity().get() * opacity)
                        {
                            ops.push(format!(
                                "{{\"op\":\"path\",\"d\":\"{d}\",\"stroke\":{},\"paint\":{paint}{}}}",
                                number(width),
                                line_style(stroke, scale)
                            ));
                        }
                    }
                }
                Node::Path(_) | Node::Image(_) => {}
                Node::Text(text) => {
                    if !self.glyphs(text, opacity, ops, missing) {
                        // not upright, or of a font the engine hasn't: as paths
                        self.group(text.flattened(), opacity, ops, missing);
                    }
                }
            }
        }
    }

    /// writes a text's glyphs, a run for each span and font, so a fallback
    /// font within a label (e.g. for 日本語 or ⇒) stays text too; false,
    /// writing nothing, for text that isn't upright or has a glyph of a font
    /// the engine hasn't. The characters no font has go into `missing`.
    fn glyphs(
        &self,
        text: &usvg::Text,
        opacity: f32,
        ops: &mut Vec<String>,
        missing: &mut String,
    ) -> bool {
        struct Run {
            font: usize,
            size: f32,
            glyphs: String,
            text: String,
        }
        let mut written = vec![];
        for span in text.layouted() {
            if !span.visible || span.positioned_glyphs.is_empty() {
                continue;
            }
            let Some(paint) = span
                .fill
                .as_ref()
                .and_then(|fill| paint_of(fill.paint(), fill.opacity().get() * opacity))
            else {
                // outlined text: its outlines, as paths
                if span.stroke.is_some() {
                    return false;
                }
                continue;
            };
            let mut runs: Vec<Run> = vec![];
            // what no font has, rotated labels' too, which go on as paths
            for glyph in &span.positioned_glyphs {
                if glyph.id.0 == 0 {
                    for char in glyph.text.chars() {
                        if !char.is_whitespace() && !missing.contains(char) {
                            missing.push(char);
                        }
                    }
                }
            }
            for glyph in &span.positioned_glyphs {
                let Some(&font) = self.indices.get(&glyph.font) else {
                    return false;
                };
                let ts = text.abs_transform().pre_concat(glyph.transform());
                // upright: no rotation or skew, the same scale both ways
                if ts.kx.abs() > 1e-4
                    || ts.ky.abs() > 1e-4
                    || ts.sx <= 0.0
                    || (ts.sx - ts.sy).abs() > 1e-4
                {
                    return false;
                }
                let size = glyph.font_size() * scale_of(text.abs_transform());
                if runs
                    .last()
                    .is_none_or(|run| run.font != font || run.size != size)
                {
                    runs.push(Run {
                        font,
                        size,
                        glyphs: String::new(),
                        text: String::new(),
                    });
                }
                let run = runs.last_mut().expect("a run");
                if !run.glyphs.is_empty() {
                    run.glyphs.push(',');
                }
                let _ = write!(
                    run.glyphs,
                    "[{},{},{}]",
                    glyph.id.0,
                    number(ts.tx),
                    number(ts.ty)
                );
                run.text.push_str(&glyph.text);
            }
            // too small to show
            for run in runs.into_iter().filter(|run| number(run.size) != "0") {
                written.push(format!(
                    "{{\"op\":\"glyphs\",\"font\":{},\"size\":{},\"glyphs\":[{}],\"text\":{},\"paint\":{paint}}}",
                    run.font,
                    number(run.size),
                    run.glyphs,
                    json_string(&run.text)
                ));
            }
        }
        ops.extend(written);
        true
    }
}

/// the face a character falls back to: of the same style, the nearest
/// weight first, then the engine's order, the first that has it. When none
/// has it, a face of a family not tried yet: usvg stops falling back at the
/// first character it finds no face for, and the characters after it (e.g.
/// the ⇒ after a 日本語 no font has) would be left without theirs. One face
/// per family keeps the shaping again to a few times per label.
fn fallback(char: char, used: &[ID], db: &mut Arc<Database>) -> Option<ID> {
    let base = db.face(*used.first()?)?;
    let (style, weight) = (base.style, i32::from(base.weight.0));
    let family = |id: ID| {
        db.face(id)
            .and_then(|face| face.families.first())
            .map(|family| &family.0)
    };
    let tried: Vec<&String> = used.iter().filter_map(|id| family(*id)).collect();
    let mut candidates: Vec<_> = db
        .faces()
        .filter(|face| face.style == style && !used.contains(&face.id))
        .collect();
    candidates.sort_by_key(|face| (i32::from(face.weight.0) - weight).abs());
    candidates
        .iter()
        .find(|face| has_char(db, face.id, char))
        .or_else(|| {
            candidates
                .iter()
                .find(|face| family(face.id).is_some_and(|name| !tried.contains(&name)))
        })
        .map(|face| face.id)
}

fn has_char(db: &Database, id: ID, char: char) -> bool {
    db.with_face_data(id, |data, index| {
        ttf_parser::Face::parse(data, index)
            .ok()
            .and_then(|face| face.glyph_index(char))
            .is_some()
    })
    .unwrap_or(false)
}

/// a stroke's dashes, caps and joins as the drawing's keys, in its units;
/// none for a plain line
fn line_style(stroke: &usvg::Stroke, scale: f32) -> String {
    let mut out = String::new();
    if let Some(dash) = stroke.dasharray() {
        let lengths: Vec<String> = dash.iter().map(|length| number(length * scale)).collect();
        let _ = write!(
            out,
            ",\"dash\":[{}],\"offset\":{}",
            lengths.join(","),
            number(stroke.dashoffset() * scale)
        );
    }
    match stroke.linecap() {
        LineCap::Butt => {}
        LineCap::Round => out.push_str(",\"cap\":\"round\""),
        LineCap::Square => out.push_str(",\"cap\":\"square\""),
    }
    match stroke.linejoin() {
        LineJoin::Miter | LineJoin::MiterClip => {}
        LineJoin::Round => out.push_str(",\"join\":\"round\""),
        LineJoin::Bevel => out.push_str(",\"join\":\"bevel\""),
    }
    out
}

/// how much a transform scales lengths
fn scale_of(ts: Transform) -> f32 {
    (ts.sx * ts.sy - ts.kx * ts.ky).abs().sqrt()
}

/// the colour the webview writes Blank's ink in, `DRAWING_INK` in
/// src/engine/vectors.ts
pub const INK: (u8, u8, u8) = (1, 2, 3);

/// a paint as the engine takes it: `INK` as Blank's ink at a strength, any
/// other colour as it is; a gradient as the average of its stops, a pattern
/// not at all
fn paint_of(paint: &Paint, opacity: f32) -> Option<String> {
    let (color, alpha) = match paint {
        Paint::Color(color) => (*color, opacity),
        Paint::LinearGradient(gradient) => average(gradient.stops(), opacity)?,
        Paint::RadialGradient(gradient) => average(gradient.stops(), opacity)?,
        Paint::Pattern(_) => return None,
    };
    if alpha <= 0.0 {
        return None;
    }
    let alpha = number(alpha.min(1.0));
    Some(if (color.red, color.green, color.blue) == INK {
        format!("{{\"alpha\":{alpha}}}")
    } else {
        format!(
            "{{\"alpha\":{alpha},\"color\":[{},{},{}]}}",
            color.red, color.green, color.blue
        )
    })
}

fn average(stops: &[usvg::Stop], opacity: f32) -> Option<(usvg::Color, f32)> {
    if stops.is_empty() {
        return None;
    }
    let count = stops.len() as f32;
    let channel = |pick: fn(&usvg::Stop) -> u8| {
        (stops.iter().map(|stop| pick(stop) as f32).sum::<f32>() / count).round() as u8
    };
    let alpha = stops.iter().map(|stop| stop.opacity().get()).sum::<f32>() / count;
    Some((
        usvg::Color::new_rgb(
            channel(|stop| stop.color().red),
            channel(|stop| stop.color().green),
            channel(|stop| stop.color().blue),
        ),
        alpha * opacity,
    ))
}

/// a path as SVG path data of absolute commands, in the drawing's units
fn path_data(path: &usvg::tiny_skia_path::Path, ts: Transform) -> String {
    let Some(path) = path.clone().transform(ts) else {
        return String::new();
    };
    let mut d = String::new();
    let point = |d: &mut String, letter: char, points: &[(f32, f32)]| {
        d.push(letter);
        for (index, (x, y)) in points.iter().enumerate() {
            if index > 0 {
                d.push(' ');
            }
            d.push_str(&number(*x));
            d.push(' ');
            d.push_str(&number(*y));
        }
    };
    for segment in path.segments() {
        match segment {
            PathSegment::MoveTo(p) => point(&mut d, 'M', &[(p.x, p.y)]),
            PathSegment::LineTo(p) => point(&mut d, 'L', &[(p.x, p.y)]),
            PathSegment::QuadTo(a, p) => point(&mut d, 'Q', &[(a.x, a.y), (p.x, p.y)]),
            PathSegment::CubicTo(a, b, p) => {
                point(&mut d, 'C', &[(a.x, a.y), (b.x, b.y), (p.x, p.y)])
            }
            PathSegment::Close => d.push('Z'),
        }
    }
    d
}

/// a number with at most three decimals, never in exponent form
fn number(value: f32) -> String {
    if !value.is_finite() {
        return "0".into();
    }
    let rounded = (value * 1000.0).round() / 1000.0;
    let text = format!("{rounded:.3}");
    let text = text.trim_end_matches('0').trim_end_matches('.');
    if text == "-0" {
        "0".into()
    } else {
        text.into()
    }
}

fn json_string(text: &str) -> String {
    let mut out = String::from("\"");
    for char in text.chars() {
        match char {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            char if (char as u32) < 0x20 => {
                let _ = write!(out, "\\u{:04x}", char as u32);
            }
            char => out.push(char),
        }
    }
    out.push('"');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fonts() -> Drawings {
        let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../fonts/");
        let mut drawings = Drawings::default();
        for file in [
            "IBMPlexSans-Regular.ttf",
            "IBMPlexSans-Italic.ttf",
            "dejavu-sans.ttf",
        ] {
            drawings.add_font(std::fs::read(format!("{dir}{file}")).unwrap());
        }
        drawings
    }

    const LABELLED: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" width="160" height="60" viewBox="0 0 160 60"><rect x="2" y="2" width="156" height="56" fill="rgba(1,2,3,0.1)" stroke="#c81e1e"/><text x="80" y="36" text-anchor="middle" font-family="IBM Plex Sans" font-size="16" fill="rgb(1,2,3)">Idea</text><rect width="1" height="1" fill="#000"/></svg>"##;

    #[test]
    fn draws_shapes_as_paths_and_text_as_glyphs() {
        let json = fonts().draw(LABELLED).unwrap().json;
        assert!(
            json.starts_with(r#"{"width":160,"height":60,"ops":["#),
            "{json}"
        );
        // the fill in ink at its strength, the stroke in the author's colour
        assert!(json.contains(r#""paint":{"alpha":0.102}"#), "{json}");
        assert!(
            json.contains(r#""stroke":1,"paint":{"alpha":1,"color":[200,30,30]}"#),
            "{json}"
        );
        assert!(
            json.contains(r#""op":"glyphs","font":0,"size":16"#),
            "{json}"
        );
        assert!(json.contains(r#""text":"Idea""#), "{json}");
        // the author's own black stays black
        assert!(
            json.contains(r#""paint":{"alpha":1,"color":[0,0,0]}"#),
            "{json}"
        );
    }

    #[test]
    fn writes_text_that_isnt_upright_as_paths() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="50" y="50" transform="rotate(-90 50 50)" font-size="12">Axis</text></svg>"#;
        let json = fonts().draw(svg).unwrap().json;
        assert!(!json.contains("glyphs"), "{json}");
        assert!(json.contains(r#""op":"path""#), "{json}");
    }

    #[test]
    fn rejects_what_isnt_svg_or_is_too_large_and_reads_no_files() {
        let drawings = fonts();
        assert!(drawings.draw("<html/>").is_none());
        let large = format!(
            "<svg xmlns=\"http://www.w3.org/2000/svg\"><desc>{}</desc></svg>",
            "x".repeat(MAX_SVG)
        );
        assert!(drawings.draw(&large).is_none());
        let file = r#"<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><image href="/etc/passwd" width="10" height="10"/></svg>"#;
        assert_eq!(
            drawings.draw(file).unwrap().json,
            r#"{"width":10,"height":10,"ops":[]}"#
        );
    }

    #[test]
    fn writes_numbers_short_and_strings_safe() {
        assert_eq!(number(1.23456), "1.235");
        assert_eq!(number(-0.0001), "0");
        assert_eq!(number(2.0), "2");
        assert_eq!(json_string("a\"b\\c\n"), r#""a\"b\\c\u000a""#);
    }

    #[test]
    fn keeps_a_fallback_font_within_a_label_as_text_and_names_what_none_has() {
        // ⇒ is DejaVu's (index 2), 日本語 no font's here
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="200" height="40"><text x="10" y="30" font-size="16">日本語 ⇒ x</text></svg>"#;
        let drawn = fonts().draw(svg).unwrap();
        assert!(!drawn.json.contains(r#""op":"path""#), "{}", drawn.json);
        assert!(
            drawn.json.contains(r#""font":2,"size":16"#),
            "{}",
            drawn.json
        );
        assert!(drawn.json.contains(r#""text":"⇒""#), "{}", drawn.json);
        assert_eq!(drawn.missing, "日本語");
        // once a font has them, they're its glyphs
        let mut drawings = fonts();
        let cjk = ["/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc"]
            .into_iter()
            .find_map(|path| std::fs::read(path).ok());
        if let Some(bytes) = cjk {
            drawings.add_font(bytes);
            let drawn = drawings.draw(svg).unwrap();
            assert_eq!(drawn.missing, "");
            assert!(drawn.json.contains("日本語"), "{}", drawn.json);
        }
    }

    #[test]
    fn keeps_dashes_caps_joins_and_the_fill_rule() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><g transform="scale(2)"><path d="M0 0L10 0" stroke="black" stroke-dasharray="3 3" stroke-linecap="round" stroke-linejoin="bevel"/><path d="M0 0L10 0L10 10Z" fill-rule="evenodd"/></g></svg>"#;
        let json = fonts().draw(svg).unwrap().json;
        assert!(
            json.contains(r#""stroke":2,"paint":{"alpha":1,"color":[0,0,0]},"dash":[6,6],"offset":0,"cap":"round","join":"bevel""#),
            "{json}"
        );
        assert!(json.contains(r#""evenodd":true"#), "{json}");
    }

    #[test]
    fn draws_outlined_text_as_paths_and_leaves_out_text_too_small_to_show() {
        let outlined = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><text x="0" y="30" fill="none" stroke="black" font-size="16">Outline</text></svg>"#;
        let json = fonts().draw(outlined).unwrap().json;
        assert!(
            json.contains(r#""op":"path""#) && !json.contains("glyphs"),
            "{json}"
        );
        let tiny = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="40"><g transform="scale(0.00002)"><text x="0" y="30" font-size="16">tiny</text></g></svg>"#;
        assert!(!fonts().draw(tiny).unwrap().json.contains("glyphs"));
    }

    #[test]
    fn names_what_no_font_has_in_rotated_labels_too() {
        let svg = r#"<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><text x="50" y="50" transform="rotate(-90 50 50)" font-size="12">日本</text></svg>"#;
        assert_eq!(fonts().draw(svg).unwrap().missing, "日本");
    }

    #[test]
    fn numbers_faces_as_the_engine_does_after_a_collection() {
        let Ok(cjk) = std::fs::read("/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc")
        else {
            return;
        };
        let collection = ttf_parser::fonts_in_collection(&cjk).unwrap() as usize;
        let mut drawings = fonts();
        drawings.add_font(cjk);
        drawings.add_font(
            std::fs::read(concat!(
                env!("CARGO_MANIFEST_DIR"),
                "/../../fonts/NotoEmoji-VariableFont_wght.ttf"
            ))
            .unwrap(),
        );
        // three files before, the collection's faces, then the emoji font
        let emoji = drawings
            .db
            .faces()
            .find(|face| {
                face.families
                    .iter()
                    .any(|family| family.0.contains("Emoji"))
            })
            .unwrap()
            .id;
        assert_eq!(drawings.indices[&emoji], 3 + collection);
    }
}

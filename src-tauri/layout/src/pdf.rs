//! The PDF, written with krilla from the same layout the screen paints:
//! every glyph where the engine placed it, in the embedded, subset fonts.

use std::collections::{BTreeMap, HashMap};

use krilla::action::{Action, LinkAction};
use krilla::annotation::{Annotation, LinkAnnotation, Target};
use krilla::color::rgb;
use krilla::configure::{Archival, ConfigurationBuilder, ValidationError, Validators};
use krilla::destination::XyzDestination;
use krilla::error::KrillaError;
use krilla::geom::{PathBuilder, Point, Rect, Size, Transform};
use krilla::image::Image;
use krilla::metadata::{DateTime, Metadata};
use krilla::num::NormalizedF32;
use krilla::page::PageSettings;
use krilla::paint::{Fill, FillRule, LineCap, LineJoin, Stroke, StrokeDash};
use krilla::surface::Surface;
use krilla::tagging::{Artifact, ArtifactType, ContentTag, SpanTag};
use krilla::text::{Font, GlyphId, KrillaGlyph, Tag};
use krilla::{Document, SerializeSettings};
use parley::Alignment;
use serde::Deserialize;

use crate::drawing::{Cap, Join, LineStyle, Paint, PathCmd};
use crate::engine::{Engine, Op, Part};
use crate::fonts::{Fonts, INSTANCE_BASE};
use crate::items::Role;
use crate::model::{Text, TextKind};
use crate::text::{Glyph, TextBox};

mod tags;

/// an image's file, by its src
pub struct ImageData {
    pub bytes: Vec<u8>,
    pub kind: ImageKind,
}

/// what an image's file is
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum ImageKind {
    Png,
    Jpeg,
}

impl ImageKind {
    /// the kind the webview sends: 1 for JPEG, PNG otherwise
    pub fn from_code(code: u8) -> ImageKind {
        match code {
            1 => ImageKind::Jpeg,
            _ => ImageKind::Png,
        }
    }
}

#[derive(Clone, Default)]
pub struct Info {
    pub title: String,
    pub author: String,
    /// when the PDF was made, in ISO 8601 (`2026-10-01T09:30:00+02:00`):
    /// PDF/A needs it, and the wasm has no clock of its own
    pub date: String,
}

/// the number the ASCII digits of `text` at `range` write, if they all are
/// digits
fn digits<T: std::str::FromStr>(text: &str, range: std::ops::Range<usize>) -> Option<T> {
    let part = text.get(range)?;
    if !part.bytes().all(|byte| byte.is_ascii_digit()) {
        return None;
    }
    part.parse().ok()
}

/// reads an ISO 8601 date and time (`YYYY-MM-DDTHH:MM:SS`, optionally with
/// fractions of a second, and `Z` or an offset `±HH:MM`)
fn parse_date(text: &str) -> Option<DateTime> {
    let number = |range| digits::<u16>(text, range);
    let bytes = text.as_bytes();
    let separators = [(4, b'-'), (7, b'-'), (10, b'T'), (13, b':'), (16, b':')];
    if separators.iter().any(|&(at, byte)| {
        !bytes
            .get(at)
            .is_some_and(|found| found.eq_ignore_ascii_case(&byte))
    }) {
        return None;
    }
    let (year, month, day) = (number(0..4)?, number(5..7)?, number(8..10)?);
    let (hour, minute, second) = (number(11..13)?, number(14..16)?, number(17..19)?);
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || second > 60
    {
        return None;
    }
    let mut rest = &text[19..];
    if let Some(fraction) = rest.strip_prefix('.') {
        let digits = fraction.bytes().take_while(u8::is_ascii_digit).count();
        if digits == 0 {
            return None;
        }
        rest = &fraction[digits..];
    }
    let date = DateTime::new(year)
        .month(month as u8)
        .day(day as u8)
        .hour(hour as u8)
        .minute(minute as u8)
        .second(second.min(59) as u8);
    if rest.eq_ignore_ascii_case("z") {
        return Some(date.utc_offset_hour(0).utc_offset_minute(0));
    }
    let sign: i8 = match rest.as_bytes().first()? {
        b'+' => 1,
        b'-' => -1,
        _ => return None,
    };
    let offset = &rest[1..];
    if offset.len() != 5 || offset.as_bytes()[2] != b':' {
        return None;
    }
    let (hours, minutes): (u8, u8) = (digits(offset, 0..2)?, digits(offset, 3..5)?);
    if hours > 23 || minutes > 59 {
        return None;
    }
    Some(
        date.utc_offset_hour(sign * hours as i8)
            .utc_offset_minute(minutes),
    )
}

/// the colour of each role on paper, as red, green and blue: the light
/// theme's text colour mixed onto white at the opacity the pages show it at
/// (ROLE_OPACITY in src/ui/painter/canvas2d.ts, checked by
/// src/ui/painter/colors.test.ts), except the text, the bands and what stands
/// for images, which have colours of their own
pub(crate) fn paper_rgb(role: Role) -> (u8, u8, u8) {
    match role {
        // the PDF shows links and alt text in the text's colour, as pdfmake
        // did
        Role::Text | Role::LinkLine | Role::Hint => (0, 0, 0),
        Role::Band => (0x66, 0x66, 0x66),
        Role::CodeFill => (0xef, 0xf0, 0xf1),
        Role::TableLine => (0xd1, 0xd4, 0xd6),
        Role::HeaderLine => (0x82, 0x89, 0x8e),
        Role::HeaderFill => (0xf1, 0xf2, 0xf3),
        Role::Placeholder => (0xdd, 0xdf, 0xe0),
    }
}

fn color(role: Role) -> rgb::Color {
    let (red, green, blue) = paper_rgb(role);
    rgb::Color::new(red, green, blue)
}

fn fill(role: Role) -> Fill {
    Fill {
        paint: color(role).into(),
        opacity: NormalizedF32::ONE,
        rule: Default::default(),
    }
}

/// draws a drawing's shape (`Op::Path`): its commands scaled by `scale` and
/// placed at `x`, `y`, filled or stroked in `role`'s colour at the paint's
/// strength, or in the author's colour
fn draw_path(
    surface: &mut Surface,
    (x, y, scale): (f32, f32, f32),
    d: &[PathCmd],
    stroke: Option<f32>,
    (role, paint): (Role, Paint),
    style: &LineStyle,
) {
    let mut builder = PathBuilder::new();
    let at = |px: f32, py: f32| (x + px * scale, y + py * scale);
    for command in d {
        match *command {
            PathCmd::Move(px, py) => {
                let (px, py) = at(px, py);
                builder.move_to(px, py)
            }
            PathCmd::Line(px, py) => {
                let (px, py) = at(px, py);
                builder.line_to(px, py)
            }
            PathCmd::Quad(x1, y1, px, py) => {
                let ((x1, y1), (px, py)) = (at(x1, y1), at(px, py));
                builder.quad_to(x1, y1, px, py)
            }
            PathCmd::Cubic(x1, y1, x2, y2, px, py) => {
                let ((x1, y1), (x2, y2), (px, py)) = (at(x1, y1), at(x2, y2), at(px, py));
                builder.cubic_to(x1, y1, x2, y2, px, py)
            }
            PathCmd::Close => builder.close(),
        }
    }
    let Some(path) = builder.finish() else {
        return;
    };
    let (paint_color, opacity) = painted(role, paint);
    match stroke {
        Some(width) => {
            surface.set_fill(None);
            surface.set_stroke(Some(Stroke {
                paint: paint_color.into(),
                width,
                opacity,
                line_cap: match style.cap {
                    Cap::Butt => LineCap::Butt,
                    Cap::Round => LineCap::Round,
                    Cap::Square => LineCap::Square,
                },
                line_join: match style.join {
                    Join::Miter => LineJoin::Miter,
                    Join::Round => LineJoin::Round,
                    Join::Bevel => LineJoin::Bevel,
                },
                dash: style.dash.as_ref().map(|dash| StrokeDash {
                    array: dash.iter().map(|length| length * scale).collect(),
                    offset: style.offset * scale,
                }),
                ..Default::default()
            }));
            surface.draw_path(&path);
            surface.set_stroke(None);
        }
        None => {
            surface.set_fill(Some(Fill {
                paint: paint_color.into(),
                opacity,
                rule: if style.evenodd {
                    FillRule::EvenOdd
                } else {
                    FillRule::NonZero
                },
            }));
            surface.draw_path(&path);
        }
    }
}

/// a drawing's paint in the PDF: the author's colour, or the role's (the
/// ink, black), at its strength
fn painted(role: Role, paint: Paint) -> (rgb::Color, NormalizedF32) {
    let paint_color = match paint.color {
        Some([red, green, blue]) => rgb::Color::new(red, green, blue),
        None => color(role),
    };
    let opacity = NormalizedF32::new(paint.alpha.clamp(0.0, 1.0)).unwrap_or(NormalizedF32::ONE);
    (paint_color, opacity)
}

/// the image `src` stands for, None for one left out or that can't be
/// decoded, which is noted in `undecoded`
fn load_image(
    src: &str,
    images: &HashMap<String, ImageData>,
    skipped: &Skipped,
    undecoded: &mut Vec<String>,
) -> Option<Image> {
    if skipped.images.iter().any(|skip| skip == src) {
        return None;
    }
    let data = images.get(src)?;
    // PDF/A forbids smoothing images, and a normal PDF looks the same
    let bytes = data.bytes.clone().into();
    let image = match data.kind {
        ImageKind::Jpeg => Image::from_jpeg(bytes, false),
        ImageKind::Png => Image::from_png(bytes, false),
    };
    if image.is_err() {
        undecoded.push(src.to_string());
    }
    image.ok()
}

/// what a part of a page that isn't text of the document is, as an
/// artifact: its decorations, headers and footers, and the header rows a
/// table repeats; None for the text, which is tagged
fn artifact_of(part: Part) -> Option<ArtifactType> {
    match part {
        Part::Decoration => Some(ArtifactType::Other),
        Part::Band { footer: false } => Some(ArtifactType::Header),
        Part::Band { footer: true } => Some(ArtifactType::Footer),
        Part::Repeat => Some(ArtifactType::PaginationOther),
        _ => None,
    }
}

/// a rectangle on the page, at least a hundredth of a point wide and tall,
/// so a hairline still shows; None where it can't be one
fn page_rect(x: f32, y: f32, w: f32, h: f32) -> Option<Rect> {
    Rect::from_xywh(x, y, w.max(0.01), h.max(0.01))
}

/// The missing glyph (0) stands for every character a font doesn't have,
/// and readers take no text from it, so the text of those characters would
/// be lost for copying and searching. krilla writes a glyph whose text
/// differs from the text it gave the glyph before in an actual text span,
/// which readers take the text from. So this gives the missing glyph an
/// empty text first, with an invisible one: every character shown with it
/// then gets its own span.
fn unmap_missing_glyph(surface: &mut Surface, font: Font) {
    surface.start_tagged(ContentTag::Artifact(Artifact::new(
        ArtifactType::Other,
        None,
    )));
    surface.set_fill(Some(Fill {
        paint: rgb::Color::new(0, 0, 0).into(),
        opacity: NormalizedF32::ZERO,
        rule: Default::default(),
    }));
    let glyph = KrillaGlyph::new(GlyphId::new(0), 0.0, 0.0, 0.0, 0.0, 0..0, None);
    surface.draw_glyphs(Point::from_xy(0.0, 0.0), &[glyph], font, "", 1.0, false);
    surface.end_tagged();
}

/// the fonts of a PDF by their font index: the faces, and the instances of
/// variable ones at their coordinates, see `Fonts::face`; none for a font
/// left out
struct PdfFonts {
    faces: Vec<Option<Font>>,
    instances: Vec<Option<Font>>,
}

impl PdfFonts {
    fn new(fonts: &Fonts, skipped: &[usize]) -> PdfFonts {
        let faces = fonts
            .files
            .iter()
            .enumerate()
            .map(|(index, file)| {
                if skipped.contains(&index) {
                    return None;
                }
                Font::new(file.data.clone().into(), file.index)
            })
            .collect();
        let instances = fonts
            .instances
            .iter()
            .enumerate()
            .map(|(index, instance)| {
                if skipped.contains(&(INSTANCE_BASE + index)) {
                    return None;
                }
                let file = fonts.files.get(instance.file)?;
                let variations: Vec<(Tag, f32)> = instance
                    .variations
                    .iter()
                    .map(|(tag, value)| (Tag::new(tag), *value))
                    .collect();
                Font::new_variable(file.data.clone().into(), file.index, &variations)
            })
            .collect();
        PdfFonts { faces, instances }
    }

    fn get(&self, font: usize) -> Option<&Font> {
        match font.checked_sub(INSTANCE_BASE) {
            Some(index) => self.instances.get(index)?.as_ref(),
            None => self.faces.get(font)?.as_ref(),
        }
    }

    /// the font index of a font krilla names
    fn index_of(&self, font: &Font) -> Option<usize> {
        let face = self
            .faces
            .iter()
            .position(|known| known.as_ref() == Some(font));
        let instance = || {
            self.instances
                .iter()
                .position(|known| known.as_ref() == Some(font))
                .map(|index| INSTANCE_BASE + index)
        };
        face.or_else(instance)
    }
}

/// what went wrong in a PDF that was still written
#[derive(Clone, Debug, PartialEq)]
pub enum Warning {
    /// an image, by its src, that couldn't be decoded: its alt text is in
    /// its place
    Image(String),
    /// a font, by its font index (a face in `Fonts::files`, or an instance
    /// of a variable one from `INSTANCE_BASE` on), that couldn't be
    /// embedded: the text set in it is left out
    Font(usize),
    /// why the PDF isn't PDF/A-2u, in plain words: it was written as a
    /// normal PDF instead
    Pdfa(String),
}

/// a PDF, and what went wrong in it
pub struct Written {
    pub bytes: Vec<u8>,
    pub warnings: Vec<Warning>,
}

/// writes the document's pages as a PDF
pub fn write(
    engine: &mut Engine,
    images: &HashMap<String, ImageData>,
    info: &Info,
) -> Result<Vec<u8>, String> {
    Ok(write_with(engine, images, info, "")?.bytes)
}

/// the images and fonts to leave out, which krilla failed on
#[derive(Default)]
struct Skipped {
    images: Vec<String>,
    fonts: Vec<usize>,
}

/// why writing the PDF failed
enum Failed {
    Image(String),
    Font(usize),
    /// why it can't be PDF/A, in plain words
    Archival(String),
    Other(String),
}

/// what PDF/A-2u forbids in a document, in plain words, each reason once
fn archival_reason(
    errors: &[(ValidationError, Validators)],
    fonts: &PdfFonts,
    engine: &Engine,
) -> String {
    let family = |font: &Font| {
        fonts
            .index_of(font)
            .and_then(|index| engine.fonts.face(index))
            .map(|(file, _)| file.family.clone())
            .unwrap_or_default()
    };
    // the characters no font has, in the order they came
    let mut missing: Vec<char> = vec![];
    let mut reasons: Vec<String> = vec![];
    for (error, _) in errors {
        let reason = match error {
            ValidationError::ContainsNotDefGlyph(_, _, text) => {
                for character in text.chars() {
                    if !missing.contains(&character) {
                        missing.push(character);
                    }
                }
                continue;
            }
            ValidationError::RestrictedLicense(font) => {
                format!(
                    "the license of the font {} doesn't allow embedding it",
                    family(font)
                )
            }
            ValidationError::NoCodepointMapping(font, ..) => {
                format!(
                    "the font {} shows a glyph that stands for no text",
                    family(font)
                )
            }
            ValidationError::InvalidCodepointMapping(_, _, character, _)
            | ValidationError::UnicodePrivateArea(_, _, character, _) => {
                format!(
                    "it holds the character U+{:04X}, which PDF/A forbids",
                    *character as u32
                )
            }
            ValidationError::MissingDocumentDate => "it has no date".into(),
            ValidationError::TooLongString => {
                "a text in it, such as the title or the author, is too long".into()
            }
            ValidationError::TooLongName => "the name of a font in it is too long".into(),
            ValidationError::TooManyIndirectObjects => "it is too large".into(),
            ValidationError::TooHighQNestingLevel => "its drawing nests too deep".into(),
            ValidationError::ImageInterpolation(_) => "an image in it is smoothed".into(),
            other => format!("{other:?}"),
        };
        if !reasons.contains(&reason) {
            reasons.push(reason);
        }
    }
    let shown: String = missing
        .iter()
        .filter(|character| !character.is_control())
        .collect();
    if !missing.is_empty() {
        let characters = if shown.is_empty() {
            "a character".to_string()
        } else if shown.chars().count() == 1 {
            format!("the character {shown}")
        } else {
            format!("the characters {shown}")
        };
        reasons.insert(0, format!("no font has {characters}"));
    }
    if reasons.is_empty() {
        "it doesn't meet the rules".into()
    } else {
        reasons.join("; ")
    }
}

/// what a PDF holds: some of the document's pages, as they are, tagged and
/// with bookmarks; or sheets to print, with pages placed on them
enum Output<'a> {
    Pages(&'a [usize]),
    Print(&'a [PrintSheet]),
}

/// a sheet of paper to print, in points, with the pages placed on it
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PrintSheet {
    pub width: f32,
    pub height: f32,
    pub placements: Vec<Placement>,
}

/// a page on a sheet: where its top left corner is, in points, and how much
/// it is scaled
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Placement {
    pub page: usize,
    pub x: f32,
    pub y: f32,
    pub scale: f32,
}

/// writes the document's pages as a PDF/A-2u in `language` (a BCP 47 tag,
/// or empty for none), with what went wrong: an image that can't be decoded
/// shows its alt text, and a font that can't be embedded is left out, so
/// neither fails the whole PDF. A document that can't be PDF/A-2u (no font
/// has one of its characters, a font's license forbids it, or it has no
/// date) is written as a normal PDF, with the reason.
pub fn write_with(
    engine: &mut Engine,
    images: &HashMap<String, ImageData>,
    info: &Info,
    language: &str,
) -> Result<Written, String> {
    let pages: Vec<usize> = (0..engine.pages.len()).collect();
    write_output(engine, images, info, language, Output::Pages(&pages))
}

/// the first of `pages` that isn't one of the document's, as an error
fn check_pages(engine: &Engine, mut pages: impl Iterator<Item = usize>) -> Result<(), String> {
    match pages.find(|&page| page >= engine.pages.len()) {
        Some(page) => Err(format!("there is no page {}", page + 1)),
        None => Ok(()),
    }
}

/// writes some of the document's pages, by their index in ascending order,
/// as `write_with` writes them all: the bookmarks and the links of tables
/// of contents lead only to the pages written
pub fn write_pages(
    engine: &mut Engine,
    images: &HashMap<String, ImageData>,
    info: &Info,
    language: &str,
    pages: &[usize],
) -> Result<Written, String> {
    if pages.is_empty() {
        return Err("there are no pages to write".into());
    }
    check_pages(engine, pages.iter().copied())?;
    if pages.windows(2).any(|pair| pair[0] >= pair[1]) {
        return Err("the pages aren't in order".into());
    }
    write_output(engine, images, info, language, Output::Pages(pages))
}

/// writes sheets to print, with the pages placed on them as the sheets say:
/// what the pages print (see Engine::printed_parts), without the structure,
/// bookmarks, links and PDF/A a printer has no use for
pub fn write_print(
    engine: &mut Engine,
    images: &HashMap<String, ImageData>,
    info: &Info,
    sheets: &[PrintSheet],
) -> Result<Written, String> {
    if sheets.is_empty() {
        return Err("there are no sheets to print".into());
    }
    let placements = || sheets.iter().flat_map(|sheet| &sheet.placements);
    check_pages(engine, placements().map(|placement| placement.page))?;
    let sizes = sheets.iter().flat_map(|sheet| [sheet.width, sheet.height]);
    let places = placements().flat_map(|placement| [placement.x, placement.y]);
    if sizes.chain(places).any(|value| !value.is_finite())
        || placements().any(|placement| !(placement.scale.is_finite() && placement.scale > 0.0))
    {
        return Err("a sheet's size or a page's place on it can't be used".into());
    }
    write_output(engine, images, info, "", Output::Print(sheets))
}

/// writes `output`, again without what krilla fails on: krilla tells what
/// it fails on only once it writes the document, so it writes it again
/// without that, once for each image and font at most, and once more as a
/// normal PDF
fn write_output(
    engine: &mut Engine,
    images: &HashMap<String, ImageData>,
    info: &Info,
    language: &str,
    output: Output,
) -> Result<Written, String> {
    let mut skipped = Skipped::default();
    let date = parse_date(&info.date);
    // only the document's pages are written as a PDF/A, never the sheets to
    // print; why they aren't one, once that is known
    let archives = matches!(output, Output::Pages(_));
    let mut not_archival = if archives {
        match date {
            Some(_) => None,
            None if info.date.is_empty() => Some("it has no date".to_string()),
            None => Some(format!("its date {} can't be read", info.date)),
        }
    } else {
        None
    };
    for _ in 0..attempts(images.len(), &engine.fonts) + 1 {
        let archival = archives && not_archival.is_none();
        let written = attempt(
            engine, images, info, date, language, archival, &skipped, &output,
        );
        match written {
            Ok((bytes, undecoded)) => {
                let mut warnings: Vec<Warning> = vec![];
                for src in undecoded.into_iter().chain(skipped.images.iter().cloned()) {
                    if !warnings.contains(&Warning::Image(src.clone())) {
                        warnings.push(Warning::Image(src));
                    }
                }
                warnings.extend(skipped.fonts.iter().map(|&font| Warning::Font(font)));
                warnings.extend(not_archival.map(Warning::Pdfa));
                return Ok(Written { bytes, warnings });
            }
            Err(Failed::Image(src)) if !skipped.images.contains(&src) => skipped.images.push(src),
            Err(Failed::Font(font)) if !skipped.fonts.contains(&font) => skipped.fonts.push(font),
            Err(Failed::Archival(reason)) if archival => not_archival = Some(reason),
            Err(Failed::Image(src)) => return Err(format!("the image {src} can't be written")),
            Err(Failed::Font(font)) => return Err(format!("the font {font} can't be written")),
            Err(Failed::Archival(reason)) => return Err(reason),
            Err(Failed::Other(message)) => return Err(message),
        }
    }
    Err("the PDF can't be written".into())
}

/// glyphs as krilla takes them, in em. Parley's offsets point down, as the
/// page does, and krilla's up, as a font's do (it draws at `y - y_offset`),
/// so a mark placed above its letter stays above it.
fn krilla_glyphs(glyphs: &[Glyph], size: f32) -> Vec<KrillaGlyph> {
    glyphs
        .iter()
        .map(|glyph| {
            KrillaGlyph::new(
                GlyphId::new(glyph.id),
                glyph.advance / size,
                glyph.dx / size,
                -glyph.dy / size,
                0.0,
                glyph.start as usize..glyph.end as usize,
                None,
            )
        })
        .collect()
}

/// how often a PDF is written at most: once, and again for each image and
/// each font krilla may fail on, the faces and the instances of variable
/// ones, which are fonts of their own in the PDF
fn attempts(images: usize, fonts: &Fonts) -> usize {
    1 + images + fonts.files.len() + fonts.instances.len()
}

/// draws glyphs laid out on the page, from where the first one stands
fn draw_run(surface: &mut Surface, glyphs: &[Glyph], font: &Font, text: &str, size: f32) {
    let Some(first) = glyphs.first() else {
        return;
    };
    let glyphs = krilla_glyphs(glyphs, size);
    surface.draw_glyphs(
        Point::from_xy(first.x - first.dx, first.y - first.dy),
        &glyphs,
        font.clone(),
        text,
        size,
        false,
    );
}

/// paints what stands for an image that can't be shown in its box: its alt
/// text, as the screen shows an image that isn't loaded, as many lines of
/// it as the box holds, and at least the first
#[allow(clippy::too_many_arguments)]
fn paint_alt(
    surface: &mut Surface,
    engine_fonts: &mut Fonts,
    fonts: &PdfFonts,
    alt: &str,
    x: f32,
    y: f32,
    w: f32,
    h: f32,
) {
    let text = Text {
        pos: 0,
        text: alt.to_string(),
        style: TextKind::Alt,
        ..Default::default()
    };
    let boxed = TextBox::new(engine_fonts, &text, w.max(20.0), Alignment::Start);
    surface.set_fill(Some(fill(Role::Hint)));
    for (line, info) in boxed.lines().iter().enumerate() {
        if line > 0 && info.bottom > h {
            break;
        }
        for mut run in boxed.glyph_runs(engine_fonts, line) {
            let Some(font) = fonts.get(run.font) else {
                continue;
            };
            for glyph in &mut run.glyphs {
                glyph.x += x;
                glyph.y += y;
            }
            draw_run(surface, &run.glyphs, font, &boxed.text, run.size);
        }
    }
}

/// the settings of a PDF/A-2u: krilla then checks the rules, and writes
/// the XMP metadata and the sRGB output intent they ask for
fn archival_settings() -> Option<SerializeSettings> {
    let configuration = ConfigurationBuilder::new()
        .with_archival_validator(Archival::A2_U)
        .finish()
        .ok()?;
    Some(SerializeSettings {
        configuration,
        ..SerializeSettings::default()
    })
}

/// the fonts whose missing glyph `ops` show, for what no font has
fn missing_fonts<'a>(ops: impl IntoIterator<Item = &'a (Op, Part)>) -> Vec<usize> {
    let mut missing: Vec<usize> = vec![];
    for (op, _) in ops {
        if let Op::Glyphs { run, .. } = op {
            if run.glyphs.iter().any(|glyph| glyph.id == 0) && !missing.contains(&run.font) {
                missing.push(run.font);
            }
        }
    }
    missing
}

/// draws what the pages show into a PDF: the fonts and images it has, and
/// the images it couldn't decode
struct Drawing<'a> {
    fonts: PdfFonts,
    images: &'a HashMap<String, ImageData>,
    skipped: &'a Skipped,
    loaded: HashMap<String, Option<Image>>,
    undecoded: Vec<String>,
}

impl<'a> Drawing<'a> {
    fn new(fonts: &Fonts, images: &'a HashMap<String, ImageData>, skipped: &'a Skipped) -> Self {
        Drawing {
            fonts: PdfFonts::new(fonts, &skipped.fonts),
            images,
            skipped,
            loaded: HashMap::new(),
            undecoded: vec![],
        }
    }

    /// whether `op` can be drawn: a rectangle with a size, and glyphs in a
    /// font the PDF has
    fn drawable(&self, op: &Op) -> bool {
        match op {
            Op::Rect { x, y, w, h, .. } => page_rect(*x, *y, *w, *h).is_some(),
            Op::Glyphs { run, .. } => self.fonts.get(run.font).is_some(),
            Op::Image { .. } | Op::Path { .. } => true,
            Op::Link { .. } => false,
        }
    }

    /// unmaps the missing glyph of the fonts `missing` (see
    /// `unmap_missing_glyph`), once, on the PDF's first page
    fn unmap_missing(&self, surface: &mut Surface, missing: &[usize]) {
        for font in missing.iter().filter_map(|&font| self.fonts.get(font)) {
            unmap_missing_glyph(surface, font.clone());
        }
    }

    /// draws a rectangle, glyphs, a drawing's path or an image (or its alt
    /// text) on `surface`:
    /// the one place that draws what the pages show, for the document's PDF
    /// and the print PDF alike
    fn draw(&mut self, surface: &mut Surface, engine_fonts: &mut Fonts, op: &Op) {
        match op {
            &Op::Rect { x, y, w, h, role } => {
                let mut builder = PathBuilder::new();
                if let Some(rect) = page_rect(x, y, w, h) {
                    builder.push_rect(rect);
                }
                if let Some(path) = builder.finish() {
                    surface.set_fill(Some(fill(role)));
                    surface.draw_path(&path);
                }
            }
            Op::Glyphs {
                run,
                role,
                text,
                paint,
            } => {
                // a font that can't be embedded is left out
                if let Some(font) = self.fonts.get(run.font) {
                    // a drawing's glyphs in their paint: the ink at a
                    // strength, or the author's colour
                    surface.set_fill(Some(match paint {
                        Some(paint) => {
                            let (paint_color, opacity) = painted(*role, *paint);
                            Fill {
                                paint: paint_color.into(),
                                opacity,
                                rule: Default::default(),
                            }
                        }
                        None => fill(*role),
                    }));
                    draw_run(surface, &run.glyphs, font, text, run.size);
                }
            }
            Op::Path {
                x,
                y,
                scale,
                d,
                stroke,
                role,
                paint,
                style,
            } => draw_path(
                surface,
                (*x, *y, *scale),
                d,
                *stroke,
                (*role, *paint),
                style,
            ),
            &Op::Image {
                ref src,
                ref alt,
                x,
                y,
                w,
                h,
            } => {
                let image = self.loaded.entry(src.clone()).or_insert_with(|| {
                    load_image(src, self.images, self.skipped, &mut self.undecoded)
                });
                match (image.clone(), Size::from_wh(w, h)) {
                    (Some(image), Some(size)) => {
                        surface.push_transform(&Transform::from_translate(x, y));
                        surface.draw_image(image, size);
                        surface.pop();
                    }
                    _ => {
                        let alt = if alt.is_empty() { src } else { alt };
                        paint_alt(surface, engine_fonts, &self.fonts, alt, x, y, w, h);
                    }
                }
            }
            Op::Link { .. } => {}
        }
    }
}

/// writes the PDF once, as a PDF/A-2u when `archival`, leaving out what is
/// skipped: its bytes and the images it couldn't decode, or what it failed
/// on
#[allow(clippy::too_many_arguments)]
fn attempt(
    engine: &mut Engine,
    images: &HashMap<String, ImageData>,
    info: &Info,
    date: Option<DateTime>,
    language: &str,
    archival: bool,
    skipped: &Skipped,
    output: &Output,
) -> Result<(Vec<u8>, Vec<String>), Failed> {
    let mut document = match output {
        Output::Pages(_) if archival => {
            let settings = archival_settings()
                .ok_or_else(|| Failed::Archival("krilla can't write PDF/A-2u".into()))?;
            Document::new_with(settings)
        }
        Output::Pages(_) => Document::new(),
        // a printer needs no structure: without tagging, krilla leaves the
        // tags out
        Output::Print(_) => Document::new_with(SerializeSettings {
            enable_tagging: false,
            ..SerializeSettings::default()
        }),
    };
    let mut drawing = Drawing::new(&engine.fonts, images, skipped);
    match output {
        Output::Pages(pages) => draw_pages(&mut document, engine, &mut drawing, language, pages)?,
        Output::Print(sheets) => draw_sheets(&mut document, engine, &mut drawing, sheets)?,
    }
    let mut metadata = Metadata::new().creator("Blank".into());
    if !info.title.is_empty() {
        metadata = metadata.title(info.title.clone());
    }
    if !info.author.is_empty() {
        metadata = metadata.authors(vec![info.author.clone()]);
    }
    if !language.is_empty() {
        metadata = metadata.language(language.to_string());
    }
    if let Some(date) = date {
        metadata = metadata.creation_date(date);
    }
    document.set_metadata(metadata);
    let Drawing {
        fonts,
        loaded,
        undecoded,
        ..
    } = drawing;
    match document.finish() {
        Ok(bytes) => Ok((bytes, undecoded)),
        Err(KrillaError::Image(image, ..)) => {
            let src = loaded
                .iter()
                .find(|(_, loaded)| loaded.as_ref() == Some(&image))
                .map(|(src, _)| src.clone());
            match src {
                Some(src) => Err(Failed::Image(src)),
                None => Err(Failed::Other("an image can't be written".into())),
            }
        }
        Err(KrillaError::Font(font, message)) => match fonts.index_of(&font) {
            Some(index) => Err(Failed::Font(index)),
            None => Err(Failed::Other(format!(
                "a font can't be embedded: {message}"
            ))),
        },
        Err(KrillaError::Validation(errors)) => {
            Err(Failed::Archival(archival_reason(&errors, &fonts, engine)))
        }
        Err(error) => Err(Failed::Other(format!("{error:?}"))),
    }
}

/// draws the document's `pages` as the PDF's pages, tagged, with the links
/// and the bookmarks that lead to them
fn draw_pages(
    document: &mut Document,
    engine: &mut Engine,
    drawing: &mut Drawing,
    language: &str,
    pages: &[usize],
) -> Result<(), Failed> {
    let mut ids = tags::Ids::new();
    // the order everything is drawn in, for the structure
    let mut order = 0usize;
    let (width, height) = (engine.settings.width, engine.settings.height);
    // where each of the document's pages is in the PDF, if it is
    let mut new_index: Vec<Option<usize>> = vec![None; engine.pages.len()];
    for (index, &page) in pages.iter().enumerate() {
        new_index[page] = Some(index);
    }
    // what each page draws, with what of the document it is
    let drawn: Vec<Vec<(Op, Part)>> = pages
        .iter()
        .map(|&page| engine.printed_parts(page))
        .collect();
    let missing = missing_fonts(drawn.iter().flatten());
    // where the entries of tables of contents link to
    let listed = engine.listed_headings();
    for (page_index, ops) in drawn.into_iter().enumerate() {
        let settings = PageSettings::from_wh(width, height)
            .ok_or_else(|| Failed::Other("the page has no size".into()))?;
        let mut page = document.start_page_with(settings);
        let mut links = vec![];
        {
            let mut surface = page.surface();
            if page_index == 0 {
                drawing.unmap_missing(&mut surface, &missing);
            }
            for (op, part) in ops {
                if let Op::Link { href, x, y, w, h } = op {
                    links.push((href, x, y, w, h, part));
                    continue;
                }
                // what can't be drawn is left out before its tag opens: a
                // tagged section must be closed on every path
                if !drawing.drawable(&op) {
                    continue;
                }
                // what isn't content of the document is an artifact, and the
                // rest is tagged, for the structure to hold it
                let artifact = artifact_of(part);
                let tag = match artifact {
                    Some(kind) => ContentTag::Artifact(Artifact::new(kind, None)),
                    None => ContentTag::Span(SpanTag::empty()),
                };
                let id = surface.start_tagged(tag);
                if artifact.is_none() {
                    order += 1;
                    ids.entry(part).or_default().push((order, id));
                }
                drawing.draw(&mut surface, &mut engine.fonts, &op);
                surface.end_tagged();
            }
            surface.finish();
        }
        for (href, x, y, w, h, part) in links {
            if let Some(rect) = page_rect(x, y, w, h) {
                let target = match part {
                    // to the heading of a table of contents' entry, on its
                    // page; none for a heading that isn't there, or whose
                    // page isn't written
                    Part::TocLink { item, entry } => {
                        let target = engine.toc_target(item, entry, &listed);
                        match target.and_then(|(page, top)| Some((new_index[page]?, top))) {
                            Some((page, top)) => Target::Destination(
                                XyzDestination::new(
                                    page,
                                    Point::from_xy(engine.settings.margins.left, top),
                                )
                                .into(),
                            ),
                            None => continue,
                        }
                    }
                    _ => Target::Action(Action::Link(LinkAction::new(href.clone()))),
                };
                // what the link says: where it goes, or a table of
                // contents' entry
                let alt = match (part, &target) {
                    (Part::TocLink { item, entry }, Target::Destination(_)) => {
                        match &engine.items[item].content {
                            crate::model::Content::Toc { entries, .. } => {
                                entries.get(entry).map_or(href, |entry| entry.text.clone())
                            }
                            _ => href,
                        }
                    }
                    _ => href,
                };
                let annotation = Annotation::new_link(LinkAnnotation::new(rect, target), Some(alt));
                // a repeated row's links are artifacts' too: only the
                // first ones are in the structure
                if part == Part::Repeat {
                    page.add_annotation(annotation);
                } else {
                    let id = page.add_tagged_annotation(annotation);
                    order += 1;
                    ids.entry(part).or_default().push((order, id));
                }
            }
        }
        page.finish();
    }
    document.set_tag_tree(tags::tag_tree(engine, &mut ids, language));
    document.set_outline(tags::outline(engine, &new_index));
    Ok(())
}

/// draws `sheets`, each with its pages placed and scaled on it, and clipped
/// to the page, so a page never reaches into its neighbor
fn draw_sheets(
    document: &mut Document,
    engine: &mut Engine,
    drawing: &mut Drawing,
    sheets: &[PrintSheet],
) -> Result<(), Failed> {
    let (width, height) = (engine.settings.width, engine.settings.height);
    let page_clip = {
        let mut builder = PathBuilder::new();
        if let Some(rect) = Rect::from_xywh(0.0, 0.0, width, height) {
            builder.push_rect(rect);
        }
        builder
            .finish()
            .ok_or_else(|| Failed::Other("the page has no size".into()))?
    };
    // what each page placed on a sheet prints, read once however often it
    // is placed, in page order, so the same sheets give the same PDF
    let mut printed: BTreeMap<usize, Vec<(Op, Part)>> = BTreeMap::new();
    for placement in sheets.iter().flat_map(|sheet| &sheet.placements) {
        printed
            .entry(placement.page)
            .or_insert_with(|| engine.printed_parts(placement.page));
    }
    let missing = missing_fonts(printed.values().flatten());
    for (sheet_index, sheet) in sheets.iter().enumerate() {
        let settings = PageSettings::from_wh(sheet.width, sheet.height)
            .ok_or_else(|| Failed::Other("the sheet has no size".into()))?;
        let mut page = document.start_page_with(settings);
        let mut surface = page.surface();
        if sheet_index == 0 {
            drawing.unmap_missing(&mut surface, &missing);
        }
        for placement in &sheet.placements {
            let scale = placement.scale;
            surface.push_transform(&Transform::from_row(
                scale,
                0.0,
                0.0,
                scale,
                placement.x,
                placement.y,
            ));
            surface.push_clip_path(&page_clip, &FillRule::NonZero);
            for (op, _) in &printed[&placement.page] {
                if drawing.drawable(op) {
                    drawing.draw(&mut surface, &mut engine.fonts, op);
                }
            }
            surface.pop();
            surface.pop();
        }
        surface.finish();
        page.finish();
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::test_support::{document, engine, heading, paragraph};
    use crate::engine::Word;
    use crate::model::{Content, Item};

    /// a red pixel
    const PNG: [u8; 69] = [
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2,
        0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 12, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 0, 0,
        3, 1, 1, 0, 201, 254, 146, 239, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ];
    /// a PNG whose header is right and whose pixels aren't
    const CORRUPT_PNG: [u8; 63] = [
        137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2,
        0, 0, 0, 144, 119, 83, 222, 0, 0, 0, 6, 73, 68, 65, 84, 120, 156, 255, 255, 255, 255, 29,
        202, 124, 158, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130,
    ];

    fn image(pos: u32, src: &str) -> Item {
        Item {
            content: Content::Image {
                pos,
                src: src.into(),
                width: 120.0,
                height: 60.0,
                alt: format!("the picture {src}"),
                align: None,
                share: None,
                caption: None,
            },
            ..paragraph(0, "")
        }
    }

    fn info() -> Info {
        Info {
            title: String::new(),
            author: String::new(),
            date: "2026-10-01T09:30:00+02:00".into(),
        }
    }

    /// runs a tool of poppler-utils with `args`, if it is there; on CI it
    /// must be, so the checks can't pass by skipping (`missing_tool` in
    /// tests/exact.rs, which can't share this, does the same)
    fn poppler(tool: &str, args: &[&std::ffi::OsStr]) -> Option<std::process::Output> {
        run_tool(tool, "poppler-utils", args)
    }

    /// runs `tool` of `package` with `args`, if it is there, as `poppler`
    fn run_tool(
        tool: &str,
        package: &str,
        args: &[&std::ffi::OsStr],
    ) -> Option<std::process::Output> {
        match std::process::Command::new(tool).args(args).output() {
            Ok(out) => {
                assert!(
                    out.status.success(),
                    "{tool} failed: {}",
                    String::from_utf8_lossy(&out.stderr)
                );
                Some(out)
            }
            Err(_) if std::env::var_os("CI").is_some() => {
                panic!("{tool} is missing: install {package}, CI doesn't skip the check")
            }
            Err(_) => None,
        }
    }

    /// the PDF's structure as pdfinfo shows it, if pdfinfo is there
    fn structure_of(pdf: &[u8], name: &str) -> Option<String> {
        let path = std::env::temp_dir().join(format!("blank-layout-unit-{name}.pdf"));
        std::fs::write(&path, pdf).unwrap();
        let out = poppler("pdfinfo", &["-struct-text".as_ref(), path.as_os_str()])?;
        Some(String::from_utf8_lossy(&out.stdout).into_owned())
    }

    /// the plain text of a PDF, if pdftotext is there
    fn text_of(pdf: &[u8], name: &str) -> Option<String> {
        let path = std::env::temp_dir().join(format!("blank-layout-unit-{name}.pdf"));
        std::fs::write(&path, pdf).unwrap();
        let out = poppler(
            "pdftotext",
            &[
                "-enc".as_ref(),
                "UTF-8".as_ref(),
                path.as_os_str(),
                "-".as_ref(),
            ],
        )?;
        Some(String::from_utf8_lossy(&out.stdout).into_owned())
    }

    #[test]
    fn writes_the_alt_text_of_images_it_cant_decode() {
        let mut engine = engine(vec![
            paragraph(1, "before"),
            image(9, "good.png"),
            image(10, "corrupt.png"),
            image(11, "garbage.png"),
            image(12, "absent.png"),
        ]);
        let mut images = HashMap::new();
        for (src, bytes) in [
            ("good.png", PNG.to_vec()),
            ("corrupt.png", CORRUPT_PNG.to_vec()),
            ("garbage.png", b"not a picture".to_vec()),
        ] {
            images.insert(
                src.to_string(),
                ImageData {
                    bytes,
                    kind: ImageKind::Png,
                },
            );
        }
        let written = write_with(&mut engine, &images, &info(), "").unwrap();
        // the ones handed over that can't be decoded, each once; the absent
        // one is what the caller already knows it couldn't load
        assert_eq!(
            written.warnings,
            [
                Warning::Image("garbage.png".into()),
                Warning::Image("corrupt.png".into())
            ]
        );
        if let Some(text) = text_of(&written.bytes, "images") {
            for src in ["corrupt.png", "garbage.png", "absent.png"] {
                assert!(
                    text.contains(&format!("the picture {src}")),
                    "{src}: {text:?}"
                );
            }
            assert!(!text.contains("the picture good.png"), "{text:?}");
        }
    }

    /// a font file without some of its tables
    fn without_tables(bytes: &[u8], drop: &[&[u8; 4]]) -> Vec<u8> {
        let count = u16::from_be_bytes([bytes[4], bytes[5]]) as usize;
        let records: Vec<&[u8]> = (0..count)
            .map(|index| &bytes[12 + index * 16..28 + index * 16])
            .filter(|record| !drop.iter().any(|tag| &record[..4] == *tag))
            .collect();
        let mut out = bytes[..12].to_vec();
        out[4..6].copy_from_slice(&(records.len() as u16).to_be_bytes());
        let mut data: Vec<u8> = vec![];
        let start = 12 + records.len() * 16;
        for record in &records {
            let offset = u32::from_be_bytes(record[8..12].try_into().unwrap()) as usize;
            let length = u32::from_be_bytes(record[12..16].try_into().unwrap()) as usize;
            out.extend_from_slice(&record[..8]);
            out.extend_from_slice(&((start + data.len()) as u32).to_be_bytes());
            out.extend_from_slice(&record[12..16]);
            data.extend_from_slice(&bytes[offset..offset + length]);
            while !data.len().is_multiple_of(4) {
                data.push(0);
            }
        }
        out.extend(data);
        out
    }

    /// a box with "Idea" in it, as a module draws one: in the engine's
    /// first font, its glyphs by their characters
    const DRAWING: &str = r#"{"width":160,"height":60,"ops":[
        {"op":"path","d":"M2 2L158 2L158 58L2 58Z","paint":{"alpha":0.1}},
        {"op":"path","d":"M2 2L158 2L158 58L2 58Z","stroke":1,"paint":{"color":[200,30,30]}},
        {"op":"glyphs","font":0,"chars":true,"size":16,
         "glyphs":[[73,60,36],[100,65,36],[101,75,36],[97,84,36]],"text":"Idea"}
    ]}"#;

    #[test]
    fn draws_a_drawing_with_its_text_as_text_and_no_picture() {
        let mut item = image(9, "blank-vector:diagram:1");
        if let Content::Image {
            width,
            height,
            caption,
            ..
        } = &mut item.content
        {
            (*width, *height) = (160.0, 60.0);
            *caption = Some("The plan".into());
        }
        let mut engine = engine(vec![paragraph(1, "before"), item]);
        engine.drawings.insert(
            "blank-vector:diagram:1".into(),
            crate::drawing::Drawing::read(DRAWING).unwrap(),
        );
        let ops = engine.body_parts(0);
        assert_eq!(
            ops.iter()
                .filter(|(op, _)| matches!(op, Op::Path { .. }))
                .count(),
            2
        );
        assert!(!ops.iter().any(|(op, _)| matches!(op, Op::Image { .. })));
        let written = write_with(&mut engine, &HashMap::new(), &info(), "").unwrap();
        assert!(written.warnings.is_empty(), "{:?}", written.warnings);
        if let Some(text) = text_of(&written.bytes, "drawing") {
            assert!(text.contains("Idea"), "{text:?}");
            assert!(text.contains("The plan"), "{text:?}");
        }
        let path = std::env::temp_dir().join("blank-layout-unit-drawing-images.pdf");
        std::fs::write(&path, &written.bytes).unwrap();
        if let Some(out) = poppler("pdfimages", &["-list".as_ref(), path.as_os_str()]) {
            let listed = String::from_utf8_lossy(&out.stdout);
            assert_eq!(listed.lines().count(), 2, "no picture: {listed}");
        }
        if let Some(structure) = structure_of(&written.bytes, "drawing") {
            assert!(structure.contains("Figure"), "{structure}");
        }
    }

    #[test]
    fn writes_a_font_without_outlines() {
        // krilla 0.8.2 draws the glyphs of a font without outlines as Type3
        // glyphs; were it to fail on a font, that font is left out with a
        // warning (see write_with), and the rest is written
        let emoji = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fonts/NotoEmoji-VariableFont_wght.ttf"
        ))
        .unwrap();
        let broken = without_tables(&emoji, &[b"glyf", b"loca", b"gvar"]);
        let mut engine = engine(vec![paragraph(1, "a crab \u{1f980} here")]);
        engine.add_font(broken, "Noto Emoji");
        let index = engine.fonts.files.len() - 1;
        let uses_it = (0..engine.pages.len()).any(|page| {
            engine
                .page_ops(page, false)
                .iter()
                .any(|op| matches!(op, Op::Glyphs { run, .. } if run.font == index))
        });
        assert!(uses_it, "the emoji is set in the broken font");
        let written = write_with(&mut engine, &HashMap::new(), &info(), "").unwrap();
        if let Some(text) = text_of(&written.bytes, "font") {
            assert!(text.contains("a crab"), "{text:?}");
        }
        assert!(written
            .warnings
            .iter()
            .all(|warning| *warning == Warning::Font(index)));
    }

    #[test]
    fn embeds_the_instances_of_variable_fonts() {
        let emoji = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fonts/NotoEmoji-VariableFont_wght.ttf"
        ))
        .unwrap();
        let mut bold = paragraph(1, "a \u{1f980} b");
        if let Content::Text(text) = &mut bold.content {
            text.spans = vec![crate::model::Span {
                from: 2,
                to: 4,
                bold: true,
                ..Default::default()
            }];
        }
        let mut engine = engine(vec![bold]);
        engine.add_font(emoji, "Noto Emoji");
        let instance = crate::fonts::INSTANCE_BASE;
        let fonts = PdfFonts::new(&engine.fonts, &[]);
        let face = engine.fonts.instances[0].file;
        // an instance is a font of its own in the PDF, at its coordinates
        assert!(fonts.get(instance).is_some());
        assert!(fonts.get(instance) != fonts.get(face));
        assert_eq!(fonts.index_of(fonts.get(instance).unwrap()), Some(instance));
        let written = write_with(&mut engine, &HashMap::new(), &info(), "").unwrap();
        assert!(written.warnings.is_empty());
        if let Some(text) = text_of(&written.bytes, "variable") {
            assert!(text.contains('\u{1f980}'), "{text:?}");
        }
    }

    #[test]
    fn leaves_out_a_skipped_font_without_panicking() {
        // what write_with does once krilla failed on a font: write again
        // without it. Its runs are left out, and their tags with them.
        let mut engine = engine(vec![paragraph(1, "hello"), paragraph(8, "world")]);
        let skipped = Skipped {
            images: vec![],
            fonts: vec![0],
        };
        let date = parse_date(&info().date);
        let written = attempt(
            &mut engine,
            &HashMap::new(),
            &info(),
            date,
            "",
            true,
            &skipped,
            &Output::Pages(&[0]),
        );
        assert!(written.is_ok());
    }

    /// renders a line of marks both ways, for a look: the PDF, and an SVG of
    /// the glyph outlines where the page view paints them. Run with
    /// BLANK_RENDER_DIR=dir cargo test -p blank-layout --lib renders_marks -- --ignored
    #[test]
    #[ignore]
    fn renders_marks_for_a_look() {
        let dir = std::env::var("BLANK_RENDER_DIR").expect("BLANK_RENDER_DIR");
        let text = "E\u{301}E\u{302}A\u{30A}O\u{308} \u{628}\u{64e}\u{627}\u{628}\u{650} \u{643}\u{64f}\u{62a}\u{64f}\u{628}";
        let mut item = paragraph(1, text);
        if let Content::Text(text) = &mut item.content {
            text.style = "h1".into();
        }
        let mut engine = engine(vec![item]);
        let pdf = write(&mut engine, &HashMap::new(), &info()).unwrap();
        std::fs::write(format!("{dir}/marks.pdf"), pdf).unwrap();
        let (width, height) = (engine.settings.width, engine.settings.height);
        let mut svg = format!(
            "<svg xmlns='http://www.w3.org/2000/svg' width='{width}' height='{height}' viewBox='0 0 {width} {height}'><rect width='100%' height='100%' fill='white'/>"
        );
        for op in engine.page_ops(0, false) {
            let Op::Glyphs { run, .. } = op else {
                continue;
            };
            let upem = engine
                .fonts
                .face(run.font)
                .map_or(1000.0, |(file, _)| file.upem);
            let scale = run.size / upem;
            for glyph in &run.glyphs {
                let path = engine.fonts.glyph_path(run.font, glyph.id);
                svg.push_str(&format!(
                    "<path transform='translate({} {}) scale({scale} {})' d='{path}'/>",
                    glyph.x, glyph.y, -scale
                ));
            }
        }
        svg.push_str("</svg>");
        std::fs::write(format!("{dir}/marks.svg"), svg).unwrap();
    }

    #[test]
    fn keeps_marks_on_their_side_of_the_baseline() {
        use krilla::text::Glyph as _;
        // kaf with a damma, in DejaVu Sans: the damma is placed with an
        // offset, which krilla must take the other way round (its y points
        // up, Parley's down), or the mark crashes into its letter
        let engine = engine(vec![paragraph(1, "\u{643}\u{64f}\u{62a}\u{64f}\u{628}")]);
        let mut checked = 0;
        for op in engine.body_ops(0) {
            let Op::Glyphs { run, .. } = op else {
                continue;
            };
            let glyphs = krilla_glyphs(&run.glyphs, run.size);
            for (glyph, krilla) in run.glyphs.iter().zip(&glyphs) {
                if glyph.dy != 0.0 {
                    assert!((krilla.y_offset(run.size) + glyph.dy).abs() < 1e-3);
                    checked += 1;
                }
            }
        }
        assert!(checked > 0, "no mark with an offset");
    }

    #[test]
    fn puts_repeated_header_rows_in_the_structure_once() {
        use crate::engine::test_support::{cell, table_item};
        use crate::model::Row;
        let mut rows = vec![Row {
            cells: vec![cell(3, "Heading")],
            header: true,
        }];
        for index in 0..120u32 {
            rows.push(Row {
                cells: vec![cell(20 + index * 10, "row")],
                header: false,
            });
        }
        let mut engine = engine(vec![table_item(rows, None)]);
        assert!(engine.pages.len() > 2);
        // on the pages after the first, the header row is a repeat
        let header = Part::Text { item: 0, text: 0 };
        for page in 1..engine.pages.len() {
            let parts = engine.body_parts(page);
            assert!(parts.iter().all(|(_, part)| *part != header), "page {page}");
            assert!(
                parts.iter().any(|(_, part)| *part == Part::Repeat),
                "page {page}"
            );
        }
        let pdf = write(&mut engine, &HashMap::new(), &info()).unwrap();
        let Some(structure) = structure_of(&pdf, "repeats") else {
            return;
        };
        assert_eq!(structure.matches("\"Heading\"").count(), 1, "{structure}");
    }

    #[test]
    fn may_leave_out_every_instance_too() {
        // a variable font in bold is an instance, which krilla embeds as a
        // font of its own and so may fail on: the retries count it
        let emoji = std::fs::read(concat!(
            env!("CARGO_MANIFEST_DIR"),
            "/../../fonts/NotoEmoji-VariableFont_wght.ttf"
        ))
        .unwrap();
        let mut bold = paragraph(1, "a \u{1f980}");
        if let Content::Text(text) = &mut bold.content {
            text.spans = vec![crate::model::Span {
                from: 2,
                to: 4,
                bold: true,
                ..Default::default()
            }];
        }
        let mut engine = engine(vec![bold]);
        engine.add_font(emoji, "Noto Emoji");
        assert_eq!(engine.fonts.instances.len(), 1);
        assert_eq!(attempts(0, &engine.fonts), 1 + engine.fonts.files.len() + 1);
    }

    #[test]
    fn tags_an_image_in_a_list_in_a_cell_as_a_list_item() {
        use crate::engine::test_support::table_item;
        use crate::model::{Cell, CellBlock, Row};
        let image = CellBlock::Image {
            pos: 5,
            src: "pixel.png".into(),
            width: 40.0,
            height: 40.0,
            alt: "a red pixel".into(),
            indent: 18.0,
            marker: Some("•".into()),
            bars: vec![],
            share: None,
        };
        let cell = Cell {
            blocks: vec![image],
            ..Default::default()
        };
        let mut engine = engine(vec![table_item(
            vec![Row {
                cells: vec![cell],
                header: false,
            }],
            None,
        )]);
        let mut images = HashMap::new();
        images.insert(
            "pixel.png".to_string(),
            ImageData {
                bytes: PNG.to_vec(),
                kind: ImageKind::Png,
            },
        );
        let pdf = write(&mut engine, &images, &info()).unwrap();
        let Some(structure) = structure_of(&pdf, "listed-image") else {
            return;
        };
        let body = structure.find("LBody").expect("a list item");
        assert!(structure[..body].contains("Lbl"), "{structure}");
        assert!(structure[body..].contains("Figure"), "{structure}");
    }

    /// whether a PDF says it is a PDF/A-2u, in its XMP metadata
    fn says_pdfa(pdf: &[u8]) -> bool {
        let text = String::from_utf8_lossy(pdf);
        text.contains("<pdfaid:part>2</pdfaid:part><pdfaid:conformance>U</pdfaid:conformance>")
    }

    #[test]
    fn a_normal_document_is_pdfa() {
        let mut engine = engine(vec![paragraph(1, "hello"), paragraph(8, "world")]);
        let mut images = HashMap::new();
        images.insert(
            "red.png".to_string(),
            ImageData {
                bytes: PNG.to_vec(),
                kind: ImageKind::Png,
            },
        );
        engine.set_items(vec![paragraph(1, "hello"), image(8, "red.png")]);
        let written = write_with(&mut engine, &images, &info(), "de-CH").unwrap();
        // krilla checked the rules of PDF/A-2u, and found nothing
        assert!(written.warnings.is_empty(), "{:?}", written.warnings);
        assert!(says_pdfa(&written.bytes));
        let text = String::from_utf8_lossy(&written.bytes);
        assert!(text.contains("/OutputIntents"), "no output intent");
        assert!(text.contains("/S/GTS_PDFA1"), "no PDF/A output intent");
        assert!(text.contains("<rdf:li>de-CH</rdf:li>"), "no dc:language");
        assert!(text.contains("/Lang(de-CH)"), "no /Lang");
        // PDF/A forbids smoothing images
        assert!(!text.contains("/Interpolate true"));
    }

    #[test]
    fn a_character_no_font_has_falls_back_to_a_normal_pdf() {
        // no font of the repository has Egyptian hieroglyphs
        let mut engine = engine(vec![paragraph(1, "a \u{13000} b \u{13000}\u{13001}")]);
        let written = write_with(&mut engine, &HashMap::new(), &info(), "en").unwrap();
        assert_eq!(
            written.warnings,
            vec![Warning::Pdfa(
                "no font has the characters \u{13000}\u{13001}".into()
            )]
        );
        assert!(!says_pdfa(&written.bytes));
        // and the normal PDF keeps the text, as before
        if let Some(text) = text_of(&written.bytes, "no-font") {
            assert!(text.contains('a') && text.contains('b'), "{text:?}");
        }
    }

    #[test]
    fn a_pdf_without_a_date_is_a_normal_pdf() {
        let mut engine = engine(vec![paragraph(1, "hello")]);
        let none = Info::default();
        let written = write_with(&mut engine, &HashMap::new(), &none, "").unwrap();
        assert_eq!(
            written.warnings,
            vec![Warning::Pdfa("it has no date".into())]
        );
        assert!(!says_pdfa(&written.bytes));
        let wrong = Info {
            date: "yesterday".into(),
            ..Info::default()
        };
        let written = write_with(&mut engine, &HashMap::new(), &wrong, "").unwrap();
        assert_eq!(
            written.warnings,
            vec![Warning::Pdfa("its date yesterday can't be read".into())]
        );
    }

    #[test]
    fn reads_iso_dates() {
        let date = |year: u16| {
            DateTime::new(year)
                .month(10)
                .day(1)
                .hour(9)
                .minute(30)
                .second(5)
        };
        assert_eq!(
            parse_date("2026-10-01T09:30:05Z"),
            Some(date(2026).utc_offset_hour(0).utc_offset_minute(0))
        );
        assert_eq!(
            parse_date("2026-10-01T09:30:05.123+05:45"),
            Some(date(2026).utc_offset_hour(5).utc_offset_minute(45))
        );
        assert_eq!(
            parse_date("2026-10-01t09:30:05-03:30"),
            Some(date(2026).utc_offset_hour(-3).utc_offset_minute(30))
        );
        for wrong in [
            "",
            "2026-10-01",
            "2026-10-01T09:30:05",
            "2026-13-01T09:30:05Z",
            "2026-10-01T24:30:05Z",
            "2026-10-01T09:30:05.Z",
            "2026-10-01T09:30:05+5:45",
            "2026-1०-01T09:30:05Z",
            "+026-10-01T09:30:05Z",
        ] {
            assert_eq!(parse_date(wrong), None, "{wrong}");
        }
    }

    /// writes `pdf` to a file of the temporary folder named after `name`
    fn temp_pdf(pdf: &[u8], name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!("blank-layout-unit-{name}.pdf"));
        std::fs::write(&path, pdf).unwrap();
        path
    }

    /// what pdfinfo says of a PDF, if pdfinfo is there
    fn info_of(pdf: &[u8], name: &str) -> Option<String> {
        let path = temp_pdf(pdf, name);
        let out = poppler("pdfinfo", &[path.as_os_str()])?;
        Some(String::from_utf8_lossy(&out.stdout).into_owned())
    }

    /// the PDF's objects as text, uncompressed, if qpdf is there
    fn objects_of(pdf: &[u8], name: &str) -> Option<String> {
        let path = temp_pdf(pdf, name);
        let out = run_tool(
            "qpdf",
            "qpdf",
            &[
                "--qdf".as_ref(),
                "--object-streams=disable".as_ref(),
                path.as_os_str(),
                "-".as_ref(),
            ],
        )?;
        Some(String::from_utf8_lossy(&out.stdout).into_owned())
    }

    /// the words of a PDF with their page (from 0) and left edge, as
    /// `pdftotext -bbox` reads them, if it is there
    fn boxed_words(pdf: &[u8], name: &str) -> Option<Vec<(usize, f32, String)>> {
        let path = temp_pdf(pdf, name);
        let out = poppler(
            "pdftotext",
            &["-bbox".as_ref(), path.as_os_str(), "-".as_ref()],
        )?;
        let html = String::from_utf8_lossy(&out.stdout).into_owned();
        let mut page = None;
        let mut words = vec![];
        for line in html.lines().map(str::trim) {
            if line.starts_with("<page") {
                page = Some(page.map_or(0, |page| page + 1));
            } else if let Some(rest) = line.strip_prefix("<word xMin=\"") {
                let x: f32 = rest[..rest.find('"').unwrap()].parse().unwrap();
                let text = &line[line.find('>').unwrap() + 1..line.rfind("</word>").unwrap()];
                words.push((page.unwrap(), x, text.to_string()));
            }
        }
        Some(words)
    }

    /// three pages with a heading each, the first with a table of contents
    /// of all three
    fn three_chapters() -> Engine {
        let entries = ["One", "Two", "Three"]
            .map(|text| crate::model::TocEntry {
                level: 1,
                text: text.into(),
            })
            .to_vec();
        let toc = Item {
            content: Content::Toc {
                pos: 1,
                title: "Contents".into(),
                depth: 3,
                entries,
            },
            ..paragraph(1, "")
        };
        let mut two = heading(8, 1, "Two");
        two.page_start = true;
        let mut three = heading(13, 1, "Three");
        three.page_start = true;
        let engine = engine(vec![toc, heading(3, 1, "One"), two, three]);
        assert_eq!(engine.pages.len(), 3);
        engine
    }

    #[test]
    fn writes_only_the_chosen_pages() {
        let mut engine = three_chapters();
        let written = write_pages(&mut engine, &HashMap::new(), &info(), "en", &[0, 2]).unwrap();
        let pdf = written.bytes;
        assert!(written.warnings.is_empty());
        assert!(says_pdfa(&pdf));
        if let Some(info) = info_of(&pdf, "subset") {
            assert!(info.contains("Pages:           2"), "{info}");
            assert!(info.contains("Tagged:          yes"), "{info}");
        }
        if let Some(text) = text_of(&pdf, "subset") {
            // the table of contents lists Two, but its page isn't there
            let headings: Vec<&str> = text.lines().filter(|line| *line == "Two").collect();
            assert_eq!(headings.len(), 1, "{text}");
            assert!(text.contains("Three"));
        }
        if let Some(objects) = objects_of(&pdf, "subset") {
            // bookmarks and links only to the pages written
            assert!(objects.contains("/Title (One)"));
            assert!(objects.contains("/Title (Three)"));
            assert!(!objects.contains("/Title (Two)"));
            assert_eq!(objects.matches("/Subtype /Link").count(), 2);
        }
    }

    #[test]
    fn rejects_pages_that_dont_exist() {
        let mut engine = three_chapters();
        let images = HashMap::new();
        let error = write_pages(&mut engine, &images, &info(), "", &[1, 3]).err();
        assert_eq!(error.as_deref(), Some("there is no page 4"));
        assert!(write_pages(&mut engine, &images, &info(), "", &[2, 1]).is_err());
        assert!(write_pages(&mut engine, &images, &info(), "", &[]).is_err());
    }

    /// two pages side by side on a landscape sheet, as the print dialog
    /// places them
    fn two_up(engine: &Engine, pages: [usize; 2]) -> PrintSheet {
        let (width, height) = (engine.settings.height, engine.settings.width);
        let gutter = 18.0;
        let cell = (width - 3.0 * gutter) / 2.0;
        let scale =
            (cell / engine.settings.width).min((height - 2.0 * gutter) / engine.settings.height);
        let y = (height - engine.settings.height * scale) / 2.0;
        PrintSheet {
            width,
            height,
            placements: pages
                .iter()
                .enumerate()
                .map(|(index, &page)| Placement {
                    page,
                    x: gutter + index as f32 * (cell + gutter),
                    y,
                    scale,
                })
                .collect(),
        }
    }

    #[test]
    fn prints_two_pages_per_sheet() {
        let mut items = document(&["Alpha", "Beta", "Gamma"]);
        for item in &mut items[1..] {
            item.page_start = true;
        }
        let mut engine = engine(items);
        let sheets = vec![
            two_up(&engine, [0, 1]),
            PrintSheet {
                placements: vec![two_up(&engine, [2, 2]).placements[0].clone()],
                ..two_up(&engine, [2, 2])
            },
        ];
        let laid: Vec<Word> = engine.words();
        let written = write_print(&mut engine, &HashMap::new(), &info(), &sheets).unwrap();
        let pdf = written.bytes;
        assert!(written.warnings.is_empty());
        assert!(!says_pdfa(&pdf));
        if let Some(info) = info_of(&pdf, "two-up") {
            assert!(info.contains("Pages:           2"), "{info}");
            assert!(
                info.contains("Page size:       841.89 x 595.28 pts"),
                "{info}"
            );
            assert!(info.contains("Tagged:          no"), "{info}");
        }
        let Some(words) = boxed_words(&pdf, "two-up") else {
            return;
        };
        // each word where its page's placement puts it
        for heading in ["Alpha", "Beta", "Gamma"] {
            let word = laid.iter().find(|word| word.text == heading).unwrap();
            let sheet = if word.page == 2 { 1 } else { 0 };
            let placement = sheets[sheet]
                .placements
                .iter()
                .find(|placement| placement.page == word.page)
                .unwrap();
            let expected = placement.x + word.left * placement.scale;
            let (page, x, _) = words.iter().find(|(_, _, text)| text == heading).unwrap();
            assert_eq!(*page, sheet, "{heading}");
            assert!((x - expected).abs() < 0.1, "{heading}: {x} vs {expected}");
        }
    }

    #[test]
    fn prints_the_same_sheets_the_same_way() {
        // a character no font has, in two fonts, whose missing glyphs are
        // unmapped on the first sheet in the order of the pages
        let mut items = document(&["Alpha \u{13000}", "Beta"]);
        items[1] = heading(9, 1, "Beta \u{13000}");
        items[1].page_start = true;
        let mut engine = engine(items);
        let sheets = [two_up(&engine, [1, 0])];
        let first = write_print(&mut engine, &HashMap::new(), &info(), &sheets).unwrap();
        let again = write_print(&mut engine, &HashMap::new(), &info(), &sheets).unwrap();
        assert!(first.bytes == again.bytes);
        if let Some(text) = text_of(&first.bytes, "missing-glyph") {
            assert!(text.contains('\u{13000}'), "{text}");
        }
    }

    #[test]
    fn rejects_placements_that_cant_be_drawn() {
        let mut engine = three_chapters();
        let mut sheet = two_up(&engine, [0, 1]);
        sheet.placements[1].scale = 0.0;
        let error = write_print(&mut engine, &HashMap::new(), &info(), &[sheet]).err();
        assert_eq!(
            error.as_deref(),
            Some("a sheet's size or a page's place on it can't be used")
        );
    }

    #[test]
    fn prints_no_hints() {
        let mut field = paragraph(1, "");
        if let Content::Text(text) = &mut field.content {
            text.hint = Some("Your name".into());
        }
        let mut engine = engine(vec![field, paragraph(3, "Signed")]);
        let sheet = PrintSheet {
            width: engine.settings.width,
            height: engine.settings.height,
            placements: vec![Placement {
                page: 0,
                x: 0.0,
                y: 0.0,
                scale: 1.0,
            }],
        };
        let pdf = write_print(&mut engine, &HashMap::new(), &info(), &[sheet])
            .unwrap()
            .bytes;
        if let Some(text) = text_of(&pdf, "no-hints") {
            assert!(text.contains("Signed"));
            assert!(!text.contains("Your name"), "{text}");
        }
    }

    #[test]
    fn rejects_sheets_with_pages_that_dont_exist() {
        let mut engine = three_chapters();
        let sheet = PrintSheet {
            width: 100.0,
            height: 100.0,
            placements: vec![Placement {
                page: 5,
                x: 0.0,
                y: 0.0,
                scale: 1.0,
            }],
        };
        let error = write_print(&mut engine, &HashMap::new(), &info(), &[sheet]).err();
        assert_eq!(error.as_deref(), Some("there is no page 6"));
        assert!(write_print(&mut engine, &HashMap::new(), &info(), &[]).is_err());
    }
}

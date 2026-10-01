//! The PDF, written with krilla from the same layout the screen paints:
//! every glyph where the engine placed it, in the embedded, subset fonts.

use std::collections::HashMap;

use krilla::action::{Action, LinkAction};
use krilla::annotation::{Annotation, LinkAnnotation, Target};
use krilla::color::rgb;
use krilla::error::KrillaError;
use krilla::geom::{PathBuilder, Point, Rect, Size, Transform};
use krilla::image::Image;
use krilla::metadata::Metadata;
use krilla::num::NormalizedF32;
use krilla::page::PageSettings;
use krilla::paint::Fill;
use krilla::surface::Surface;
use krilla::tagging::{Artifact, ArtifactType, ContentTag, SpanTag};
use krilla::text::{Font, GlyphId, KrillaGlyph, Tag};
use krilla::Document;
use parley::Alignment;

use crate::engine::{Engine, Op, Part};
use crate::fonts::{Fonts, INSTANCE_BASE};
use crate::items::Role;
use crate::model::Text;
use crate::text::{Glyph, TextBox};

mod tags;

pub use tags::outline_entries;

/// an image's file, by its src
pub struct ImageData {
    pub bytes: Vec<u8>,
    pub jpeg: bool,
}

pub struct Info {
    pub title: String,
    pub author: String,
}

/// the colour of each role on paper
fn color(role: Role) -> rgb::Color {
    match role {
        // the PDF shows links and alt text in the text's colour, as pdfmake
        // did
        Role::Text | Role::LinkLine | Role::Hint => rgb::Color::new(0, 0, 0),
        Role::Band => rgb::Color::new(0x66, 0x66, 0x66),
        Role::CodeFill => rgb::Color::new(0xf1, 0xf2, 0xf3),
        Role::TableLine | Role::Placeholder => rgb::Color::new(0xd1, 0xd4, 0xd6),
        Role::HeaderLine => rgb::Color::new(0x82, 0x89, 0x90),
        Role::HeaderFill => rgb::Color::new(0xf1, 0xf2, 0xf3),
    }
}

fn fill(role: Role) -> Fill {
    Fill {
        paint: color(role).into(),
        opacity: NormalizedF32::ONE,
        rule: Default::default(),
    }
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
    Other(String),
}

/// writes the document's pages as a PDF in `language` (a BCP 47 tag, or
/// empty for none), with what went wrong: an image that can't be decoded
/// shows its alt text, and a font that can't be embedded is left out, so
/// neither fails the whole PDF
pub fn write_with(
    engine: &mut Engine,
    images: &HashMap<String, ImageData>,
    info: &Info,
    language: &str,
) -> Result<Written, String> {
    let mut skipped = Skipped::default();
    // krilla tells what it fails on only once it writes the document, so
    // write it again without that, once for each image and font at most
    for _ in 0..=images.len() + engine.fonts.files.len() {
        match attempt(engine, images, info, language, &skipped) {
            Ok((bytes, undecoded)) => {
                let mut warnings: Vec<Warning> = vec![];
                for src in undecoded.into_iter().chain(skipped.images.iter().cloned()) {
                    if !warnings.contains(&Warning::Image(src.clone())) {
                        warnings.push(Warning::Image(src));
                    }
                }
                warnings.extend(skipped.fonts.iter().map(|&font| Warning::Font(font)));
                return Ok(Written { bytes, warnings });
            }
            Err(Failed::Image(src)) if !skipped.images.contains(&src) => skipped.images.push(src),
            Err(Failed::Font(font)) if !skipped.fonts.contains(&font) => skipped.fonts.push(font),
            Err(Failed::Image(src)) => return Err(format!("the image {src} can't be written")),
            Err(Failed::Font(font)) => return Err(format!("the font {font} can't be written")),
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
        style: "alt".into(),
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

/// writes the PDF once, leaving out what is skipped: its bytes and the
/// images it couldn't decode, or what it failed on
fn attempt(
    engine: &mut Engine,
    images: &HashMap<String, ImageData>,
    info: &Info,
    language: &str,
    skipped: &Skipped,
) -> Result<(Vec<u8>, Vec<String>), Failed> {
    let mut document = Document::new();
    let fonts = PdfFonts::new(&engine.fonts, &skipped.fonts);
    let mut loaded: HashMap<String, Option<Image>> = HashMap::new();
    let mut undecoded: Vec<String> = vec![];
    let mut ids = tags::Ids::new();
    // the order everything is drawn in, for the structure
    let mut order = 0usize;
    let (width, height) = (engine.settings.width, engine.settings.height);
    // the fonts whose missing glyph the document shows, for what no font has
    let mut missing: Vec<usize> = vec![];
    for page_index in 0..engine.pages.len() {
        for op in engine.page_ops(page_index, true) {
            if let Op::Glyphs { run, .. } = op {
                if run.glyphs.iter().any(|glyph| glyph.id == 0) && !missing.contains(&run.font) {
                    missing.push(run.font);
                }
            }
        }
    }
    for page_index in 0..engine.pages.len() {
        let mut ops = engine.body_parts(page_index);
        ops.extend(engine.band_parts(page_index));
        let settings = PageSettings::from_wh(width, height)
            .ok_or_else(|| Failed::Other("the page has no size".into()))?;
        let mut page = document.start_page_with(settings);
        let mut links = vec![];
        {
            let mut surface = page.surface();
            if page_index == 0 {
                for font in missing.iter().filter_map(|&font| fonts.get(font).cloned()) {
                    unmap_missing_glyph(&mut surface, font);
                }
            }
            for (op, part) in ops {
                if let Op::Link { href, x, y, w, h } = op {
                    links.push((href, x, y, w, h, part));
                    continue;
                }
                // what isn't content of the document is an artifact, and the
                // rest is tagged, for the structure to hold it
                let tag = match part {
                    Part::Decoration => {
                        ContentTag::Artifact(Artifact::new(ArtifactType::Other, None))
                    }
                    Part::Band { footer: false } => {
                        ContentTag::Artifact(Artifact::new(ArtifactType::Header, None))
                    }
                    Part::Band { footer: true } => {
                        ContentTag::Artifact(Artifact::new(ArtifactType::Footer, None))
                    }
                    Part::Repeat => {
                        ContentTag::Artifact(Artifact::new(ArtifactType::PaginationOther, None))
                    }
                    _ => ContentTag::Span(SpanTag::empty()),
                };
                // what can't be drawn is left out before its tag opens: a
                // tagged section must be closed on every path
                let drawable = match &op {
                    Op::Rect { x, y, w, h, .. } => {
                        Rect::from_xywh(*x, *y, w.max(0.01), h.max(0.01)).is_some()
                    }
                    Op::Glyphs { run, .. } => fonts.get(run.font).is_some(),
                    _ => true,
                };
                if !drawable {
                    continue;
                }
                let id = surface.start_tagged(tag);
                if !matches!(part, Part::Decoration | Part::Band { .. } | Part::Repeat) {
                    order += 1;
                    ids.entry(part).or_default().push((order, id));
                }
                match op {
                    Op::Rect { x, y, w, h, role } => {
                        let rect = Rect::from_xywh(x, y, w.max(0.01), h.max(0.01));
                        let mut builder = PathBuilder::new();
                        if let Some(rect) = rect {
                            builder.push_rect(rect);
                        }
                        if let Some(path) = builder.finish() {
                            surface.set_fill(Some(fill(role)));
                            surface.draw_path(&path);
                        }
                    }
                    Op::Glyphs { run, role, text } => {
                        // a font that can't be embedded is left out (above)
                        if let Some(font) = fonts.get(run.font) {
                            surface.set_fill(Some(fill(role)));
                            draw_run(&mut surface, &run.glyphs, font, &text, run.size);
                        }
                    }
                    Op::Image {
                        src,
                        alt,
                        x,
                        y,
                        w,
                        h,
                    } => {
                        let image = loaded.entry(src.clone()).or_insert_with(|| {
                            if skipped.images.contains(&src) {
                                return None;
                            }
                            let data = images.get(&src)?;
                            let bytes = data.bytes.clone().into();
                            let image = if data.jpeg {
                                Image::from_jpeg(bytes, true)
                            } else {
                                Image::from_png(bytes, true)
                            };
                            if image.is_err() {
                                undecoded.push(src.clone());
                            }
                            image.ok()
                        });
                        match (image.clone(), Size::from_wh(w, h)) {
                            (Some(image), Some(size)) => {
                                surface.push_transform(&Transform::from_translate(x, y));
                                surface.draw_image(image, size);
                                surface.pop();
                            }
                            _ => {
                                let alt = if alt.is_empty() { &src } else { &alt };
                                paint_alt(&mut surface, &mut engine.fonts, &fonts, alt, x, y, w, h);
                            }
                        }
                    }
                    Op::Link { .. } => {}
                }
                surface.end_tagged();
            }
            surface.finish();
        }
        for (href, x, y, w, h, part) in links {
            if let Some(rect) = Rect::from_xywh(x, y, w.max(0.01), h.max(0.01)) {
                let target = Target::Action(Action::Link(LinkAction::new(href.clone())));
                let annotation =
                    Annotation::new_link(LinkAnnotation::new(rect, target), Some(href));
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
    document.set_outline(tags::outline(engine));
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
    document.set_metadata(metadata);
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
        Err(error) => Err(Failed::Other(format!("{error:?}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::test_support::{engine, paragraph};
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
            },
            ..paragraph(0, "")
        }
    }

    fn info() -> Info {
        Info {
            title: String::new(),
            author: String::new(),
        }
    }

    /// the plain text of a PDF, if pdftotext is there; on CI it must be
    fn text_of(pdf: &[u8], name: &str) -> Option<String> {
        let path = std::env::temp_dir().join(format!("blank-layout-unit-{name}.pdf"));
        std::fs::write(&path, pdf).unwrap();
        let out = std::process::Command::new("pdftotext")
            .args(["-enc", "UTF-8"])
            .arg(&path)
            .arg("-")
            .output();
        let out = match out {
            Ok(out) => out,
            Err(_) if std::env::var_os("CI").is_some() => {
                panic!("pdftotext is missing: install poppler-utils, CI doesn't skip the check")
            }
            Err(_) => return None,
        };
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
            images.insert(src.to_string(), ImageData { bytes, jpeg: false });
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
        let written = attempt(&mut engine, &HashMap::new(), &info(), "", &skipped);
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
        let path = std::env::temp_dir().join("blank-layout-unit-repeats.pdf");
        std::fs::write(&path, pdf).unwrap();
        let Ok(out) = std::process::Command::new("pdfinfo")
            .arg("-struct-text")
            .arg(&path)
            .output()
        else {
            return;
        };
        let structure = String::from_utf8_lossy(&out.stdout);
        assert_eq!(structure.matches("\"Heading\"").count(), 1, "{structure}");
    }
}

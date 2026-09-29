//! The PDF, written with krilla from the same layout the screen paints:
//! every glyph where the engine placed it, in the embedded, subset fonts.

use std::collections::HashMap;

use krilla::action::{Action, LinkAction};
use krilla::annotation::{Annotation, LinkAnnotation, Target};
use krilla::color::rgb;
use krilla::geom::{PathBuilder, Point, Rect, Size, Transform};
use krilla::image::Image;
use krilla::metadata::Metadata;
use krilla::num::NormalizedF32;
use krilla::page::PageSettings;
use krilla::paint::Fill;
use krilla::text::{Font, GlyphId, KrillaGlyph};
use krilla::Document;

use crate::engine::{Engine, Op};
use crate::items::Role;

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

/// writes the document's pages as a PDF
pub fn write(
    engine: &mut Engine,
    images: &HashMap<String, ImageData>,
    info: &Info,
) -> Result<Vec<u8>, String> {
    let mut document = Document::new();
    let fonts: Vec<Option<Font>> = engine
        .fonts
        .files
        .iter()
        .map(|file| Font::new(file.data.clone().into(), 0))
        .collect();
    let mut loaded: HashMap<String, Option<Image>> = HashMap::new();
    let (width, height) = (engine.settings.width, engine.settings.height);
    for page_index in 0..engine.pages.len() {
        let ops = engine.page_ops(page_index, true);
        let settings = PageSettings::from_wh(width, height).ok_or("the page has no size")?;
        let mut page = document.start_page_with(settings);
        let mut links = vec![];
        {
            let mut surface = page.surface();
            for op in ops {
                match op {
                    Op::Rect { x, y, w, h, role } => {
                        let Some(rect) = Rect::from_xywh(x, y, w.max(0.01), h.max(0.01)) else {
                            continue;
                        };
                        let mut builder = PathBuilder::new();
                        builder.push_rect(rect);
                        if let Some(path) = builder.finish() {
                            surface.set_fill(Some(fill(role)));
                            surface.draw_path(&path);
                        }
                    }
                    Op::Glyphs { run, role, text } => {
                        let Some(Some(font)) = fonts.get(run.font) else {
                            continue;
                        };
                        let Some(first) = run.glyphs.first() else {
                            continue;
                        };
                        let size = run.size;
                        let glyphs: Vec<KrillaGlyph> = run
                            .glyphs
                            .iter()
                            .map(|glyph| {
                                KrillaGlyph::new(
                                    GlyphId::new(glyph.id),
                                    glyph.advance / size,
                                    glyph.dx / size,
                                    glyph.dy / size,
                                    0.0,
                                    glyph.start as usize..glyph.end as usize,
                                    None,
                                )
                            })
                            .collect();
                        surface.set_fill(Some(fill(role)));
                        surface.draw_glyphs(
                            Point::from_xy(first.x - first.dx, first.y - first.dy),
                            &glyphs,
                            font.clone(),
                            &text,
                            size,
                            false,
                        );
                    }
                    Op::Image { src, x, y, w, h } => {
                        let image = loaded.entry(src.clone()).or_insert_with(|| {
                            let data = images.get(&src)?;
                            let bytes = data.bytes.clone().into();
                            if data.jpeg {
                                Image::from_jpeg(bytes, true).ok()
                            } else {
                                Image::from_png(bytes, true).ok()
                            }
                        });
                        let (Some(image), Some(size)) = (image.clone(), Size::from_wh(w, h)) else {
                            continue;
                        };
                        surface.push_transform(&Transform::from_translate(x, y));
                        surface.draw_image(image, size);
                        surface.pop();
                    }
                    Op::Link { href, x, y, w, h } => links.push((href, x, y, w, h)),
                }
            }
            surface.finish();
        }
        for (href, x, y, w, h) in links {
            if let Some(rect) = Rect::from_xywh(x, y, w.max(0.01), h.max(0.01)) {
                let target = Target::Action(Action::Link(LinkAction::new(href)));
                page.add_annotation(Annotation::new_link(
                    LinkAnnotation::new(rect, target),
                    None,
                ));
            }
        }
        page.finish();
    }
    let mut metadata = Metadata::new().creator("Blank".into());
    if !info.title.is_empty() {
        metadata = metadata.title(info.title.clone());
    }
    if !info.author.is_empty() {
        metadata = metadata.authors(vec![info.author.clone()]);
    }
    document.set_metadata(metadata);
    document.finish().map_err(|error| format!("{error:?}"))
}

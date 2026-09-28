//! The fonts the engine lays out with: IBM Plex Sans and DejaVu Sans as the
//! fallback, loaded from their files. No system fonts, so the layout is the
//! same everywhere.

use std::fmt::Write;
use std::sync::Arc;

use parley::fontique::{Blob, Collection, CollectionOptions, SourceCache};
use parley::{FontContext, FontData, LayoutContext};
use skrifa::instance::{LocationRef, Size};
use skrifa::outline::{DrawSettings, OutlinePen};
use skrifa::raw::TableProvider;
use skrifa::{FontRef, GlyphId, MetadataProvider};

/// what a glyph run is painted with, packed into the brush of Parley: the
/// link it belongs to (1-based, 0 for none) and whether it is code
pub type Ink = u32;
pub const INK_CODE: Ink = 1 << 16;

pub fn ink_link(ink: Ink) -> Option<usize> {
    let link = (ink & 0xffff) as usize;
    (link > 0).then(|| link - 1)
}

pub struct FontFile {
    pub data: Arc<Vec<u8>>,
    pub blob: u64,
    pub upem: f32,
    /// the underline's offset below the baseline and its thickness, in em
    pub underline: (f32, f32),
}

pub struct Fonts {
    pub files: Vec<FontFile>,
    pub fcx: FontContext,
    pub lcx: LayoutContext<Ink>,
}

impl Fonts {
    pub fn new(files: Vec<Vec<u8>>) -> Fonts {
        let mut fcx = FontContext {
            collection: Collection::new(CollectionOptions {
                shared: false,
                system_fonts: false,
            }),
            source_cache: SourceCache::default(),
        };
        let files = files
            .into_iter()
            .map(|bytes| {
                let data = Arc::new(bytes);
                let blob = Blob::new(data.clone());
                let id = blob.id();
                fcx.collection.register_fonts(blob, None);
                let (upem, underline) = match FontRef::new(&data) {
                    Ok(font) => {
                        let upem = font.head().map(|head| head.units_per_em()).unwrap_or(1000) as f32;
                        let metrics = font.metrics(Size::unscaled(), LocationRef::default());
                        let underline = metrics
                            .underline
                            .map(|line| (-line.offset / upem, line.thickness / upem))
                            .unwrap_or((0.1, 0.05));
                        (upem, underline)
                    }
                    Err(_) => (1000.0, (0.1, 0.05)),
                };
                FontFile {
                    data,
                    blob: id,
                    upem,
                    underline,
                }
            })
            .collect();
        Fonts {
            files,
            fcx,
            lcx: LayoutContext::new(),
        }
    }

    /// the index of the file a run's font comes from
    pub fn index_of(&self, font: &FontData) -> usize {
        let id = font.data.id();
        self.files
            .iter()
            .position(|file| file.blob == id)
            .unwrap_or(0)
    }

    /// the outline of a glyph as an SVG path, in font units with y up
    pub fn glyph_path(&self, font: usize, glyph: u32) -> String {
        let mut pen = SvgPen(String::new());
        if let Some(file) = self.files.get(font) {
            if let Ok(font) = FontRef::new(&file.data) {
                if let Some(outline) = font.outline_glyphs().get(GlyphId::new(glyph)) {
                    let settings = DrawSettings::unhinted(Size::unscaled(), LocationRef::default());
                    let _ = outline.draw(settings, &mut pen);
                }
            }
        }
        pen.0
    }
}

struct SvgPen(String);

impl OutlinePen for SvgPen {
    fn move_to(&mut self, x: f32, y: f32) {
        let _ = write!(self.0, "M{x} {y}");
    }
    fn line_to(&mut self, x: f32, y: f32) {
        let _ = write!(self.0, "L{x} {y}");
    }
    fn quad_to(&mut self, cx0: f32, cy0: f32, x: f32, y: f32) {
        let _ = write!(self.0, "Q{cx0} {cy0} {x} {y}");
    }
    fn curve_to(&mut self, cx0: f32, cy0: f32, cx1: f32, cy1: f32, x: f32, y: f32) {
        let _ = write!(self.0, "C{cx0} {cy0} {cx1} {cy1} {x} {y}");
    }
    fn close(&mut self) {
        self.0.push('Z');
    }
}

/// the fonts of the repository, for tests and the native tools
#[cfg(not(target_arch = "wasm32"))]
pub fn repository_fonts() -> Fonts {
    let dir = concat!(env!("CARGO_MANIFEST_DIR"), "/../../fonts/");
    Fonts::new(
        FONT_FILES
            .iter()
            .map(|name| std::fs::read(format!("{dir}{name}")).expect("font file"))
            .collect(),
    )
}

/// the font files, in the order src/engine/fonts.ts loads them
pub const FONT_FILES: [&str; 10] = [
    "IBMPlexSans-Regular.ttf",
    "IBMPlexSans-Italic.ttf",
    "IBMPlexSans-Medium.ttf",
    "IBMPlexSans-MediumItalic.ttf",
    "IBMPlexSans-Bold.ttf",
    "IBMPlexSans-BoldItalic.ttf",
    "dejavu-sans.ttf",
    "dejavu-sans-oblique.ttf",
    "dejavu-sans-bold.ttf",
    "dejavu-sans-bold-oblique.ttf",
];

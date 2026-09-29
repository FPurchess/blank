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

/// a face of a font file: a collection (.ttc) has several
pub struct FontFile {
    pub data: Arc<Vec<u8>>,
    pub blob: u64,
    /// which face of the file it is
    pub index: u32,
    pub upem: f32,
    /// the underline's offset below the baseline and its thickness, in em
    pub underline: (f32, f32),
}

pub struct Fonts {
    pub files: Vec<FontFile>,
    pub fcx: FontContext,
    pub lcx: LayoutContext<Ink>,
    /// the families text is set in, in order, with the fallbacks added for
    /// what they lack; and the same for code
    pub stack: String,
    pub mono_stack: String,
}

/// reads the faces of a font file: their units per em and underlines
fn faces_of(fcx: &mut FontContext, bytes: Vec<u8>) -> Vec<FontFile> {
    let data = Arc::new(bytes);
    let blob = Blob::new(data.clone());
    let id = blob.id();
    fcx.collection.register_fonts(blob, None);
    let count = match skrifa::raw::FileRef::new(&data) {
        Ok(skrifa::raw::FileRef::Collection(collection)) => collection.len(),
        _ => 1,
    };
    (0..count)
        .map(|index| face_of(data.clone(), id, index))
        .collect()
}

fn face_of(data: Arc<Vec<u8>>, blob: u64, index: u32) -> FontFile {
    let (upem, underline) = match FontRef::from_index(&data, index) {
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
        blob,
        index,
        upem,
        underline,
    }
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
            .flat_map(|bytes| faces_of(&mut fcx, bytes))
            .collect();
        Fonts {
            files,
            fcx,
            lcx: LayoutContext::new(),
            stack: FONT_STACK.into(),
            mono_stack: MONO_STACK.into(),
        }
    }

    /// adds a font for what the others lack, e.g. a system font for Chinese
    /// or an emoji font, as the last fallback of text and code
    pub fn add(&mut self, bytes: Vec<u8>, family: &str) {
        let faces = faces_of(&mut self.fcx, bytes);
        self.files.extend(faces);
        let family = family.replace(',', " ");
        if !self.stack.split(", ").any(|known| known == family) {
            self.stack = format!("{}, {family}", self.stack);
            self.mono_stack = format!("{}, {family}", self.mono_stack);
        }
    }

    /// the index of the file a run's font comes from
    pub fn index_of(&self, font: &FontData) -> usize {
        let id = font.data.id();
        self.files
            .iter()
            .position(|file| file.blob == id && file.index == font.index)
            .unwrap_or(0)
    }

    /// the outline of a glyph as an SVG path, in font units with y up
    pub fn glyph_path(&self, font: usize, glyph: u32) -> String {
        let mut pen = SvgPen(String::new());
        if let Some(file) = self.files.get(font) {
            if let Ok(font) = FontRef::from_index(&file.data, file.index) {
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

/// the families text is set in: IBM Plex Sans, and DejaVu Sans for what it
/// lacks, e.g. arrows; and code in IBM Plex Mono
pub const FONT_STACK: &str = "IBM Plex Sans, DejaVu Sans";
pub const MONO_STACK: &str = "IBM Plex Mono, IBM Plex Sans, DejaVu Sans";

/// the font files, in the order src/engine/fonts.ts loads them
pub const FONT_FILES: [&str; 14] = [
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
    "IBMPlexMono-Regular.ttf",
    "IBMPlexMono-Italic.ttf",
    "IBMPlexMono-Bold.ttf",
    "IBMPlexMono-BoldItalic.ttf",
];

//! The fonts the engine lays out with: IBM Plex Sans and DejaVu Sans as the
//! fallback, loaded from their files. No system fonts, so the layout is the
//! same everywhere.

use std::fmt::Write;
use std::sync::Arc;

use parley::fontique::{Blob, Collection, CollectionOptions, FontInfoOverride, SourceCache};
use parley::{FontContext, FontData, LayoutContext};
use skrifa::instance::{LocationRef, Size};
use skrifa::outline::{DrawSettings, OutlinePen};
use skrifa::raw::TableProvider;
use skrifa::{FontRef, GlyphId, MetadataProvider};

/// what a glyph run is painted with, packed into the brush of Parley: the
/// link it belongs to (1-based, 0 for none), whether it is code and whether
/// it is underlined (a link's underline is drawn as the link's)
pub type Ink = u32;
pub const INK_CODE: Ink = 1 << 16;
pub const INK_UNDERLINE: Ink = 1 << 17;

pub fn ink_link(ink: Ink) -> Option<usize> {
    let link = (ink & 0xffff) as usize;
    (link > 0).then(|| link - 1)
}

/// a face of a font file: a collection (.ttc) has several
#[derive(Clone)]
pub struct FontFile {
    /// the file, shared by its faces and by every engine that shares the
    /// fonts, see `Fonts::share`
    pub data: Arc<Vec<u8>>,
    /// the file as Parley knows it; its clones keep its id
    pub blob: Blob<u8>,
    /// the family it was added as a fallback for, see `Fonts::add`; empty
    /// for the fonts the engine was made with
    pub family: String,
    /// which face of the file it is
    pub index: u32,
    pub upem: f32,
    /// the underline's offset below the baseline and its thickness, in em
    pub underline: (f32, f32),
}

/// where the instances of variable fonts are numbered from, see `Instance`:
/// far above any number of faces, so a face's number and an instance's
/// never change, whatever is added later
pub const INSTANCE_BASE: usize = 1 << 20;

/// a face of a variable font at coordinates other than its default, e.g.
/// the bold of a font whose weight varies. Its font index is
/// `INSTANCE_BASE` plus its place in `Fonts::instances`.
#[derive(Clone, Debug, PartialEq)]
pub struct Instance {
    /// the face, in `Fonts::files`
    pub file: usize,
    /// its coordinates by axis, as Parley set them, e.g. wght 700
    pub variations: Vec<([u8; 4], f32)>,
    /// the same, normalized, for the outlines
    pub coords: Vec<i16>,
}

pub struct Fonts {
    pub files: Vec<FontFile>,
    /// the faces of variable fonts at other coordinates than the default
    pub instances: Vec<Instance>,
    pub fcx: FontContext,
    pub lcx: LayoutContext<Ink>,
    /// the families text is set in, in order, with the fallbacks added for
    /// what they lack; and the same for code
    pub stack: Vec<String>,
    pub mono_stack: Vec<String>,
}

/// reads the faces of a font file: their units per em and underlines
fn faces_of(fcx: &mut FontContext, bytes: Vec<u8>, family: &str) -> Vec<FontFile> {
    let data = Arc::new(bytes);
    let blob = Blob::new(data.clone());
    let families = fcx.collection.register_fonts(blob.clone(), None);
    // a family named with spaces around it, e.g. "Mitra " in its file, is
    // also found by the name without them, as fontconfig gives it
    if let [(id, _)] = families.as_slice() {
        let name = fcx.collection.family_name(*id).map(str::to_string);
        if let Some(name) = name.filter(|name| name.trim() != name) {
            let trimmed = FontInfoOverride {
                family_name: Some(name.trim()),
                ..Default::default()
            };
            fcx.collection.register_fonts(blob.clone(), Some(trimmed));
        }
    }
    let count = match skrifa::raw::FileRef::new(&data) {
        Ok(skrifa::raw::FileRef::Collection(collection)) => collection.len(),
        _ => 1,
    };
    (0..count)
        .map(|index| face_of(data.clone(), blob.clone(), family, index))
        .collect()
}

fn face_of(data: Arc<Vec<u8>>, blob: Blob<u8>, family: &str, index: u32) -> FontFile {
    let (upem, underline) = match FontRef::from_index(&data, index) {
        Ok(font) => {
            // what the spec allows, else what most fonts have
            let upem = font
                .head()
                .map(|head| head.units_per_em())
                .ok()
                .filter(|upem| (16..=16384).contains(upem))
                .unwrap_or(1000) as f32;
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
        family: family.to_string(),
        index,
        upem,
        underline,
    }
}

/// the font files laid one after the other in `bytes`, by their lengths;
/// an error if the lengths reach past the bytes
pub fn split_files(bytes: &[u8], lengths: &[u32]) -> Result<Vec<Vec<u8>>, String> {
    let mut files = vec![];
    let mut start = 0usize;
    for length in lengths {
        let end = start
            .checked_add(*length as usize)
            .filter(|end| *end <= bytes.len())
            .ok_or_else(|| {
                format!(
                    "the font lengths add up to more than the {} bytes given",
                    bytes.len()
                )
            })?;
        files.push(bytes[start..end].to_vec());
        start = end;
    }
    Ok(files)
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
            .flat_map(|bytes| faces_of(&mut fcx, bytes, ""))
            .collect();
        Fonts {
            files,
            instances: vec![],
            fcx,
            lcx: LayoutContext::new(),
            stack: FONT_STACK.iter().map(|family| family.to_string()).collect(),
            mono_stack: MONO_STACK.iter().map(|family| family.to_string()).collect(),
        }
    }

    /// adds a font for what the others lack, e.g. a system font for Chinese
    /// or an emoji font, as the last fallback of text and code
    pub fn add(&mut self, bytes: Vec<u8>, family: &str) {
        let faces = faces_of(&mut self.fcx, bytes, family);
        self.files.extend(faces);
        // a name of the list as it is, whatever it holds: quotes and commas
        // are part of it
        if !self.stack.iter().any(|known| known == family) {
            self.stack.push(family.to_string());
            self.mono_stack.push(family.to_string());
        }
    }

    /// the font index of a run's font at its coordinates: its face, or an
    /// instance of it when a variable font is set at other coordinates
    pub fn font_of(
        &mut self,
        font: &FontData,
        variations: &[([u8; 4], f32)],
        coords: &[i16],
    ) -> usize {
        let file = self.index_of(font);
        if coords.iter().all(|coord| *coord == 0) {
            return file;
        }
        let known = self
            .instances
            .iter()
            .position(|instance| instance.file == file && instance.coords == coords);
        let index = known.unwrap_or_else(|| {
            self.instances.push(Instance {
                file,
                variations: variations.to_vec(),
                coords: coords.to_vec(),
            });
            self.instances.len() - 1
        });
        INSTANCE_BASE + index
    }

    /// the face of a font index and its normalized coordinates (none for
    /// the default)
    pub fn face(&self, font: usize) -> Option<(&FontFile, &[i16])> {
        match font.checked_sub(INSTANCE_BASE) {
            Some(index) => {
                let instance = self.instances.get(index)?;
                Some((self.files.get(instance.file)?, &instance.coords))
            }
            None => Some((self.files.get(font)?, &[])),
        }
    }

    /// the index of the file a run's font comes from
    pub fn index_of(&self, font: &FontData) -> usize {
        let id = font.data.id();
        self.files
            .iter()
            .position(|file| file.blob.id() == id && file.index == font.index)
            .unwrap_or(0)
    }

    /// the same fonts for another engine, without a copy of their files:
    /// the files are shared, only what lays text out is its own
    pub fn share(&self) -> Fonts {
        let mut fcx = FontContext {
            collection: Collection::new(CollectionOptions {
                shared: false,
                system_fonts: false,
            }),
            source_cache: SourceCache::default(),
        };
        for (index, file) in self.files.iter().enumerate() {
            // a collection's faces are one file
            let first = self.files[..index]
                .iter()
                .all(|other| other.blob.id() != file.blob.id());
            if first {
                fcx.collection.register_fonts(file.blob.clone(), None);
            }
        }
        Fonts {
            files: self.files.clone(),
            instances: self.instances.clone(),
            fcx,
            lcx: LayoutContext::new(),
            stack: self.stack.clone(),
            mono_stack: self.mono_stack.clone(),
        }
    }

    /// the font files, each once, with the family each fallback was added
    /// for (empty for the fonts the engine was made with), in the order
    /// they came: what makes the same fonts in another instance
    pub fn sources(&self) -> Vec<(&Arc<Vec<u8>>, &str)> {
        let mut sources: Vec<(&Arc<Vec<u8>>, &str)> = vec![];
        for file in &self.files {
            if !sources
                .iter()
                .any(|(data, _)| Arc::ptr_eq(data, &file.data))
            {
                sources.push((&file.data, &file.family));
            }
        }
        sources
    }

    /// the outline of a glyph as an SVG path, in font units with y up
    pub fn glyph_path(&self, font: usize, glyph: u32) -> String {
        let mut pen = SvgPen(String::new());
        if let Some((file, coords)) = self.face(font) {
            if let Ok(font) = FontRef::from_index(&file.data, file.index) {
                if let Some(outline) = font.outline_glyphs().get(GlyphId::new(glyph)) {
                    // at the instance's coordinates, e.g. the bold of a
                    // variable font
                    let coords: Vec<skrifa::instance::NormalizedCoord> = coords
                        .iter()
                        .map(|coord| skrifa::raw::types::F2Dot14::from_bits(*coord))
                        .collect();
                    let location = LocationRef::new(&coords);
                    let settings = DrawSettings::unhinted(Size::unscaled(), location);
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
pub const FONT_STACK: [&str; 2] = ["IBM Plex Sans", "DejaVu Sans"];
pub const MONO_STACK: [&str; 3] = ["IBM Plex Mono", "IBM Plex Sans", "DejaVu Sans"];

/// a list of families for Parley, each by its name: no CSS to parse, so
/// any name works, quotes and commas in it included
pub fn family_list(names: &[String]) -> parley::FontFamily<'static> {
    parley::FontFamily::List(
        names
            .iter()
            .map(|name| parley::FontFamilyName::Named(name.clone().into()))
            .collect::<Vec<_>>()
            .into(),
    )
}

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn splits_font_files_by_their_lengths() {
        let bytes = [1, 2, 3, 4, 5];
        assert_eq!(
            split_files(&bytes, &[2, 3]).unwrap(),
            vec![vec![1, 2], vec![3, 4, 5]]
        );
        assert_eq!(split_files(&bytes, &[]).unwrap(), Vec::<Vec<u8>>::new());
        // lengths past the end, or adding up past what a usize holds
        assert!(split_files(&bytes, &[2, 4]).is_err());
        assert!(split_files(&bytes, &[u32::MAX, u32::MAX]).is_err());
        assert!(split_files(&[], &[1]).is_err());
    }

    #[test]
    fn takes_any_family_name() {
        use crate::model::Text;
        use crate::text::TextBox;
        let read = |name: &str| {
            std::fs::read(format!("{}/../../fonts/{name}", env!("CARGO_MANIFEST_DIR"))).unwrap()
        };
        let mut fonts = repository_fonts();
        // a family whose name starts with a quote, then the emoji font: as
        // CSS, the unterminated string would end the list there, and the
        // emoji would be lost
        let family = "\"Quoted, and with a comma";
        fonts.add(read("dejavu-sans-bold.ttf"), family);
        fonts.add(read("NotoEmoji-VariableFont_wght.ttf"), "Noto Emoji");
        assert_eq!(fonts.stack[FONT_STACK.len()], family);
        assert_eq!(fonts.stack.len(), FONT_STACK.len() + 2);
        let text = Text {
            pos: 1,
            text: "a \u{21d2} \u{1f980}".into(),
            ..Default::default()
        };
        let boxed = TextBox::new(&mut fonts, &text, 300.0, parley::Alignment::Start);
        assert!(boxed.missing.is_empty(), "{:?}", boxed.missing);
        let used: Vec<usize> = boxed
            .glyph_runs(&fonts, 0)
            .iter()
            .map(|run| run.font)
            .collect();
        // Plex, DejaVu Sans for the arrow, and Noto Emoji for the crab
        let emoji = fonts.files.len() - 1;
        assert!(
            used.contains(&0) && used.contains(&6) && used.contains(&emoji),
            "{used:?}"
        );
        // and the same name again is added once
        fonts.add(read("dejavu-sans-bold.ttf"), family);
        assert_eq!(fonts.stack.len(), FONT_STACK.len() + 2);
    }

    #[test]
    fn finds_a_family_named_with_a_space_after_it() {
        // Mitra (fonts-beng-extra) names its family "Mitra " in its file,
        // and fontconfig, which the app asks, gives "Mitra"
        let Ok(bytes) = std::fs::read("/usr/share/fonts/truetype/fonts-beng-extra/MitraMono.ttf")
        else {
            eprintln!("no Mitra, skipping the check");
            return;
        };
        use crate::model::Text;
        use crate::text::TextBox;
        let mut fonts = repository_fonts();
        fonts.add(bytes, "Mitra");
        let mitra = fonts.files.len() - 1;
        let text = Text {
            pos: 1,
            text: "\u{995}\u{996}".into(),
            ..Default::default()
        };
        let boxed = TextBox::new(&mut fonts, &text, 300.0, parley::Alignment::Start);
        assert!(boxed.missing.is_empty(), "{:?}", boxed.missing);
        let used: Vec<usize> = boxed
            .glyph_runs(&fonts, 0)
            .iter()
            .map(|run| run.font)
            .collect();
        assert_eq!(used, [mitra]);
    }
}

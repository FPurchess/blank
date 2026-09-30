//! The system's fonts for what Blank's own fonts lack, e.g. Chinese, Japanese
//! or Korean: the layout engine (src/engine/fallback.ts) asks for the
//! characters it couldn't show, and lays them out, on the screen and in the
//! PDF alike, with the fonts found here. The PDF embeds a subset of each, so
//! only fonts whose licence allows that are used (see `embeddable`).

use std::collections::BTreeMap;
use std::sync::Mutex;

use fontique::{
    Collection, CollectionOptions, FamilyId, FamilyInfo, FontInfo, FontStyle, FontWeight, Script,
    SourceKind,
};
use read_fonts::{types::Tag, FontRef, TableProvider};
use serde::Serialize;
use unicode_script::UnicodeScript;

/// a font file of the system, and the family the engine asks for
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct FallbackFont {
    pub family: String,
    pub path: String,
}

#[derive(Default)]
pub struct FontState {
    collection: Mutex<Option<Collection>>,
}

/// the scripts of `text` that aren't common to all, like punctuation
fn scripts(text: &str) -> Vec<String> {
    let mut found: Vec<String> = vec![];
    for char in text.chars() {
        let script = char.script();
        let name = script.short_name();
        if matches!(name, "Zyyy" | "Zinh" | "Zzzz") {
            continue;
        }
        if !found.iter().any(|known| known == name) {
            found.push(name.to_string());
        }
    }
    found
}

/// the fallback families fontique tries for a script, at most this many
const MAX_FAMILIES: usize = 16;

// OS/2 fsType: the licence's embedding permissions
const USAGE_PERMISSIONS: u16 = 0x000F;
const RESTRICTED_LICENSE: u16 = 0x0002;
const NO_SUBSETTING: u16 = 0x0100;
const BITMAP_ONLY: u16 = 0x0200;

/// whether the PDF may embed the font at `index` of a font file: its licence
/// (OS/2 fsType) allows embedding a subset of its outlines, and it has
/// outlines, which a PDF can't do without
fn embeddable(data: &[u8], index: u32) -> bool {
    let Ok(font) = FontRef::from_index(data, index) else {
        return false;
    };
    // fonts without an OS/2 table, like some older Apple ones, are
    // installable
    if let Ok(os2) = font.os2() {
        let fs_type = os2.fs_type();
        if fs_type & USAGE_PERMISSIONS == RESTRICTED_LICENSE
            || fs_type & (NO_SUBSETTING | BITMAP_ONLY) != 0
        {
            return false;
        }
    }
    let has = |tag: &[u8; 4]| font.table_data(Tag::new(tag)).is_some();
    (has(b"glyf") && has(b"loca")) || has(b"CFF ") || has(b"CFF2")
}

/// the file of a font, if it is one the PDF may embed
fn embeddable_file(font: &FontInfo) -> Option<String> {
    let SourceKind::Path(path) = &font.source().kind else {
        return None;
    };
    let blob = font.load(None)?;
    embeddable(blob.data(), font.index()).then(|| path.to_string_lossy().to_string())
}

/// the regular and bold fonts of a family, if its regular one may be embedded
fn faces_of(family: &FamilyInfo) -> Vec<FallbackFont> {
    let mut paths = BTreeMap::new();
    for weight in [FontWeight::NORMAL, FontWeight::BOLD] {
        let Some(font) = family.match_font(Default::default(), FontStyle::Normal, weight, true)
        else {
            continue;
        };
        match embeddable_file(font) {
            Some(path) => {
                paths.insert(path, ());
            }
            // without a regular font the family is of no use
            None if weight == FontWeight::NORMAL => return vec![],
            None => {}
        }
    }
    paths
        .into_keys()
        .map(|path| FallbackFont {
            family: family.name().to_string(),
            path,
        })
        .collect()
}

/// the regular and bold fonts of the first family the system falls back to
/// for a script that may be embedded, in `language`, e.g. "zh", which picks
/// the Chinese forms of Han characters rather than the Japanese ones
fn fonts_for(collection: &mut Collection, script: &str, language: &str) -> Vec<FallbackFont> {
    let script = Script::from_str_unchecked(script);
    let mut ids: Vec<FamilyId> = vec![];
    if !language.is_empty() {
        ids.extend(collection.fallback_families((script, language)));
    }
    for id in collection.fallback_families(script) {
        if !ids.contains(&id) {
            ids.push(id);
        }
    }
    for id in ids.into_iter().take(MAX_FAMILIES) {
        let Some(family) = collection.family(id) else {
            continue;
        };
        let fonts = faces_of(&family);
        if !fonts.is_empty() {
            return fonts;
        }
    }
    vec![]
}

/// the system's fonts for the scripts of `text`, in the document's
/// `language`
#[tauri::command]
pub fn fallback_fonts(
    state: tauri::State<'_, FontState>,
    text: String,
    language: String,
) -> Vec<FallbackFont> {
    let mut collection = state.collection.lock().unwrap();
    let collection = collection.get_or_insert_with(|| {
        Collection::new(CollectionOptions {
            shared: false,
            system_fonts: true,
        })
    });
    let mut fonts: Vec<FallbackFont> = vec![];
    for script in scripts(&text) {
        for font in fonts_for(collection, &script, &language) {
            if !fonts.contains(&font) {
                fonts.push(font);
            }
        }
    }
    fonts
}

#[cfg(test)]
mod tests {
    use super::*;

    /// a font file of `tables`, sorted by tag, as the directory needs them
    fn sfnt(tables: &[(&[u8; 4], Vec<u8>)]) -> Vec<u8> {
        let mut tables = tables.to_vec();
        tables.sort_by_key(|(tag, _)| **tag);
        let mut data = vec![];
        data.extend(0x0001_0000u32.to_be_bytes());
        data.extend((tables.len() as u16).to_be_bytes());
        data.extend([0; 6]); // searchRange, entrySelector, rangeShift
        let mut offset = 12 + 16 * tables.len();
        for (tag, table) in &tables {
            data.extend(*tag);
            data.extend(0u32.to_be_bytes()); // checksum
            data.extend((offset as u32).to_be_bytes());
            data.extend((table.len() as u32).to_be_bytes());
            offset += table.len();
        }
        for (_, table) in &tables {
            data.extend(table);
        }
        data
    }

    /// an OS/2 table of version 0 with `fs_type`
    fn os2(fs_type: u16) -> Vec<u8> {
        let mut table = vec![0; 78];
        table[8..10].copy_from_slice(&fs_type.to_be_bytes());
        table
    }

    fn truetype(fs_type: u16) -> Vec<u8> {
        sfnt(&[
            (b"OS/2", os2(fs_type)),
            (b"glyf", vec![0; 4]),
            (b"loca", vec![0; 4]),
        ])
    }

    #[test]
    fn embeds_installable_and_editable_fonts() {
        assert!(embeddable(&truetype(0x0000), 0));
        assert!(embeddable(&truetype(0x0008), 0));
        // preview & print, with CFF outlines
        assert!(embeddable(
            &sfnt(&[(b"OS/2", os2(0x0004)), (b"CFF ", vec![0; 4])]),
            0
        ));
        assert!(embeddable(&sfnt(&[(b"CFF2", vec![0; 4])]), 0), "no OS/2");
    }

    #[test]
    fn skips_fonts_whose_licence_forbids_embedding_a_subset() {
        assert!(!embeddable(&truetype(0x0002), 0), "restricted license");
        assert!(!embeddable(&truetype(0x0100 | 0x0008), 0), "no subsetting");
        assert!(!embeddable(&truetype(0x0200), 0), "bitmap embedding only");
    }

    #[test]
    fn skips_fonts_without_outlines() {
        assert!(!embeddable(&sfnt(&[(b"OS/2", os2(0))]), 0));
        // glyf without loca can't be read
        assert!(!embeddable(
            &sfnt(&[(b"OS/2", os2(0)), (b"glyf", vec![0; 4])]),
            0
        ));
        assert!(!embeddable(b"not a font", 0));
        assert!(!embeddable(&truetype(0), 1), "no such font in the file");
    }

    #[test]
    fn embeds_blanks_own_fonts() {
        let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../fonts");
        let mut count = 0;
        for entry in std::fs::read_dir(dir).unwrap() {
            let path = entry.unwrap().path();
            if path.extension().is_some_and(|ext| ext == "ttf") {
                assert!(embeddable(&std::fs::read(&path).unwrap(), 0), "{path:?}");
                count += 1;
            }
        }
        assert!(count > 10);
    }

    #[test]
    fn finds_the_scripts_of_a_text() {
        assert_eq!(
            scripts("abc, 中文 かな 한글!"),
            ["Latn", "Hani", "Hira", "Hang"]
        );
        assert!(scripts("1, 2; 3.").is_empty());
    }

    #[test]
    fn finds_system_fonts_for_a_script() {
        let mut collection = Collection::new(CollectionOptions {
            shared: false,
            system_fonts: true,
        });
        // whatever the system has for Chinese, if anything
        let fonts = fonts_for(&mut collection, "Hani", "zh");
        for font in &fonts {
            assert!(std::path::Path::new(&font.path).exists(), "{font:?}");
            assert!(!font.family.is_empty());
        }
        println!("Hani: {fonts:?}");
    }
}

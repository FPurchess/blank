//! The system's fonts for what Blank's own fonts lack, e.g. Chinese, Japanese
//! or Korean: the layout engine (src/engine/fallback.ts) asks for the
//! characters it couldn't show, and lays them out, on the screen and in the
//! PDF alike, with the fonts found here. The PDF embeds a subset of each, so
//! only fonts whose licence allows that are used (see `embeddable`).

use std::collections::BTreeMap;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use fontique::{
    Collection, CollectionOptions, FamilyId, FamilyInfo, FontInfo, FontStyle, FontWeight,
    GenericFamily, Script, SourceKind,
};
use read_fonts::{types::Tag, FontRef, TableProvider};
use serde::Serialize;
use tauri::State;
use unicode_script::UnicodeScript;

/// a font file of the system, and the family the engine asks for
#[derive(Serialize, Debug, Clone, PartialEq)]
pub struct FallbackFont {
    pub family: String,
    pub path: String,
}

/// the system's fonts, found once: that reads every font file of the system,
/// which takes seconds where there are many
pub type Fonts = Arc<Mutex<Option<Collection>>>;

#[derive(Default)]
pub struct FontState {
    pub collection: Fonts,
}

/// the most of the text looked up at once, in bytes, and of a language tag
const MAX_TEXT: usize = 64 * 1024;
const MAX_LANGUAGE: usize = 35;
/// the most characters of no script in particular looked up at once
const MAX_COMMON: usize = 256;

/// the scripts no font family is chosen for: common to all (punctuation,
/// symbols), inherited (combining marks) and unknown
fn is_common(char: char) -> bool {
    matches!(char.script().short_name(), "Zyyy" | "Zinh" | "Zzzz")
}

/// the collection, found if it wasn't yet. A lookup that panicked leaves it
/// as it was, so it stays usable
fn collection_of(fonts: &Mutex<Option<Collection>>) -> MutexGuard<'_, Option<Collection>> {
    let mut collection = fonts.lock().unwrap_or_else(PoisonError::into_inner);
    collection.get_or_insert_with(|| {
        Collection::new(CollectionOptions {
            shared: false,
            system_fonts: true,
        })
    });
    collection
}

/// finds the system's fonts ahead of the first lookup, e.g. at start-up
pub fn warm(fonts: &Mutex<Option<Collection>>) {
    drop(collection_of(fonts));
}

/// `text` cut to at most MAX_TEXT bytes, on a character boundary
fn capped(text: &str) -> &str {
    let mut end = text.len().min(MAX_TEXT);
    while !text.is_char_boundary(end) {
        end -= 1;
    }
    &text[..end]
}

/// `language` if it looks like a language tag, like "zh" or "zh-Hant-TW"
fn language_tag(language: &str) -> &str {
    let valid = language.len() <= MAX_LANGUAGE
        && language
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-');
    if valid {
        language
    } else {
        ""
    }
}

/// the scripts of `text` that aren't common to all, like punctuation
fn scripts(text: &str) -> Vec<String> {
    let mut found: Vec<String> = vec![];
    for char in text.chars() {
        if is_common(char) {
            continue;
        }
        let name = char.script().short_name();
        if !found.iter().any(|known| known == name) {
            found.push(name.to_string());
        }
    }
    found
}

/// the characters of `text` of no script in particular, like mathematical
/// letters (𝐀) or arrows, which have no fallback family, so they are looked
/// up by the fonts that have them
fn common(text: &str) -> Vec<char> {
    let mut found: Vec<char> = vec![];
    for char in text.chars() {
        if is_common(char)
            && !char.is_whitespace()
            && !char.is_control()
            && !is_private_use(char)
            && !found.contains(&char)
        {
            found.push(char);
            if found.len() == MAX_COMMON {
                break;
            }
        }
    }
    found
}

/// private use characters mean something only in the font they came with,
/// so another font that has one shows something else
fn is_private_use(char: char) -> bool {
    matches!(char, '\u{E000}'..='\u{F8FF}' | '\u{F0000}'..)
}

/// the regular and bold fonts of the families that have `chars`, the ones
/// for maths and sans-serif text first, then the others by name
fn fonts_covering(collection: &mut Collection, chars: &[char]) -> Vec<FallbackFont> {
    let mut ids: Vec<FamilyId> = collection.generic_families(GenericFamily::Math).collect();
    ids.extend(collection.generic_families(GenericFamily::SansSerif));
    let mut names: Vec<String> = collection.family_names().map(str::to_string).collect();
    names.sort();
    for name in names {
        if let Some(id) = collection.family_id(&name) {
            if !ids.contains(&id) {
                ids.push(id);
            }
        }
    }
    let mut left = chars.to_vec();
    let mut found: Vec<FallbackFont> = vec![];
    for id in ids {
        if left.is_empty() {
            break;
        }
        let Some(family) = collection.family(id) else {
            continue;
        };
        let Some(regular) = family.match_font(
            Default::default(),
            FontStyle::Normal,
            FontWeight::NORMAL,
            true,
        ) else {
            continue;
        };
        let Some(blob) = regular.load(None) else {
            continue;
        };
        let Some(charmap) = regular.charmap_index().charmap(blob.data()) else {
            continue;
        };
        let has = |char: &char| charmap.map(*char).is_some_and(|glyph| glyph != 0);
        if !left.iter().any(has) {
            continue;
        }
        let fonts = faces_of(&family);
        if fonts.is_empty() {
            continue;
        }
        left.retain(|char| !has(char));
        for font in fonts {
            if !found.contains(&font) {
                found.push(font);
            }
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
/// `language`, and for its characters of no script in particular
pub fn lookup(fonts: &Mutex<Option<Collection>>, text: &str, language: &str) -> Vec<FallbackFont> {
    let (text, language) = (capped(text), language_tag(language));
    let mut collection = collection_of(fonts);
    let Some(collection) = collection.as_mut() else {
        return vec![];
    };
    let mut found: Vec<FallbackFont> = vec![];
    let mut fonts = vec![];
    for script in scripts(text) {
        fonts.extend(fonts_for(collection, &script, language));
    }
    let common = common(text);
    if !common.is_empty() {
        fonts.extend(fonts_covering(collection, &common));
    }
    for font in fonts {
        if !found.contains(&font) {
            found.push(font);
        }
    }
    found
}

/// the system's fonts for the scripts of `text`, looked up on a thread of
/// its own: the first lookup finds all of the system's fonts, which would
/// freeze the window on the main thread
#[tauri::command]
pub async fn fallback_fonts(
    state: State<'_, FontState>,
    text: String,
    language: String,
) -> Result<Vec<FallbackFont>, String> {
    let fonts = state.collection.clone();
    tauri::async_runtime::spawn_blocking(move || lookup(&fonts, &text, &language))
        .await
        .map_err(|error| error.to_string())
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
    fn finds_the_characters_of_no_script() {
        assert!(scripts("𝐀").is_empty());
        assert_eq!(common("a𝐀 ,𝐀\n中"), ['𝐀', ',']);
        assert_eq!(common(&"⇒".repeat(1000)), ['⇒']);
        assert!(common("\u{E000}\u{F8FF}\u{F0000}\u{10FFFD}").is_empty());
    }

    /// Blank's own fonts, as if they were the system's
    fn repository_fonts() -> Collection {
        let mut collection = Collection::new(CollectionOptions {
            shared: false,
            system_fonts: false,
        });
        collection.load_fonts_from_paths([concat!(env!("CARGO_MANIFEST_DIR"), "/../fonts")]);
        collection
    }

    #[test]
    fn finds_fonts_by_the_characters_they_have() {
        let mut collection = repository_fonts();
        // Plex lacks the arrow, DejaVu Sans has it
        let fonts = fonts_covering(&mut collection, &['⇒']);
        assert!(!fonts.is_empty());
        for font in &fonts {
            assert_eq!(font.family, "DejaVu Sans", "{font:?}");
        }
        assert!(fonts
            .iter()
            .any(|font| font.path.ends_with("dejavu-sans.ttf")));
        // an unassigned character none of them has
        assert!(fonts_covering(&mut collection, &['\u{0378}']).is_empty());
    }

    #[test]
    fn finds_system_fonts_for_mathematical_letters() {
        let fonts = lookup(&Fonts::default(), "𝐀", "");
        for font in &fonts {
            let data = std::fs::read(&font.path).unwrap();
            let file = read_fonts::FileRef::new(&data).unwrap();
            let has = file.fonts().any(|font| {
                font.ok()
                    .and_then(|font| font.cmap().ok())
                    .and_then(|cmap| cmap.map_codepoint('𝐀'))
                    .is_some()
            });
            assert!(has, "{font:?}");
        }
        println!("𝐀: {fonts:?}");
    }

    #[test]
    fn looks_up_from_two_threads_at_once() {
        let fonts = Fonts::default();
        let threads: Vec<_> = (0..2)
            .map(|_| {
                let fonts = fonts.clone();
                std::thread::spawn(move || lookup(&fonts, "中文", "zh"))
            })
            .collect();
        let found: Vec<_> = threads.into_iter().map(|t| t.join().unwrap()).collect();
        assert_eq!(found[0], found[1]);
    }

    #[test]
    fn looks_up_after_a_lookup_panicked() {
        let fonts = Fonts::default();
        warm(&fonts);
        let poisoned = fonts.clone();
        let result = std::thread::spawn(move || {
            let _collection = poisoned.lock().unwrap();
            panic!("a lookup that panics");
        })
        .join();
        assert!(result.is_err());
        assert!(fonts.is_poisoned());
        let found = lookup(&fonts, "中文", "zh");
        assert_eq!(found, lookup(&fonts, "中文", "zh"));
        assert!(fonts
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .is_some());
    }

    #[test]
    fn caps_the_text_on_a_character_boundary() {
        // "中" takes 3 bytes, so MAX_TEXT falls inside one
        let text = "中".repeat(MAX_TEXT);
        let cut = capped(&text);
        assert!(cut.len() <= MAX_TEXT && cut.len() > MAX_TEXT - 3);
        assert!(cut.chars().all(|c| c == '中'));
        assert_eq!(capped("abc"), "abc");
        assert!(lookup(&Fonts::default(), &text, "zh").len() <= 2);
    }

    #[test]
    fn ignores_what_isnt_a_language_tag() {
        assert_eq!(language_tag("zh-Hant-TW"), "zh-Hant-TW");
        assert_eq!(language_tag(""), "");
        assert_eq!(language_tag("zh; rm -rf"), "");
        assert_eq!(language_tag(&"a".repeat(MAX_LANGUAGE + 1)), "");
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

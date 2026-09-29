//! The system's fonts for what Blank's own fonts lack, e.g. Chinese, Japanese
//! or Korean: the layout engine (src/engine/fallback.ts) asks for the
//! characters it couldn't show, and lays them out, on the screen and in the
//! PDF alike, with the fonts found here.

use std::collections::BTreeMap;
use std::sync::Mutex;

use fontique::{Collection, CollectionOptions, FontStyle, FontWeight, Script, SourceKind};
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

/// the regular and bold fonts of the family the system falls back to for a
/// script
/// in `language`, e.g. "zh", which picks the Chinese forms of Han
/// characters rather than the Japanese ones
fn fonts_for(collection: &mut Collection, script: &str, language: &str) -> Vec<FallbackFont> {
    let script = Script::from_str_unchecked(script);
    let found = if language.is_empty() {
        collection.fallback_families(script).next()
    } else {
        collection.fallback_families((script, language)).next()
    };
    let Some(id) = found.or_else(|| collection.fallback_families(script).next()) else {
        return vec![];
    };
    let Some(family) = collection.family(id) else {
        return vec![];
    };
    let mut paths = BTreeMap::new();
    for weight in [FontWeight::NORMAL, FontWeight::BOLD] {
        let Some(font) = family.match_font(Default::default(), FontStyle::Normal, weight, true)
        else {
            continue;
        };
        if let SourceKind::Path(path) = &font.source().kind {
            paths.insert(path.to_string_lossy().to_string(), ());
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

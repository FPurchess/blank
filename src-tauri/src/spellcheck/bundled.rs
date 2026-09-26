//! The dictionaries built into the app, see `bundled` in the catalog.

/// get returns the .aff and .dic content of the bundled dictionary for `tag`
pub fn get(tag: &str) -> Option<(&'static str, &'static str)> {
    macro_rules! dictionary {
        ($tag:literal) => {
            Some((
                include_str!(concat!("../../dictionaries/", $tag, "/index.aff")),
                include_str!(concat!("../../dictionaries/", $tag, "/index.dic")),
            ))
        };
    }
    match tag {
        "de" => dictionary!("de"),
        "en" => dictionary!("en"),
        "es" => dictionary!("es"),
        "fr" => dictionary!("fr"),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use sha2::{Digest, Sha256};

    use super::*;
    use crate::spellcheck::catalog::CATALOG;

    fn sha256(content: &str) -> String {
        Sha256::digest(content.as_bytes())
            .iter()
            .map(|byte| format!("{byte:02x}"))
            .collect()
    }

    #[test]
    fn matches_the_catalog() {
        for (tag, entry) in CATALOG.dictionaries.iter().filter(|(_, e)| e.bundled) {
            let (aff, dic) = get(tag).unwrap_or_else(|| panic!("{tag} isn't built in"));
            assert_eq!(sha256(aff), entry.files.aff.sha256, "{tag}/index.aff");
            assert_eq!(sha256(dic), entry.files.dic.sha256, "{tag}/index.dic");
        }
    }

    #[test]
    fn ships_a_license_for_each() {
        for tag in ["de", "en", "es", "fr"] {
            let path = format!("{}/dictionaries/{tag}/LICENSE", env!("CARGO_MANIFEST_DIR"));
            assert!(std::path::Path::new(&path).is_file(), "{path} is missing");
        }
    }
}

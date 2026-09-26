//! Loads every dictionary in a directory with spellbook and reports, as one
//! JSON line per dictionary, whether it loads and how long that takes. Used by
//! scripts/build-dictionary-catalog.ts to leave out dictionaries Blank can't
//! load.
//!
//! Usage: validate_dictionaries <dir>, where <dir>/<tag>/index.{aff,dic}

use std::{fs, panic, path::Path, time::Instant};

use blank_lib::spellcheck::dictionary;

fn validate(dir: &Path) -> Result<u128, String> {
    let aff = fs::read_to_string(dir.join("index.aff")).map_err(|e| e.to_string())?;
    let dic = fs::read_to_string(dir.join("index.dic")).map_err(|e| e.to_string())?;
    let start = Instant::now();
    let result = panic::catch_unwind(|| dictionary::parse(&aff, &dic).map(|_| ()));
    let elapsed = start.elapsed().as_millis();
    match result {
        Ok(Ok(())) => Ok(elapsed),
        Ok(Err(error)) => Err(error.to_string()),
        Err(_) => Err("panicked while loading".into()),
    }
}

fn main() {
    let root = std::env::args()
        .nth(1)
        .expect("usage: validate_dictionaries <dir>");
    panic::set_hook(Box::new(|_| {}));
    let mut entries: Vec<_> = fs::read_dir(&root)
        .expect("failed to read the directory")
        .filter_map(Result::ok)
        .filter(|entry| entry.path().is_dir())
        .collect();
    entries.sort_by_key(|entry| entry.file_name());

    for entry in entries {
        let tag = entry.file_name().to_string_lossy().to_string();
        let line = match validate(&entry.path()) {
            Ok(ms) => serde_json::json!({ "tag": tag, "loads": true, "loadMs": ms }),
            Err(error) => serde_json::json!({ "tag": tag, "loads": false, "error": error }),
        };
        println!("{line}");
    }
}

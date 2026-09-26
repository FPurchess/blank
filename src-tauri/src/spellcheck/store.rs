//! Downloaded dictionaries, kept in <app data>/dictionaries/<tag>/.

use std::{
    fs,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

pub const AFF: &str = "index.aff";
pub const DIC: &str = "index.dic";
const META: &str = "meta.json";

#[derive(Debug, Serialize, Deserialize, PartialEq)]
pub struct Meta {
    pub version: String,
}

pub fn dir(root: &Path, tag: &str) -> PathBuf {
    root.join(tag)
}

/// installed returns the version of the installed dictionary for `tag`
pub fn installed(root: &Path, tag: &str) -> Option<String> {
    let dir = dir(root, tag);
    if !dir.join(AFF).is_file() || !dir.join(DIC).is_file() {
        return None;
    }
    let meta: Meta = serde_json::from_str(&fs::read_to_string(dir.join(META)).ok()?).ok()?;
    Some(meta.version)
}

/// read returns the .aff and .dic content of the installed dictionary for `tag`
pub fn read(root: &Path, tag: &str) -> Result<(String, String), String> {
    let dir = dir(root, tag);
    let read =
        |name| fs::read_to_string(dir.join(name)).map_err(|error| format!("{name}: {error}"));
    Ok((read(AFF)?, read(DIC)?))
}

/// replace moves the verified files in `staging` into place as the dictionary
/// for `tag`. The old version is only removed once the new one is in place.
pub fn replace(root: &Path, tag: &str, staging: &Path, version: &str) -> std::io::Result<()> {
    let meta = serde_json::to_string(&Meta {
        version: version.into(),
    })?;
    fs::write(staging.join(META), meta)?;

    let target = dir(root, tag);
    let old = root.join(format!("{tag}.old"));
    let _ = fs::remove_dir_all(&old);
    if target.exists() {
        fs::rename(&target, &old)?;
    }
    if let Err(error) = fs::rename(staging, &target) {
        // put the old version back, so a failed update keeps working
        let _ = fs::rename(&old, &target);
        return Err(error);
    }
    let _ = fs::remove_dir_all(&old);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn stage(root: &Path, content: &str) -> PathBuf {
        let staging = root.join("staging");
        fs::create_dir_all(&staging).unwrap();
        fs::write(staging.join(AFF), content).unwrap();
        fs::write(staging.join(DIC), content).unwrap();
        staging
    }

    #[test]
    fn installs_and_updates() {
        let root = tempfile::tempdir().unwrap();
        assert_eq!(installed(root.path(), "de"), None);

        replace(root.path(), "de", &stage(root.path(), "v1"), "1.0.0").unwrap();
        assert_eq!(installed(root.path(), "de").as_deref(), Some("1.0.0"));
        assert_eq!(read(root.path(), "de").unwrap().0, "v1");

        replace(root.path(), "de", &stage(root.path(), "v2"), "2.0.0").unwrap();
        assert_eq!(installed(root.path(), "de").as_deref(), Some("2.0.0"));
        assert_eq!(read(root.path(), "de").unwrap().1, "v2");
        assert!(!root.path().join("de.old").exists());
    }

    #[test]
    fn ignores_incomplete_installs() {
        let root = tempfile::tempdir().unwrap();
        let dir = dir(root.path(), "de");
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join(AFF), "").unwrap();
        assert_eq!(installed(root.path(), "de"), None);
    }
}

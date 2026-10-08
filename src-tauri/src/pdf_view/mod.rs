//! The PDF tabs' side of the app: each tab's PDF helper (blank-pdf, started
//! through blank-pdf-ipc's Supervisor), the file it shows and its SHA-256.
//! The bytes stay in the helper's supervisor only while a helper runs; a
//! helper that was stopped, or crashed, gets the file read again, and the
//! file must still be the one the tab opened. See .claude/rules/pdf.md.

pub mod commands;

use std::collections::HashMap;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use blank_pdf_ipc::client::{HelperConfig, Source, Supervisor, Timeouts};
use sha2::{Digest, Sha256};

/// a helper unused this long is stopped, which isn't a failure
const IDLE: Duration = Duration::from_secs(120);
/// the most helpers that run at once; the least recently used stops
const MAX_LIVE: usize = 4;
/// the most MuPDF may allocate in a helper
const MEMORY_LIMIT_MB: u32 = 1536;

/// one PDF tab's helper and file
pub struct PdfTab {
    pub supervisor: Arc<Supervisor>,
    pub path: PathBuf,
    pub sha256: String,
}

#[derive(Default)]
pub struct PdfTabs {
    tabs: Mutex<HashMap<String, Arc<PdfTab>>>,
}

impl PdfTabs {
    fn tabs(&self) -> MutexGuard<'_, HashMap<String, Arc<PdfTab>>> {
        self.tabs.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn get(&self, tab: &str) -> Option<Arc<PdfTab>> {
        self.tabs().get(tab).cloned()
    }

    pub fn insert(&self, tab: String, pdf: PdfTab) {
        self.tabs().insert(tab, Arc::new(pdf));
    }

    pub fn remove(&self, tab: &str) {
        self.tabs().remove(tab);
    }

    /// stops the helpers unused for `IDLE`, and the least recently used
    /// past `MAX_LIVE` except `keep`'s
    pub fn stop_idle(&self, keep: Option<&str>, now: Instant) {
        let tabs: Vec<(String, Arc<PdfTab>)> = self
            .tabs()
            .iter()
            .map(|(id, tab)| (id.clone(), tab.clone()))
            .collect();
        let idle: Vec<(&str, Option<Instant>)> = tabs
            .iter()
            .map(|(id, tab)| (id.as_str(), tab.supervisor.idle_since()))
            .collect();
        for id in to_stop(&idle, keep, now) {
            if let Some((_, tab)) = tabs.iter().find(|(tab, _)| tab == id) {
                tab.supervisor.stop();
            }
        }
    }
}

/// which helpers to stop, of the tabs' `(id, last used if a helper runs)`
fn to_stop<'a>(
    tabs: &[(&'a str, Option<Instant>)],
    keep: Option<&str>,
    now: Instant,
) -> Vec<&'a str> {
    let mut live: Vec<(&str, Instant)> = tabs
        .iter()
        .filter_map(|&(id, since)| since.map(|since| (id, since)))
        .collect();
    live.sort_by_key(|&(_, since)| since);
    let over = live.len().saturating_sub(MAX_LIVE);
    live.iter()
        .enumerate()
        .filter(|&(index, &(id, since))| {
            Some(id) != keep && (index < over || now.saturating_duration_since(since) >= IDLE)
        })
        .map(|(_, &(id, _))| id)
        .collect()
}

/// the SHA-256 of `bytes`, in lower-case hex
pub fn sha256(bytes: &[u8]) -> String {
    hex::encode(Sha256::digest(bytes))
}

/// reads `path`, if it still holds the PDF of `expected` (its SHA-256)
pub fn read_checked(path: &Path, expected: &str) -> io::Result<Arc<[u8]>> {
    let bytes = std::fs::read(path)?;
    if sha256(&bytes) != expected {
        return Err(io::ErrorKind::InvalidData.into());
    }
    Ok(bytes.into())
}

/// the PDF's bytes for its helper: `first` for the first helper, which
/// were just read, then the file again, while it is the same
pub fn source(path: PathBuf, sha256: String, first: Arc<[u8]>) -> Source {
    let first = Mutex::new(Some(first));
    Box::new(
        move || match first.lock().unwrap_or_else(PoisonError::into_inner).take() {
            Some(bytes) => Ok(bytes),
            None => read_checked(&path, &sha256),
        },
    )
}

/// where the helper is: next to the app, where Tauri puts `externalBin` in
/// every package; in debug builds `BLANK_PDF_HELPER` may say otherwise
fn helper_path() -> io::Result<PathBuf> {
    if cfg!(debug_assertions) {
        if let Some(path) = std::env::var_os("BLANK_PDF_HELPER") {
            return Ok(path.into());
        }
    }
    let exe = std::env::current_exe()?;
    let dir = exe.parent().ok_or(io::ErrorKind::NotFound)?;
    Ok(dir.join(format!("blank-pdf{}", std::env::consts::EXE_SUFFIX)))
}

/// how the app starts a helper; its stderr goes nowhere in release builds,
/// since MuPDF's warnings may quote the PDF
pub fn helper_config() -> io::Result<HelperConfig> {
    Ok(HelperConfig {
        program: helper_path()?,
        args: vec!["--memory-limit-mb".into(), MEMORY_LIMIT_MB.to_string()],
        quiet: !cfg!(debug_assertions),
        timeouts: Timeouts::default(),
    })
}

/// stops idle helpers every half minute, for as long as the app runs
pub fn watch_idle(app: tauri::AppHandle) {
    use tauri::Manager;
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(30));
        app.state::<PdfTabs>().stop_idle(None, Instant::now());
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stops_what_is_idle_and_the_least_recently_used() {
        let now = Instant::now();
        let ago = |seconds| Some(now - Duration::from_secs(seconds));
        let tabs = [("a", ago(10)), ("b", ago(200)), ("c", None)];
        assert_eq!(to_stop(&tabs, None, now), ["b"]);
        assert!(to_stop(&tabs, Some("b"), now).is_empty());
        let many = [
            ("a", ago(5)),
            ("b", ago(1)),
            ("c", ago(4)),
            ("d", ago(3)),
            ("e", ago(2)),
            ("f", ago(6)),
        ];
        assert_eq!(to_stop(&many, None, now), ["f", "a"]);
        assert_eq!(to_stop(&many, Some("f"), now), ["a"]);
    }

    #[test]
    fn reads_the_file_again_only_while_it_is_the_same() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("a.pdf");
        std::fs::write(&path, b"%PDF-1.7 one").unwrap();
        let first: Arc<[u8]> = b"%PDF-1.7 one".to_vec().into();
        let read = source(path.clone(), sha256(&first), first.clone());
        assert_eq!(read().unwrap(), first, "the bytes read when it opened");
        assert_eq!(read().unwrap(), first, "the file again");
        std::fs::write(&path, b"%PDF-1.7 two").unwrap();
        assert_eq!(read().unwrap_err().kind(), io::ErrorKind::InvalidData);
        std::fs::remove_file(&path).unwrap();
        assert_eq!(read().unwrap_err().kind(), io::ErrorKind::NotFound);
    }
}

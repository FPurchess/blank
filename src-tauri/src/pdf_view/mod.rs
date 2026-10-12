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

use blank_pdf_ipc::client::{HelperConfig, PdfError, Source, Supervisor, Timeouts};
use blank_pdf_ipc::protocol::{ErrorKind, Fill};
use sha2::{Digest, Sha256};

use crate::signing::commands::SigningError;

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

    pub fn insert(&self, tab: String, pdf: Arc<PdfTab>) {
        self.tabs().insert(tab, pdf);
    }

    pub fn remove(&self, tab: &str) {
        self.tabs().remove(tab);
    }

    /// whether `tab` still shows `pdf`: not if it was closed, or opened
    /// again, while `pdf` opened
    pub fn holds(&self, tab: &str, pdf: &Arc<PdfTab>) -> bool {
        self.tabs()
            .get(tab)
            .is_some_and(|held| Arc::ptr_eq(held, pdf))
    }

    /// forgets `tab` if it still shows `pdf`
    pub fn remove_if(&self, tab: &str, pdf: &Arc<PdfTab>) {
        let mut tabs = self.tabs();
        if tabs.get(tab).is_some_and(|held| Arc::ptr_eq(held, pdf)) {
            tabs.remove(tab);
        }
    }

    /// stops the helpers unused for `IDLE`, and the least recently used
    /// past `MAX_LIVE` except `keep`'s. Never waits for a request: a helper
    /// in use is neither idle nor stopped (`Supervisor::idle_since`, `stop`)
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

/// the bytes to sign of tab `tab`'s PDF, the file at `path`, while it still
/// holds the PDF of `sha256` (else `FileChanged` or `FileMissing`): the file
/// as it is without `fills`, else the file with the fills appended as an
/// incremental update by the tab's helper (MuPDF writes R1, the signer then
/// appends R2). Waits for the helper: call it on a blocking thread
pub fn filled_bytes(
    tabs: &PdfTabs,
    tab: &str,
    path: &Path,
    sha256: &str,
    fills: &[Fill],
) -> Result<Vec<u8>, SigningError> {
    let bytes = read_checked(path, sha256).map_err(|error| {
        let problem = commands::read_problem(&error);
        log::warn!("PDF: read to fill in: {problem}");
        match problem {
            "changed" => SigningError::FileChanged,
            "missing" => SigningError::FileMissing,
            _ => SigningError::Failed("Blank can't read this PDF again".into()),
        }
    })?;
    if fills.is_empty() {
        return Ok(bytes.to_vec());
    }
    let pdf = tabs
        .get(tab)
        .ok_or_else(|| SigningError::Failed("This PDF isn't open any more".into()))?;
    // the tab opened another version of the file meanwhile
    if pdf.sha256 != sha256 {
        return Err(SigningError::FileChanged);
    }
    let saved = (|| {
        if pdf.supervisor.fills() != fills {
            pdf.supervisor.set_fills(fills.to_vec())?;
        }
        pdf.supervisor.save()
    })()
    .map_err(|error| {
        log::warn!("PDF: save the fills: {}", error.kind());
        SigningError::Failed(fill_refusal(error).into())
    })?;
    // what MuPDF wrote must leave the file as it is, and only add to it
    if !saved.starts_with(&bytes) {
        log::warn!("PDF: save the fills: not an update of the file");
        return Err(SigningError::Failed(
            fill_refusal(PdfError::Engine(ErrorKind::Engine)).into(),
        ));
    }
    Ok(saved)
}

/// why the fills couldn't be saved, in words for the user
fn fill_refusal(error: PdfError) -> &'static str {
    match error {
        PdfError::Engine(ErrorKind::Repaired) => {
            "Blank can't fill in this PDF: it's damaged, and only a repaired copy could be read"
        }
        PdfError::Engine(ErrorKind::Encrypted) => "Blank can't fill in an encrypted PDF",
        PdfError::Engine(ErrorKind::MissingGlyphs) => {
            "A field's font can't show some of the characters filled in"
        }
        _ => "Blank couldn't fill in this PDF",
    }
}

/// where the helper is: on Linux in `../lib/blank` beside the app's
/// directory, where the packages put it (`bundle.resources` of
/// `tauri.linux.conf.json`: `/usr/lib/blank` of the .deb, the .rpm and the
/// snap, `usr/lib/blank` in the AppImage), else next to the app, where Tauri
/// puts `externalBin` on macOS and Windows, and the resource in a build's
/// `target/` folder; in debug builds `BLANK_PDF_HELPER` may say otherwise
fn helper_path() -> io::Result<PathBuf> {
    if cfg!(debug_assertions) {
        if let Some(path) = std::env::var_os("BLANK_PDF_HELPER") {
            return Ok(path.into());
        }
    }
    let exe = std::env::current_exe()?;
    let dir = exe.parent().ok_or(io::ErrorKind::NotFound)?;
    let places = helper_places(dir);
    Ok(places
        .iter()
        .find(|path| path.is_file())
        .unwrap_or(&places[0])
        .clone())
}

/// where the helper may be, given the app's directory, in the order tried
fn helper_places(dir: &Path) -> Vec<PathBuf> {
    let name = format!("blank-pdf{}", std::env::consts::EXE_SUFFIX);
    let mut places = Vec::new();
    if cfg!(target_os = "linux") {
        if let Some(prefix) = dir.parent() {
            places.push(prefix.join("lib").join("blank").join(&name));
        }
    }
    places.push(dir.join(name));
    places
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
    fn looks_for_the_helper_where_the_packages_put_it() {
        let places = helper_places(Path::new("/usr/bin"));
        if cfg!(target_os = "linux") {
            assert_eq!(
                places,
                [
                    PathBuf::from("/usr/lib/blank/blank-pdf"),
                    PathBuf::from("/usr/bin/blank-pdf")
                ]
            );
        } else {
            let name = format!("blank-pdf{}", std::env::consts::EXE_SUFFIX);
            assert_eq!(places, [Path::new("/usr/bin").join(name)]);
        }
    }

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

    /// the helper `make pdf-helper` built, which the app's build needs
    fn built_helper() -> PathBuf {
        let dir = Path::new(env!("CARGO_MANIFEST_DIR")).join("binaries");
        std::fs::read_dir(&dir)
            .unwrap()
            .map(|entry| entry.unwrap().path())
            .find(|path| {
                let name = path.file_name().unwrap().to_string_lossy();
                name.starts_with("blank-pdf") && !name.ends_with(".stamp")
            })
            .expect("make pdf-helper")
    }

    #[test]
    fn gives_the_signer_the_file_with_its_fills_as_an_update() {
        use blank_pdf_ipc::protocol::FillValue;
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("form.pdf");
        let fixture = Path::new(env!("CARGO_MANIFEST_DIR")).join("pdf/fixtures/form.pdf");
        std::fs::copy(fixture, &path).unwrap();
        let original: Arc<[u8]> = std::fs::read(&path).unwrap().into();
        let sha = sha256(&original);
        let config = HelperConfig {
            program: built_helper(),
            args: vec!["--memory-limit-mb".into(), "256".into()],
            quiet: true,
            timeouts: Timeouts::default(),
        };
        let supervisor =
            Supervisor::new(config, source(path.clone(), sha.clone(), original.clone()));
        let tabs = PdfTabs::default();
        tabs.insert(
            "t".into(),
            Arc::new(PdfTab {
                supervisor: Arc::new(supervisor),
                path: path.clone(),
                sha256: sha.clone(),
            }),
        );
        let fills = [Fill {
            field: "name".into(),
            value: FillValue::Text("Ada".into()),
        }];

        let plain = filled_bytes(&tabs, "t", &path, &sha, &[]).unwrap();
        assert_eq!(plain, &original[..], "no fills: the file as it is");
        let filled = filled_bytes(&tabs, "t", &path, &sha, &fills).unwrap();
        assert!(filled.starts_with(&original) && filled.len() > original.len());
        assert_eq!(tabs.get("t").unwrap().supervisor.fills(), fills);
        assert!(matches!(
            filled_bytes(&tabs, "other", &path, &sha, &fills),
            Err(SigningError::Failed(_))
        ));
        let refused = [Fill {
            field: "name".into(),
            value: FillValue::Text("中文".into()),
        }];
        assert!(matches!(
            filled_bytes(&tabs, "t", &path, &sha, &refused),
            Err(SigningError::Failed(message)) if message.contains("font")
        ));

        std::fs::write(&path, b"%PDF-1.7 another").unwrap();
        assert!(matches!(
            filled_bytes(&tabs, "t", &path, &sha, &fills),
            Err(SigningError::FileChanged)
        ));
        std::fs::remove_file(&path).unwrap();
        assert!(matches!(
            filled_bytes(&tabs, "t", &path, &sha, &[]),
            Err(SigningError::FileMissing)
        ));
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

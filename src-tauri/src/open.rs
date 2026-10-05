//! Opening files from outside: the files Blank is started with, the ones a
//! second `blank file` or the file manager hands to the running Blank (the
//! single-instance plugin), and on macOS the ones Finder opens. They all
//! become tabs in the one window. Files that come before the webview listens
//! wait in `OpenQueue`, which the webview empties with `take_open_paths`
//! once it is ready (see src/editor/tabs.ts); later ones are sent as the
//! `open-paths` event.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, Runtime, State};
use tauri_plugin_cli::CliExt;

// the name of the bus Blank owns while it runs, from the AppStream ID
const DBUS_ID: &str = "io.github.fpurchess.blank";

/// dbus_id returns the bus name Blank runs as on Linux, which a second Blank
/// finds it by. Debug builds run as another one, so `tauri dev` and the E2E
/// tests never hand their files to an installed Blank, and each E2E spec,
/// which sets `BLANK_INSTANCE_ID`, runs as one of its own. (On macOS and
/// Windows the plugin names its socket and mutex after the app's identifier,
/// which debug builds share with an installed Blank.)
pub fn dbus_id() -> String {
    #[cfg(debug_assertions)]
    {
        let suffix = instance_suffix(std::env::var("BLANK_INSTANCE_ID").ok())
            .map(|id| format!(".e2e_{id}"))
            .unwrap_or_default();
        format!("{DBUS_ID}.debug{suffix}")
    }
    #[cfg(not(debug_assertions))]
    DBUS_ID.to_string()
}

/// instance_suffix accepts only what a bus name allows: up to 32 letters,
/// digits and underscores
#[cfg_attr(not(debug_assertions), allow(dead_code))]
fn instance_suffix(value: Option<String>) -> Option<String> {
    let value = value?;
    let valid = !value.is_empty()
        && value.len() <= 32
        && value.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
    if !valid {
        eprintln!("ignoring BLANK_INSTANCE_ID={value}, it must be 1 to 32 letters, digits or _");
    }
    valid.then_some(value)
}

/// single_instance tells whether Blank can run as the one instance: on Linux
/// only with a session bus, without which the plugin would crash. Without
/// it, a second Blank opens a window of its own, which doesn't remember its
/// tabs (see session.rs).
pub fn single_instance(session_bus: impl FnOnce() -> bool) -> bool {
    if cfg!(target_os = "linux") {
        session_bus()
    } else {
        true
    }
}

/// has_session_bus tells whether the session bus can be reached
pub fn has_session_bus() -> bool {
    #[cfg(target_os = "linux")]
    {
        zbus::blocking::Connection::session().is_ok()
    }
    #[cfg(not(target_os = "linux"))]
    true
}

/// paths_of returns the files of the CLI's `path` argument: one, several
/// (`multiple`) or none
pub fn paths_of(value: &serde_json::Value) -> Vec<String> {
    match value {
        serde_json::Value::String(path) => vec![path.clone()],
        serde_json::Value::Array(paths) => paths
            .iter()
            .filter_map(|path| path.as_str().map(str::to_string))
            .collect(),
        _ => Vec::new(),
    }
}

/// resolve makes `path` absolute against `cwd`, the directory it was given
/// in, e.g. the terminal's of a second `blank notes.md`
pub fn resolve(cwd: &Path, path: &str) -> PathBuf {
    let path = Path::new(path);
    if path.is_absolute() {
        path.to_path_buf()
    } else {
        cwd.join(path)
    }
}

// the files that came before the webview was ready
#[derive(Default)]
struct Queue {
    ready: bool,
    paths: Vec<String>,
}

impl Queue {
    /// push keeps `paths` for the webview, or returns them to send now once
    /// it is ready
    fn push(&mut self, paths: Vec<String>) -> Option<Vec<String>> {
        if self.ready {
            return Some(paths);
        }
        self.paths.extend(paths);
        None
    }

    /// take returns the files kept so far; later ones are sent
    fn take(&mut self) -> Vec<String> {
        self.ready = true;
        std::mem::take(&mut self.paths)
    }
}

#[derive(Default)]
pub struct OpenQueue(Mutex<Queue>);

/// deliver hands `paths` to the webview, or keeps them until it is ready
pub fn deliver<R: Runtime>(app: &AppHandle<R>, paths: Vec<String>) {
    if paths.is_empty() {
        return;
    }
    let send = app.state::<OpenQueue>().0.lock().unwrap().push(paths);
    if let Some(paths) = send {
        if let Err(error) = app.emit("open-paths", paths) {
            eprintln!("can't open the files: {error}");
        }
    }
}

/// focus_window brings the window to the front, e.g. after a file was
/// opened from elsewhere. On Wayland the window manager may only flash it.
pub fn focus_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

/// args_paths returns the files of a command line `argv`, with the program
/// as its first item, resolved against `cwd`
fn args_paths<R: Runtime>(app: &AppHandle<R>, argv: Vec<String>, cwd: &Path) -> Vec<String> {
    match app.cli().matches_from(argv) {
        Ok(matches) => matches
            .args
            .get("path")
            .map(|arg| paths_of(&arg.value))
            .unwrap_or_default()
            .iter()
            .map(|path| resolve(cwd, path).to_string_lossy().into_owned())
            .collect(),
        Err(error) => {
            eprintln!("ignoring the command line: {error}");
            Vec::new()
        }
    }
}

/// forwarded opens the files of a second Blank, started with `argv` in
/// `cwd`, which then exits. The plugin hands an empty `cwd` when it isn't
/// UTF-8, against which a relative path would name another file, so those
/// are left out.
pub fn forwarded<R: Runtime>(app: &AppHandle<R>, argv: Vec<String>, cwd: String) {
    let mut paths = args_paths(app, argv, Path::new(&cwd));
    if cwd.is_empty() {
        paths.retain(|path| Path::new(path).is_absolute());
    }
    deliver(app, paths);
    focus_window(app);
}

/// queue_own_args keeps the files Blank was started with for the webview.
/// A name that isn't UTF-8 comes along with its odd bytes replaced, rather
/// than crashing the start.
pub fn queue_own_args<R: Runtime>(app: &AppHandle<R>) {
    let cwd = std::env::current_dir().unwrap_or_default();
    let argv = std::env::args_os()
        .map(|arg| arg.to_string_lossy().into_owned())
        .collect();
    let paths = args_paths(app, argv, &cwd);
    deliver(app, paths);
}

/// take_open_paths returns the files that came before the webview was ready,
/// after which they are sent as the `open-paths` event
#[tauri::command]
pub fn take_open_paths(queue: State<'_, OpenQueue>) -> Vec<String> {
    queue.0.lock().unwrap().take()
}

/// canonical_path returns `path` absolute, with symbolic links followed, so
/// a file opened twice under two names gets one tab; the path as given when
/// it doesn't exist
#[tauri::command]
pub fn canonical_path(path: String) -> String {
    match std::fs::canonicalize(&path) {
        Ok(canonical) => without_verbatim(canonical.to_string_lossy().into_owned()),
        Err(_) => path,
    }
}

/// without_verbatim drops the `\\?\` that Windows puts before a canonical
/// path, which other paths don't have
fn without_verbatim(path: String) -> String {
    if let Some(rest) = path.strip_prefix(r"\\?\UNC\") {
        format!(r"\\{rest}")
    } else if let Some(rest) = path.strip_prefix(r"\\?\") {
        rest.to_string()
    } else {
        path
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_one_file_several_or_none() {
        assert_eq!(paths_of(&json!("a.md")), vec!["a.md"]);
        assert_eq!(paths_of(&json!(["a.md", "b.md"])), vec!["a.md", "b.md"]);
        assert!(paths_of(&json!(null)).is_empty());
    }

    #[test]
    fn resolves_paths_against_the_directory_they_were_given_in() {
        let cwd = Path::new("/home/me/docs");
        assert_eq!(
            resolve(cwd, "notes.md"),
            Path::new("/home/me/docs/notes.md")
        );
        assert_eq!(resolve(cwd, "./a.md"), Path::new("/home/me/docs/./a.md"));
        assert_eq!(resolve(cwd, "../a.md"), Path::new("/home/me/docs/../a.md"));
        #[cfg(unix)]
        assert_eq!(resolve(cwd, "/tmp/a.md"), Path::new("/tmp/a.md"));
    }

    #[test]
    fn keeps_files_until_the_webview_is_ready() {
        let mut queue = Queue::default();
        assert_eq!(queue.push(vec!["a.md".into()]), None);
        assert_eq!(queue.push(vec!["b.md".into()]), None);
        assert_eq!(queue.take(), vec!["a.md", "b.md"]);
        assert_eq!(queue.push(vec!["c.md".into()]), Some(vec!["c.md".into()]));
        assert!(queue.take().is_empty());
    }

    #[test]
    fn accepts_only_a_short_plain_instance_id() {
        assert_eq!(
            instance_suffix(Some("spec_1".into())),
            Some("spec_1".into())
        );
        assert_eq!(instance_suffix(None), None);
        assert_eq!(instance_suffix(Some(String::new())), None);
        assert_eq!(instance_suffix(Some("a.b".into())), None);
        assert_eq!(instance_suffix(Some("x".repeat(33))), None);
    }

    #[test]
    #[cfg(debug_assertions)]
    fn runs_as_another_instance_in_debug_builds() {
        assert!(dbus_id().starts_with("io.github.fpurchess.blank.debug"));
    }

    #[test]
    fn runs_as_one_instance_only_with_a_session_bus_on_linux() {
        assert!(single_instance(|| true));
        assert_eq!(single_instance(|| false), !cfg!(target_os = "linux"));
    }

    #[test]
    fn follows_links_to_the_file_itself() {
        #[cfg(unix)]
        {
            let dir = tempfile::tempdir().unwrap();
            let file = dir.path().join("a.md");
            std::fs::write(&file, "a").unwrap();
            let canonical = std::fs::canonicalize(&file).unwrap();
            let link = dir.path().join("link.md");
            std::os::unix::fs::symlink(&file, &link).unwrap();
            assert_eq!(
                canonical_path(link.to_string_lossy().into_owned()),
                canonical.to_string_lossy()
            );
        }
        assert_eq!(
            canonical_path("/no/such/file.md".into()),
            "/no/such/file.md"
        );
    }

    #[test]
    fn drops_the_verbatim_prefix_of_windows() {
        assert_eq!(
            without_verbatim(r"\\?\C:\docs\a.md".into()),
            r"C:\docs\a.md"
        );
        assert_eq!(
            without_verbatim(r"\\?\UNC\server\share\a.md".into()),
            r"\\server\share\a.md"
        );
        assert_eq!(without_verbatim("/home/a.md".into()), "/home/a.md");
    }
}

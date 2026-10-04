//! The lock on the session (the open tabs, which the webview stores): only
//! one Blank keeps it. Usually the single-instance plugin sees to that, but
//! where it can't (no session bus, a race of two starts), a second Blank
//! finds the lock taken and opens its files without restoring or storing the
//! tabs, so it can't overwrite them. The operating system lets go of the lock
//! when Blank ends, even when it crashes.

use std::fs::{File, OpenOptions, TryLockError};
use std::path::Path;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Manager, Runtime, State};

// how long a Blank waits for the lock, e.g. while the one before it quits
const WAIT: Duration = Duration::from_millis(1500);
const RETRY: Duration = Duration::from_millis(50);

/// the lock, held for as long as Blank runs
#[derive(Default)]
pub struct SessionLock(Mutex<Option<File>>);

/// lock takes the lock of the file at `path`, trying again for `wait`
/// @returns the locked file, or None when another process holds it
pub fn lock(path: &Path, wait: Duration) -> std::io::Result<Option<File>> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let file = OpenOptions::new()
        .create(true)
        .truncate(false)
        .write(true)
        .open(path)?;
    let start = Instant::now();
    loop {
        match file.try_lock() {
            Ok(()) => return Ok(Some(file)),
            Err(TryLockError::WouldBlock) if start.elapsed() < wait => std::thread::sleep(RETRY),
            Err(TryLockError::WouldBlock) => return Ok(None),
            Err(TryLockError::Error(error)) => return Err(error),
        }
    }
}

/// session_lock takes the lock on the session for this Blank
/// @returns whether this Blank keeps the session
#[tauri::command]
pub async fn session_lock<R: Runtime>(
    app: AppHandle<R>,
    held: State<'_, SessionLock>,
) -> Result<bool, String> {
    if held.0.lock().unwrap().is_some() {
        return Ok(true);
    }
    let path = app
        .path()
        .app_local_data_dir()
        .map_err(|error| error.to_string())?
        .join("session.lock");
    let file = tauri::async_runtime::spawn_blocking(move || lock(&path, WAIT))
        .await
        .map_err(|error| error.to_string())?
        .map_err(|error| error.to_string())?;
    let owned = file.is_some();
    *held.0.lock().unwrap() = file;
    Ok(owned)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_one_holds_the_lock_until_it_lets_go() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("blank").join("session.lock");

        let first = lock(&path, Duration::ZERO).unwrap();
        assert!(first.is_some());
        assert!(lock(&path, Duration::ZERO).unwrap().is_none());

        drop(first);
        assert!(lock(&path, Duration::ZERO).unwrap().is_some());
    }

    #[test]
    fn waits_for_the_lock_to_come_free() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("session.lock");
        let first = lock(&path, Duration::ZERO).unwrap();
        let freeing = std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(100));
            drop(first);
        });

        assert!(lock(&path, Duration::from_secs(2)).unwrap().is_some());
        freeing.join().unwrap();
    }
}

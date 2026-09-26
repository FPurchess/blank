//! Spell checking: the engine behind the frontend's spell checker
//! (src/spellcheck/). Tokenizing, caching and the personal dictionaries live in
//! the frontend; this module loads dictionaries, checks and suggests words, and
//! downloads the dictionaries that aren't built in.

mod bundled;
pub mod catalog;
pub mod dictionary;
mod download;
mod store;

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex, RwLock},
};

use serde::Serialize;
use spellbook::Dictionary;
use tauri::{ipc::Channel, AppHandle, Manager, State};

// suggestions returned for a word at most
const MAX_SUGGESTIONS: usize = 8;

struct Speller {
    aff: String,
    dic: String,
    dict: Dictionary,
    user_words: Vec<String>,
}

#[derive(Default)]
pub struct SpellState {
    speller: Arc<RwLock<Option<Speller>>>,
    // one lock per tag, so parallel installs of a dictionary download it once
    installs: Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>,
    client: std::sync::OnceLock<reqwest::Client>,
}

type Result<T> = std::result::Result<T, String>;

fn root(app: &AppHandle) -> Result<PathBuf> {
    app.path()
        .app_data_dir()
        .map(|dir| dir.join("dictionaries"))
        .map_err(|error| error.to_string())
}

/// entry returns the catalog entry of a loadable dictionary for `tag`
fn entry(tag: &str) -> Result<(&'static str, &'static catalog::Entry)> {
    catalog::resolve(tag)
        .filter(|(_, entry)| entry.loads)
        .ok_or_else(|| "NotAvailable".to_string())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    // there is a dictionary for the language
    available: bool,
    // it can be loaded without a download
    installed: bool,
    // a newer version than the installed one is in the catalog
    outdated: bool,
}

#[tauri::command]
pub fn spellcheck_status(app: AppHandle, tag: String) -> Result<Status> {
    let Ok((tag, entry)) = entry(&tag) else {
        return Ok(Status {
            available: false,
            installed: false,
            outdated: false,
        });
    };
    if entry.bundled {
        return Ok(Status {
            available: true,
            installed: true,
            outdated: false,
        });
    }
    let installed = store::installed(&root(&app)?, tag);
    Ok(Status {
        available: true,
        installed: installed.is_some(),
        outdated: installed.is_some_and(|version| version != entry.version),
    })
}

#[derive(Clone, Serialize)]
pub struct Progress {
    received: u64,
    total: u64,
}

#[tauri::command]
pub async fn spellcheck_install(
    app: AppHandle,
    state: State<'_, SpellState>,
    tag: String,
    on_progress: Channel<Progress>,
) -> Result<()> {
    let (tag, entry) = entry(&tag)?;
    if entry.bundled {
        return Ok(());
    }
    let root = root(&app)?;
    let lock = state
        .installs
        .lock()
        .unwrap()
        .entry(tag.to_string())
        .or_default()
        .clone();
    let _guard = lock.lock().await;
    // another install of the same dictionary may have finished meanwhile
    if store::installed(&root, tag).as_deref() == Some(entry.version.as_str()) {
        return Ok(());
    }
    std::fs::create_dir_all(&root).map_err(|error| format!("Download: {error}"))?;
    let client = state.client.get_or_init(download::client);
    download::install(
        client,
        &download::hosts(),
        &root,
        tag,
        entry,
        |received, total| {
            let _ = on_progress.send(Progress { received, total });
        },
    )
    .await
}

#[tauri::command]
pub async fn spellcheck_load(
    app: AppHandle,
    state: State<'_, SpellState>,
    tag: String,
    user_words: Vec<String>,
) -> Result<()> {
    let (tag, _) = entry(&tag)?;
    let (aff, dic) = match bundled::get(tag) {
        Some((aff, dic)) => (aff.to_string(), dic.to_string()),
        None => store::read(&root(&app)?, tag).map_err(|_| "NotInstalled".to_string())?,
    };
    let speller = state.speller.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut dict = dictionary::parse(&aff, &dic)?;
        dictionary::add_words(&mut dict, &user_words);
        *speller.write().unwrap() = Some(Speller {
            aff,
            dic,
            dict,
            user_words,
        });
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn spellcheck_unload(state: State<'_, SpellState>) {
    *state.speller.write().unwrap() = None;
}

#[tauri::command]
pub fn spellcheck_check(state: State<'_, SpellState>, words: Vec<String>) -> Result<Vec<bool>> {
    let speller = state.speller.read().unwrap();
    let speller = speller.as_ref().ok_or("NotLoaded")?;
    Ok(words.iter().map(|word| speller.dict.check(word)).collect())
}

#[tauri::command]
pub async fn spellcheck_suggest(state: State<'_, SpellState>, word: String) -> Result<Vec<String>> {
    let speller = state.speller.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let speller = speller.read().unwrap();
        let speller = speller.as_ref().ok_or("NotLoaded")?;
        let mut suggestions = vec![];
        speller.dict.suggest(&word, &mut suggestions);
        suggestions.truncate(MAX_SUGGESTIONS);
        Ok(suggestions)
    })
    .await
    .map_err(|error| error.to_string())?
}

#[tauri::command]
pub fn spellcheck_add(state: State<'_, SpellState>, word: String) -> Result<()> {
    let mut speller = state.speller.write().unwrap();
    let speller = speller.as_mut().ok_or("NotLoaded")?;
    dictionary::add_words(&mut speller.dict, std::slice::from_ref(&word));
    speller.user_words.push(word);
    Ok(())
}

#[tauri::command]
pub async fn spellcheck_remove(state: State<'_, SpellState>, word: String) -> Result<()> {
    let speller = state.speller.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut speller = speller.write().unwrap();
        let speller = speller.as_mut().ok_or("NotLoaded")?;
        speller.user_words.retain(|user_word| user_word != &word);
        // spellbook's remove_stem would also remove the word from the base
        // dictionary, so build it again without the word instead
        let mut dict = dictionary::parse(&speller.aff, &speller.dic)?;
        dictionary::add_words(&mut dict, &speller.user_words);
        speller.dict = dict;
        Ok(())
    })
    .await
    .map_err(|error| error.to_string())?
}

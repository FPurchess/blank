//! Downloading dictionaries from npm CDNs, verified against the catalog.

use std::{
    fs,
    path::{Path, PathBuf},
    time::Duration,
};

use futures_util::StreamExt;
use sha2::{Digest, Sha256};

use super::{
    catalog::{Entry, FileInfo},
    store,
};

// the CDNs serving npm packages at immutable, versioned paths
const HOSTS: [&str; 2] = ["https://cdn.jsdelivr.net/npm", "https://unpkg.com"];

/// hosts returns where dictionaries are downloaded from. Debug builds can
/// point `BLANK_DICTIONARY_MIRROR` at a local server for the E2E tests.
pub fn hosts() -> Vec<String> {
    #[cfg(debug_assertions)]
    if let Some(mirror) = mirror(std::env::var("BLANK_DICTIONARY_MIRROR").ok()) {
        return vec![mirror];
    }
    HOSTS.iter().map(|host| host.to_string()).collect()
}

/// mirror accepts only plain HTTP servers on the loopback interface
#[cfg_attr(not(debug_assertions), allow(dead_code))]
fn mirror(value: Option<String>) -> Option<String> {
    let value = value?;
    let allowed = ["http://127.0.0.1:", "http://localhost:"]
        .iter()
        .any(|prefix| value.starts_with(prefix));
    if !allowed {
        eprintln!("ignoring BLANK_DICTIONARY_MIRROR={value}, it must be a loopback URL");
    }
    allowed.then(|| value.trim_end_matches('/').to_string())
}

pub fn client() -> reqwest::Client {
    // rustls with ring builds without extra tools on every platform
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder()
        .connect_timeout(Duration::from_secs(15))
        .timeout(Duration::from_secs(120))
        .build()
        .expect("failed to set up the HTTP client")
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

/// fetch downloads `url` to `path`, checking its size and hash against `info`
async fn fetch(
    client: &reqwest::Client,
    url: &str,
    path: &Path,
    info: &FileInfo,
    progress: &mut impl FnMut(u64),
) -> Result<(), String> {
    let response = client
        .get(url)
        .send()
        .await
        .and_then(reqwest::Response::error_for_status)
        .map_err(|error| format!("Download: {error}"))?;

    let mut hasher = Sha256::new();
    let mut content = Vec::with_capacity(info.size as usize);
    let mut stream = response.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|error| format!("Download: {error}"))?;
        if content.len() + chunk.len() > info.size as usize {
            return Err("Integrity".into());
        }
        hasher.update(&chunk);
        content.extend_from_slice(&chunk);
        progress(chunk.len() as u64);
    }
    if content.len() as u64 != info.size || hex(&hasher.finalize()) != info.sha256 {
        return Err("Integrity".into());
    }
    fs::write(path, content).map_err(|error| format!("Download: {error}"))
}

/// install downloads the dictionary of `entry` into `root`/`tag`, trying each
/// host in turn. `progress` gets the bytes received so far and the total.
pub async fn install(
    client: &reqwest::Client,
    hosts: &[String],
    root: &Path,
    tag: &str,
    entry: &Entry,
    mut progress: impl FnMut(u64, u64),
) -> Result<(), String> {
    let total = entry.files.aff.size + entry.files.dic.size;
    let staging: PathBuf = root.join(format!("{tag}.part"));
    let _ = fs::remove_dir_all(&staging);
    fs::create_dir_all(&staging).map_err(|error| format!("Download: {error}"))?;

    let mut result = Err("Download: no host configured".to_string());
    for host in hosts {
        let mut received = 0;
        let mut report = |bytes| {
            received += bytes;
            progress(received, total);
        };
        result = async {
            for (name, info) in [
                (store::AFF, &entry.files.aff),
                (store::DIC, &entry.files.dic),
            ] {
                let url = format!("{host}/{}@{}/{name}", entry.package, entry.version);
                fetch(client, &url, &staging.join(name), info, &mut report).await?;
            }
            Ok(())
        }
        .await;
        // a file that doesn't match its hash won't match on another host either
        if result
            .as_ref()
            .map_or_else(|error| error == "Integrity", |()| true)
        {
            break;
        }
    }

    let result = result.and_then(|()| {
        store::replace(root, tag, &staging, &entry.version)
            .map_err(|error| format!("Download: {error}"))
    });
    let _ = fs::remove_dir_all(&staging);
    result
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
        thread,
    };

    use super::*;
    use crate::spellcheck::catalog::Files;

    struct Server {
        url: String,
        requests: Arc<AtomicUsize>,
    }

    /// serve answers every request with `respond(path)`: a status and a body
    fn serve(respond: impl Fn(&str) -> (u16, Vec<u8>) + Send + 'static) -> Server {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let url = format!("http://{}", server.server_addr().to_ip().unwrap());
        let requests = Arc::new(AtomicUsize::new(0));
        let counter = requests.clone();
        thread::spawn(move || {
            for request in server.incoming_requests() {
                counter.fetch_add(1, Ordering::SeqCst);
                let (status, body) = respond(request.url());
                let _ =
                    request.respond(tiny_http::Response::from_data(body).with_status_code(status));
            }
        });
        Server { url, requests }
    }

    fn info(content: &str) -> FileInfo {
        FileInfo {
            size: content.len() as u64,
            sha256: hex(&Sha256::digest(content.as_bytes())),
        }
    }

    fn entry(aff: &str, dic: &str) -> Entry {
        Entry {
            package: "dictionary-xx".into(),
            version: "1.0.0".into(),
            bundled: false,
            loads: true,
            files: Files {
                aff: info(aff),
                dic: info(dic),
            },
        }
    }

    fn files(path: &str) -> (u16, Vec<u8>) {
        match path {
            "/dictionary-xx@1.0.0/index.aff" => (200, b"SET UTF-8\n".to_vec()),
            "/dictionary-xx@1.0.0/index.dic" => (200, b"1\nhouse\n".to_vec()),
            _ => (404, vec![]),
        }
    }

    fn run(hosts: &[String], root: &Path, entry: &Entry) -> (Result<(), String>, Vec<(u64, u64)>) {
        let mut events = vec![];
        let result = tauri::async_runtime::block_on(install(
            &client(),
            hosts,
            root,
            "xx",
            entry,
            |received, total| events.push((received, total)),
        ));
        (result, events)
    }

    #[test]
    fn installs_a_verified_dictionary() {
        let server = serve(files);
        let root = tempfile::tempdir().unwrap();
        let entry = entry("SET UTF-8\n", "1\nhouse\n");

        let (result, events) = run(&[server.url], root.path(), &entry);

        assert_eq!(result, Ok(()));
        assert_eq!(
            store::installed(root.path(), "xx").as_deref(),
            Some("1.0.0")
        );
        assert_eq!(events.last(), Some(&(18, 18)));
        assert!(!root.path().join("xx.part").exists());
    }

    #[test]
    fn rejects_a_file_that_doesnt_match_its_hash() {
        let server = serve(files);
        let root = tempfile::tempdir().unwrap();
        let entry = entry("SET UTF-8\n", "1\nhousE\n");

        let (result, _) = run(&[server.url.clone(), server.url], root.path(), &entry);

        assert_eq!(result, Err("Integrity".into()));
        assert_eq!(store::installed(root.path(), "xx"), None);
        assert!(!root.path().join("xx.part").exists());
        // no retry on the other host
        assert_eq!(server.requests.load(Ordering::SeqCst), 2);
    }

    #[test]
    fn rejects_a_file_larger_than_expected() {
        let server = serve(|_| (200, vec![b'x'; 100_000]));
        let root = tempfile::tempdir().unwrap();

        let (result, _) = run(
            &[server.url],
            root.path(),
            &entry("SET UTF-8\n", "1\nhouse\n"),
        );

        assert_eq!(result, Err("Integrity".into()));
    }

    #[test]
    fn falls_back_to_the_next_host() {
        let broken = serve(|_| (404, vec![]));
        let working = serve(files);
        let root = tempfile::tempdir().unwrap();

        let (result, _) = run(
            &[broken.url, working.url],
            root.path(),
            &entry("SET UTF-8\n", "1\nhouse\n"),
        );

        assert_eq!(result, Ok(()));
    }

    #[test]
    fn fails_when_no_host_works() {
        let root = tempfile::tempdir().unwrap();
        // nothing listens on port 9 (discard) of the loopback interface
        let (result, _) = run(
            &["http://127.0.0.1:9".into()],
            root.path(),
            &entry("a", "b"),
        );

        assert!(result.unwrap_err().starts_with("Download: "));
        assert_eq!(store::installed(root.path(), "xx"), None);
    }

    #[test]
    fn accepts_only_loopback_mirrors() {
        assert_eq!(mirror(None), None);
        assert_eq!(
            mirror(Some("http://127.0.0.1:4000/".into())).as_deref(),
            Some("http://127.0.0.1:4000")
        );
        assert!(mirror(Some("http://localhost:4000".into())).is_some());
        assert_eq!(mirror(Some("http://example.com:4000".into())), None);
        assert_eq!(mirror(Some("https://127.0.0.1.example.com:1".into())), None);
    }
}

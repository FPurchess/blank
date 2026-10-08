//! the user's certificate and signing, as the webview asks for them
//! (src/signing/ipc.ts). The key never leaves this side: the webview sends
//! the passphrase once per signing, and gets the signed PDF back.
//!
//! What goes wrong is logged by its context and kind only: errors of the
//! crypto crates may quote what they were given.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Deserializer, Serialize};
use tauri::{AppHandle, Manager};
use zeroize::Zeroizing;

use crate::signing::certificate::CertificateInfo;
use crate::signing::keys::{self, Identity, OpenError};
use crate::signing::pdf::sign::{sign_pdf, SignRequest};
use crate::signing::verify::verify_pdf;
use crate::signing::Refusal;

/// the folder of the user's signature, initials, key and certificate
const FOLDER: &str = "signing";
/// the user's key and certificate, as a PKCS#12 file their passphrase opens
const KEY: &str = "key.p12";
/// the user's certificate alone, to show it without the passphrase
const CERTIFICATE: &str = "certificate.cer";
/// the DER bytes reserved for the signature: enough for a P-256 key, a
/// self-signed certificate and a timestamp token; sign_pdf signs again
/// with more room for a longer chain
const RESERVE: usize = 16 * 1024;

/// held while the key and certificate files are written or removed, so
/// they stay a pair
static FILES: Mutex<()> = Mutex::new(());

/// what went wrong, as the webview tells the user
#[derive(Debug, Serialize)]
#[serde(tag = "kind", content = "message", rename_all = "camelCase")]
pub enum SigningError {
    /// the passphrase doesn't open the key
    WrongPassphrase,
    /// there's no certificate to sign with
    NoCertificate,
    /// anything else, in words for the user
    Failed(String),
}

type Answer<T> = Result<T, SigningError>;

/// a passphrase, wiped from memory once it's dropped
type Passphrase = Zeroizing<String>;

/// failed logs `context` and the error's kind, and says `message` to the
/// user
fn failed<'a>(context: &'a str, message: &'a str) -> impl Fn(anyhow::Error) -> SigningError + 'a {
    move |error| {
        log::warn!("{context}: {}", kind_of(&error));
        SigningError::Failed(message.to_string())
    }
}

/// kind_of names an error without what it may quote: its type, or the
/// fixed text of Blank's own errors
fn kind_of(error: &anyhow::Error) -> String {
    if let Some(refusal) = error.downcast_ref::<Refusal>() {
        refusal.to_string()
    } else if let Some(error) = error.downcast_ref::<OpenError>() {
        error.to_string()
    } else if let Some(error) = error.downcast_ref::<std::io::Error>() {
        format!("a file couldn't be read or written ({})", error.kind())
    } else {
        "the crypto or PDF library refused".into()
    }
}

/// open_key opens the user's key file `p12` with `passphrase`; `message` is
/// what the user is told when it isn't the passphrase
fn open_key(p12: &[u8], passphrase: &str, message: &str) -> Answer<Identity> {
    keys::load_p12(p12, passphrase).map_err(|error| match error {
        OpenError::WrongPassphrase => SigningError::WrongPassphrase,
        error => {
            log::warn!("failed to open a key file: {error}");
            SigningError::Failed(message.into())
        }
    })
}

fn folder(app: &AppHandle) -> Answer<PathBuf> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(FOLDER))
        .map_err(|_| SigningError::Failed("Blank can't find its settings folder".into()))
}

/// write_partial writes `bytes` to a file beside `path` and returns that
/// file's path, once the bytes are on the disk; `private` makes it
/// readable by the user alone
fn write_partial(path: &Path, bytes: &[u8], private: bool) -> std::io::Result<PathBuf> {
    use std::io::Write;
    let partial = path.with_extension("tmp");
    // a partial file left over keeps its permissions when opened again
    let _ = std::fs::remove_file(&partial);
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create_new(true);
    #[cfg(unix)]
    if private {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    #[cfg(not(unix))]
    let _ = private;
    let mut file = options.open(&partial)?;
    file.write_all(bytes)?;
    file.sync_all()?;
    Ok(partial)
}

/// keep_files keeps the key file `p12` and its certificate `cert` in
/// `dir`, both written in full before either replaces what was there
fn keep_files(dir: &Path, p12: &[u8], cert: &[u8]) -> std::io::Result<()> {
    let _files = FILES
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    std::fs::create_dir_all(dir)?;
    let (key, certificate) = (dir.join(KEY), dir.join(CERTIFICATE));
    let key_partial = write_partial(&key, p12, true)?;
    let certificate_partial = write_partial(&certificate, cert, false)?;
    std::fs::rename(key_partial, key)?;
    std::fs::rename(certificate_partial, certificate)
}

/// remove_files removes the key file and its certificate from `dir`
fn remove_files(dir: &Path) -> std::io::Result<()> {
    let _files = FILES
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    for name in [KEY, CERTIFICATE] {
        match std::fs::remove_file(dir.join(name)) {
            Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error),
            _ => {}
        }
    }
    Ok(())
}

/// keep keeps an identity's key file and its certificate
fn keep(app: &AppHandle, p12: &[u8], identity: &Identity) -> Answer<CertificateInfo> {
    let dir = folder(app)?;
    let shown = CertificateInfo::from_der(&identity.cert).map_err(|_| {
        log::warn!("the new certificate can't be read");
        SigningError::Failed("Blank can't read this certificate".into())
    })?;
    keep_files(&dir, p12, &identity.cert).map_err(|error| {
        log::warn!("failed to keep the certificate: {}", error.kind());
        SigningError::Failed("Blank couldn't save your certificate".into())
    })?;
    Ok(shown)
}

/// read_key reads the user's key file
fn read_key(app: &AppHandle) -> Answer<Vec<u8>> {
    std::fs::read(folder(app)?.join(KEY)).map_err(|_| SigningError::NoCertificate)
}

/// signing_certificate returns the user's certificate, or None
#[tauri::command]
pub async fn signing_certificate(app: AppHandle) -> Answer<Option<CertificateInfo>> {
    let path = folder(&app)?.join(CERTIFICATE);
    let Ok(der) = std::fs::read(&path) else {
        return Ok(None);
    };
    CertificateInfo::from_der(&der).map(Some).map_err(|_| {
        log::warn!("the certificate can't be read");
        SigningError::Failed("Blank can't read your certificate".into())
    })
}

/// signing_create_certificate makes the user a key and a self-signed
/// certificate for signing, kept in a PKCS#12 file their passphrase opens
#[tauri::command]
pub async fn signing_create_certificate(
    app: AppHandle,
    name: String,
    email: Option<String>,
    passphrase: String,
) -> Answer<CertificateInfo> {
    let passphrase = Passphrase::new(passphrase);
    tauri::async_runtime::spawn_blocking(move || {
        let email = email.filter(|email| !email.trim().is_empty());
        let (p12, identity) = keys::create_certificate(name.trim(), email.as_deref(), &passphrase)
            .map_err(failed(
                "failed to make a certificate",
                "Blank couldn't make your certificate",
            ))?;
        keep(&app, &p12, &identity)
    })
    .await
    .map_err(|_| SigningError::Failed("Blank couldn't make your certificate".into()))?
}

/// signing_import takes the PKCS#12 file at `path` as the user's key and
/// certificate, once `passphrase` opens it
#[tauri::command]
pub async fn signing_import(
    app: AppHandle,
    path: PathBuf,
    passphrase: String,
) -> Answer<CertificateInfo> {
    let passphrase = Passphrase::new(passphrase);
    tauri::async_runtime::spawn_blocking(move || {
        let p12 = std::fs::read(&path).map_err(|error| {
            log::warn!("failed to read a key file: {}", error.kind());
            SigningError::Failed("Blank can't read this file".into())
        })?;
        let identity = open_key(
            &p12,
            &passphrase,
            "This isn't a key file Blank can use: it needs a certificate and its private key (RSA or ECDSA)",
        )?;
        keep(&app, &p12, &identity)
    })
    .await
    .map_err(|_| SigningError::Failed("Blank couldn't import the certificate".into()))?
}

/// signing_export copies the user's certificate (`key` false, a .cer for
/// others to trust) or their whole key file (`key` true, a backup) to
/// `path`
#[tauri::command]
pub async fn signing_export(app: AppHandle, key: bool, path: PathBuf) -> Answer<()> {
    let from = folder(&app)?.join(if key { KEY } else { CERTIFICATE });
    if !from.exists() {
        return Err(SigningError::NoCertificate);
    }
    std::fs::copy(&from, &path).map(|_| ()).map_err(|error| {
        log::warn!("failed to export the certificate: {}", error.kind());
        SigningError::Failed("Blank couldn't write the file".into())
    })
}

/// signing_remove forgets the user's key and certificate
#[tauri::command]
pub async fn signing_remove(app: AppHandle) -> Answer<()> {
    remove_files(&folder(&app)?).map_err(|error| {
        log::warn!("failed to remove the certificate: {}", error.kind());
        SigningError::Failed("Blank couldn't remove your certificate".into())
    })
}

/// signing_check_passphrase tells whether `passphrase` opens the user's
/// key, before anything is exported to sign
#[tauri::command]
pub async fn signing_check_passphrase(app: AppHandle, passphrase: String) -> Answer<()> {
    let passphrase = Passphrase::new(passphrase);
    let p12 = read_key(&app)?;
    tauri::async_runtime::spawn_blocking(move || {
        open_key(&p12, &passphrase, "Blank can't open your key").map(|_| ())
    })
    .await
    .map_err(|_| SigningError::Failed("Blank can't open your key".into()))?
}

/// how to sign, besides the PDF and the passphrase
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignOptions {
    /// the page of the signature's field, from 1
    pub page: u32,
    /// where the signature is shown: x, y, width and height in points from
    /// the page's top left; none for an invisible signature
    pub rect: Option<[f64; 4]>,
    pub name: Option<String>,
    pub location: Option<String>,
    pub reason: Option<String>,
    /// an RFC 3161 server's URL, for a timestamp (B-T)
    pub timestamp_server: Option<String>,
}

/// sign signs `pdf` with the user's key
pub fn sign(p12: &[u8], passphrase: &str, pdf: &[u8], options: &SignOptions) -> Answer<Vec<u8>> {
    let identity = open_key(p12, passphrase, "Blank can't open your key")?;
    let blank = |value: &Option<String>| value.clone().filter(|text| !text.trim().is_empty());
    let request = SignRequest {
        identity: &identity,
        page: options.page.max(1),
        rect: options.rect,
        reason: blank(&options.reason),
        location: blank(&options.location),
        name: blank(&options.name),
        tsa: blank(&options.timestamp_server),
        reserve: RESERVE,
    };
    let signed = sign_pdf(pdf, &request).map_err(|error| {
        log::warn!("failed to sign a PDF: {}", kind_of(&error));
        SigningError::Failed(match error.downcast_ref::<Refusal>() {
            Some(refusal) => refusal.to_string(),
            None => "Blank couldn't sign the PDF".into(),
        })
    })?;
    check_signed(&signed)?;
    Ok(signed)
}

/// check_signed makes sure what was just signed checks out, and that its
/// last signature covers the whole file, or it isn't saved
fn check_signed(signed: &[u8]) -> Answer<()> {
    let reports = verify_pdf(signed).map_err(failed(
        "failed to check a signed PDF",
        "Blank couldn't sign the PDF",
    ))?;
    if !reports
        .last()
        .is_some_and(|report| report.valid() && report.covers_the_whole_file())
    {
        log::warn!("a PDF Blank signed didn't check out");
        return Err(SigningError::Failed("Blank couldn't sign the PDF".into()));
    }
    Ok(())
}

/// what the header `blank-signing` holds
#[derive(Deserialize)]
struct Header {
    #[serde(deserialize_with = "passphrase")]
    passphrase: Passphrase,
    options: SignOptions,
}

/// passphrase reads a passphrase straight into memory that is wiped
fn passphrase<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Passphrase, D::Error> {
    String::deserialize(deserializer).map(Passphrase::new)
}

/// header reads the header `blank-signing`, which the webview encodes with
/// encodeURIComponent so it can hold any character
fn header(value: &str) -> Option<Header> {
    let json = percent_encoding::percent_decode_str(value)
        .decode_utf8()
        .ok()
        .map(|json| Zeroizing::new(json.into_owned()))?;
    serde_json::from_str(&json).ok()
}

/// signing_sign_pdf signs the PDF in the request's body with the user's
/// key; its header `blank-signing` holds the passphrase and the
/// SignOptions as JSON. It returns the signed PDF.
#[tauri::command]
pub async fn signing_sign_pdf(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Answer<tauri::ipc::Response> {
    let tauri::ipc::InvokeBody::Raw(pdf) = request.body() else {
        return Err(SigningError::Failed("Blank couldn't sign the PDF".into()));
    };
    let header = request
        .headers()
        .get("blank-signing")
        .and_then(|value| value.to_str().ok())
        .and_then(header)
        .ok_or_else(|| SigningError::Failed("Blank couldn't sign the PDF".into()))?;
    let p12 = read_key(&app)?;
    let pdf = pdf.clone();
    let signed = tauri::async_runtime::spawn_blocking(move || {
        sign(&p12, &header.passphrase, &pdf, &header.options)
    })
    .await
    .map_err(|_| SigningError::Failed("Blank couldn't sign the PDF".into()))??;
    Ok(tauri::ipc::Response::new(signed))
}

#[cfg(test)]
mod tests;

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
use crate::signing::trust::{self, CheckedSignature};
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
    /// there's a key already, which only a request to replace it replaces
    KeyExists,
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
/// `dir`, both written in full before either replaces what was there. A
/// key already there is replaced only with `replace`, else it's kept and
/// keep_files returns false. If the certificate can't be put in place, the
/// key that was there comes back.
fn keep_files(dir: &Path, p12: &[u8], cert: &[u8], replace: bool) -> std::io::Result<bool> {
    keep_files_with(dir, p12, cert, replace, |from, to| {
        std::fs::rename(from, to)
    })
}

/// keep_files_with is keep_files, which puts each file in place with
/// `place`, for the tests to make it fail
fn keep_files_with(
    dir: &Path,
    p12: &[u8],
    cert: &[u8],
    replace: bool,
    place: impl Fn(&Path, &Path) -> std::io::Result<()>,
) -> std::io::Result<bool> {
    let _files = FILES
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    std::fs::create_dir_all(dir)?;
    let (key, certificate) = (dir.join(KEY), dir.join(CERTIFICATE));
    if !replace && key.try_exists()? {
        return Ok(false);
    }
    let key_partial = write_partial(&key, p12, true)?;
    let certificate_partial = write_partial(&certificate, cert, false).inspect_err(|_| {
        let _ = std::fs::remove_file(&key_partial);
    })?;
    // the old key stays where it is until the new one replaces it
    let old_key = keep_aside(&key).inspect_err(|_| {
        let _ = std::fs::remove_file(&key_partial);
        let _ = std::fs::remove_file(&certificate_partial);
    })?;
    let placed = place(&key_partial, &key).and_then(|()| place(&certificate_partial, &certificate));
    if let Err(error) = placed {
        // the key that was there comes back beside its certificate
        let _ = std::fs::remove_file(&key_partial);
        let _ = std::fs::remove_file(&certificate_partial);
        match &old_key {
            Some(old) => std::fs::rename(old, &key)?,
            None => match std::fs::remove_file(&key) {
                Err(error) if error.kind() != std::io::ErrorKind::NotFound => return Err(error),
                _ => {}
            },
        }
        return Err(error);
    }
    if let Some(old) = old_key {
        let _ = std::fs::remove_file(old);
    }
    Ok(true)
}

/// keep_aside keeps the file at `path` beside it as well, a link or else a
/// copy, and returns where; None when there's no file
fn keep_aside(path: &Path) -> std::io::Result<Option<PathBuf>> {
    let old = path.with_extension("old");
    // one left over would stop the link
    let _ = std::fs::remove_file(&old);
    let kept = std::fs::hard_link(path, &old)
        // a disk without links
        .or_else(|_| std::fs::copy(path, &old).map(|_| ()));
    match kept {
        Ok(()) => Ok(Some(old)),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(error) => Err(error),
    }
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

/// refuse_replacing refuses before a new key is made or read when the user has
/// one already, unless `replace`
fn refuse_replacing(app: &AppHandle, replace: bool) -> Answer<()> {
    if !replace && folder(app)?.join(KEY).try_exists().unwrap_or(true) {
        return Err(SigningError::KeyExists);
    }
    Ok(())
}

/// keep keeps an identity's key file and its certificate, replacing a key
/// that is there only with `replace`
fn keep(
    app: &AppHandle,
    p12: &[u8],
    identity: &Identity,
    replace: bool,
) -> Answer<CertificateInfo> {
    let dir = folder(app)?;
    let shown = CertificateInfo::from_der(&identity.cert).map_err(|_| {
        log::warn!("the new certificate can't be read");
        SigningError::Failed("Blank can't read this certificate".into())
    })?;
    let kept = keep_files(&dir, p12, &identity.cert, replace).map_err(|error| {
        log::warn!("failed to keep the certificate: {}", error.kind());
        SigningError::Failed("Blank couldn't save your certificate".into())
    })?;
    if !kept {
        return Err(SigningError::KeyExists);
    }
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
/// certificate for signing, kept in a PKCS#12 file their passphrase opens;
/// a key they have is replaced only with `replace`
#[tauri::command]
pub async fn signing_create_certificate(
    app: AppHandle,
    name: String,
    email: Option<String>,
    passphrase: String,
    replace: bool,
) -> Answer<CertificateInfo> {
    let passphrase = Passphrase::new(passphrase);
    refuse_replacing(&app, replace)?;
    tauri::async_runtime::spawn_blocking(move || {
        let email = email.filter(|email| !email.trim().is_empty());
        let (p12, identity) = keys::create_certificate(name.trim(), email.as_deref(), &passphrase)
            .map_err(failed(
                "failed to make a certificate",
                "Blank couldn't make your certificate",
            ))?;
        keep(&app, &p12, &identity, replace)
    })
    .await
    .map_err(|_| SigningError::Failed("Blank couldn't make your certificate".into()))?
}

/// signing_import takes the PKCS#12 file at `path` as the user's key and
/// certificate, once `passphrase` opens it; a key they have is replaced
/// only with `replace`
#[tauri::command]
pub async fn signing_import(
    app: AppHandle,
    path: PathBuf,
    passphrase: String,
    replace: bool,
) -> Answer<CertificateInfo> {
    let passphrase = Passphrase::new(passphrase);
    refuse_replacing(&app, replace)?;
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
        keep(&app, &p12, &identity, replace)
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
    pub location: Option<String>,
    pub reason: Option<String>,
    /// an RFC 3161 server's URL, for a timestamp (B-T)
    pub timestamp_server: Option<String>,
}

/// signer is the name of the certificate's holder, which the signature
/// names as who signed it; None when it has no common name
fn signer(cert: &[u8]) -> Option<String> {
    use der::Decode;
    let cert = x509_cert::Certificate::from_der(cert).ok()?;
    crate::signing::certificate::common_name(&cert.tbs_certificate.subject)
}

/// sign signs `pdf` with the user's key, in the name of its certificate's
/// holder
pub fn sign(p12: &[u8], passphrase: &str, pdf: &[u8], options: &SignOptions) -> Answer<Vec<u8>> {
    let identity = open_key(p12, passphrase, "Blank can't open your key")?;
    let blank = |value: &Option<String>| value.clone().filter(|text| !text.trim().is_empty());
    let request = SignRequest {
        identity: &identity,
        page: options.page.max(1),
        rect: options.rect,
        reason: blank(&options.reason),
        location: blank(&options.location),
        name: blank(&signer(&identity.cert)),
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

/// checked_signatures checks every signature of the PDF `pdf`, and whom it
/// is from as far as Blank can tell (see trust.rs)
pub fn checked_signatures(app: &AppHandle, pdf: &[u8]) -> Answer<Vec<CheckedSignature>> {
    let dir = folder(app)?;
    let own = std::fs::read(dir.join(CERTIFICATE))
        .ok()
        .and_then(|der| CertificateInfo::from_der(&der).ok())
        .map(|info| info.fingerprint);
    let trusted = trust::trusted_in(&dir)
        .into_iter()
        .map(|info| info.fingerprint)
        .collect();
    let reports = verify_pdf(pdf).map_err(failed(
        "failed to check the signatures of a PDF",
        "Blank couldn't check the signatures of this PDF",
    ))?;
    Ok(reports
        .into_iter()
        .map(|report| trust::checked(report, own.as_deref(), &trusted))
        .collect())
}

/// signing_trusted returns the certificates the user trusts
#[tauri::command]
pub async fn signing_trusted(app: AppHandle) -> Answer<Vec<CertificateInfo>> {
    Ok(trust::trusted_in(&folder(&app)?))
}

/// signing_trust trusts the certificate `der` (in hex), once the user
/// compared its fingerprint with the signer's
#[tauri::command]
pub async fn signing_trust(app: AppHandle, der: String) -> Answer<CertificateInfo> {
    let der = hex::decode(der)
        .map_err(|_| SigningError::Failed("Blank can't read this certificate".into()))?;
    trust::trust_in(&folder(&app)?, &der).map_err(|error| {
        log::warn!("failed to trust a certificate: {}", error.kind());
        SigningError::Failed("Blank couldn't keep the certificate".into())
    })
}

/// signing_untrust stops trusting the certificate of `fingerprint`
#[tauri::command]
pub async fn signing_untrust(app: AppHandle, fingerprint: String) -> Answer<()> {
    trust::untrust_in(&folder(&app)?, &fingerprint).map_err(|error| {
        log::warn!("failed to forget a trusted certificate: {}", error.kind());
        SigningError::Failed("Blank couldn't remove the certificate".into())
    })
}

#[cfg(test)]
mod tests;

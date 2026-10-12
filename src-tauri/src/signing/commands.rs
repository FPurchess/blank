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

use crate::pdf_view::{read_checked, PdfTabs};
use crate::signing::certificate::CertificateInfo;
use crate::signing::keys::{self, Identity, OpenError};
use crate::signing::pdf::sign::{update_pdf, Other, PlacedStamp, Plan as UpdatePlan, Signer, Spot};
use crate::signing::trust::{self, CheckedSignature};
use crate::signing::verify::{verify_pdf, SignatureReport};
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

/// what the user is told of an email address a certificate can't hold:
/// certificates write them in ASCII (rcgen refuses others), and Blank
/// doesn't convert the domain to punycode (certificateDialogModel.ts says
/// the same before it gets here)
const NON_ASCII_EMAIL: &str =
    "A certificate can only hold an email address of plain letters (a–z), digits and symbols";

/// held while the key and certificate files are written, copied or
/// removed, so they stay a pair
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
    /// the timestamp server didn't give a timestamp that holds, in words
    /// for the user, who can sign without one
    Timestamp(String),
    /// the PDF's file changed after Blank opened it
    FileChanged,
    /// the PDF's file was moved or deleted after Blank opened it
    FileMissing,
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
    let email = email
        .map(|email| email.trim().to_string())
        .filter(|email| !email.is_empty());
    if email.as_ref().is_some_and(|email| !email.is_ascii()) {
        return Err(SigningError::Failed(NON_ASCII_EMAIL.into()));
    }
    tauri::async_runtime::spawn_blocking(move || {
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
    // not while the pair is replaced or removed
    let _files = FILES
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
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

/// a place on a page: x, y, width and height in points from the top left
/// of the page as shown
type Rect = [f64; 4];

/// a stamp to put on the pages
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StampPlan {
    /// the body's part with its one-page PDF
    pub part: usize,
    /// from 1
    pub page: u32,
    pub rect: Rect,
    /// on every page, at the same place, moved into smaller pages
    #[serde(default)]
    pub repeat: bool,
}

/// where the signature goes
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum SignaturePlan {
    /// in no place on the pages
    Invisible,
    /// the empty signature field of this full name, showing the stamp of
    /// the body's part `stamp`
    Existing { field: String, stamp: Option<usize> },
    /// a new field on page `page` (from 1)
    New {
        page: u32,
        rect: Rect,
        stamp: Option<usize>,
    },
}

/// an empty signature field for someone else, named after them
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OtherPlan {
    pub page: u32,
    pub rect: Rect,
    /// who is to sign it: the field is called "Signature of ‹name›"
    pub name: String,
}

/// what to add to the PDF, and what the signature says
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    #[serde(default)]
    pub stamps: Vec<StampPlan>,
    pub signature: SignaturePlan,
    #[serde(default)]
    pub others: Vec<OtherPlan>,
    pub location: Option<String>,
    pub reason: Option<String>,
    /// an RFC 3161 server's URL, for a timestamp (B-T)
    pub timestamp_server: Option<String>,
}

/// a form field's new value, which the PDF tab's helper writes (see
/// pdf_view): text, or whether a box is ticked
#[derive(Debug, Clone, Deserialize)]
#[serde(untagged)]
pub enum FillValue {
    Text(String),
    Ticked(bool),
}

#[derive(Debug, Clone, Deserialize)]
pub struct Fill {
    /// the field's full name
    pub field: String,
    pub value: FillValue,
}

/// where the PDF to sign comes from
#[derive(Debug, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Source {
    /// the body's part 0 (the export flow)
    Body,
    /// a PDF tab's file, which must still be the one the tab opened, with
    /// the tab's fills
    Tab {
        tab: String,
        path: PathBuf,
        sha256: String,
        #[serde(default)]
        fills: Vec<Fill>,
    },
}

/// the user's key file and its passphrase
pub struct Key<'a> {
    pub p12: &'a [u8],
    pub passphrase: &'a str,
}

/// signer_name is the name of the certificate's holder, which the
/// signature names as who signed it; None when it has no common name
fn signer_name(cert: &[u8]) -> Option<String> {
    use der::Decode;
    let cert = x509_cert::Certificate::from_der(cert).ok()?;
    crate::signing::certificate::common_name(&cert.tbs_certificate.subject)
}

/// signing's fixed sentence for what failed
const SIGN_FAILED: &str = "Blank couldn't sign the PDF";
const STAMP_FAILED: &str = "Blank couldn't add to the PDF";

/// sign adds `plan` to `pdf` and signs it with the user's key, or, without
/// a key, adds the stamps and fields alone; the stamps' PDFs are `parts`
/// of the body, by `part`
pub fn sign(key: Option<Key>, pdf: &[u8], parts: &[&[u8]], plan: &Plan) -> Answer<Vec<u8>> {
    let message = if key.is_some() {
        SIGN_FAILED
    } else {
        STAMP_FAILED
    };
    let identity = key
        .map(|key| open_key(key.p12, key.passphrase, "Blank can't open your key"))
        .transpose()?;
    let part = |index: usize| -> Answer<&[u8]> {
        parts.get(index).copied().ok_or_else(|| {
            log::warn!("a stamp names a part the request doesn't have");
            SigningError::Failed(message.into())
        })
    };
    let stamps = plan
        .stamps
        .iter()
        .map(|s| {
            Ok(PlacedStamp {
                pdf: part(s.part)?,
                page: s.page,
                rect: s.rect,
                repeat: s.repeat,
            })
        })
        .collect::<Answer<Vec<_>>>()?;
    let signature = match &plan.signature {
        SignaturePlan::Invisible => Spot::Invisible,
        SignaturePlan::Existing { field, stamp } => Spot::Existing {
            field: field.clone(),
            stamp: stamp.map(part).transpose()?,
        },
        SignaturePlan::New { page, rect, stamp } => Spot::New {
            page: *page,
            rect: *rect,
            stamp: stamp.map(part).transpose()?,
        },
    };
    let others = plan
        .others
        .iter()
        .map(|o| Other {
            page: o.page,
            rect: o.rect,
            name: o.name.clone(),
        })
        .collect();
    let update = UpdatePlan {
        stamps,
        signature,
        others,
    };
    let blank = |value: &Option<String>| value.clone().filter(|text| !text.trim().is_empty());
    let signer = identity.as_ref().map(|identity| Signer {
        identity,
        reason: blank(&plan.reason),
        location: blank(&plan.location),
        name: blank(&signer_name(&identity.cert)),
        tsa: blank(&plan.timestamp_server),
        reserve: RESERVE,
    });
    // what the signatures it has were, to compare after
    let before = verify_pdf(pdf).unwrap_or_default();
    let updated = update_pdf(pdf, &update, signer.as_ref()).map_err(|error| {
        log::warn!("failed to update a PDF: {}", kind_of(&error));
        match error.downcast_ref::<Refusal>() {
            Some(
                refusal @ (Refusal::NoTimestamp
                | Refusal::TimestampRefused
                | Refusal::TimestampUnusable),
            ) => SigningError::Timestamp(refusal.to_string()),
            Some(refusal) => SigningError::Failed(refusal.to_string()),
            None => SigningError::Failed(message.into()),
        }
    })?;
    match &signer {
        Some(signer) => check_signed(&updated, signer.tsa.is_some(), &before)?,
        None => check_unsigned(&updated, &before)?,
    }
    Ok(updated)
}

/// added returns the signatures of `after` that weren't in `before`, if
/// every one of `before` is still there and checks out as it did; a
/// signature is known by its byte range, since the reports come in the
/// order of the form's fields, not of the revisions
fn added<'a>(
    after: &'a [SignatureReport],
    before: &[SignatureReport],
) -> Option<Vec<&'a SignatureReport>> {
    let kept = before.iter().all(|b| {
        after
            .iter()
            .any(|a| a.byte_range == b.byte_range && a.field == b.field && a.valid() == b.valid())
    });
    kept.then(|| {
        after
            .iter()
            .filter(|a| !before.iter().any(|b| b.byte_range == a.byte_range))
            .collect()
    })
}

/// check_signed makes sure what was just signed checks out: one new
/// signature, valid and covering the whole file, and the signatures it had
/// `before` as valid as they were, or it isn't saved; `timestamped` asks
/// for a timestamp that holds as well, since the user asked for one
fn check_signed(signed: &[u8], timestamped: bool, before: &[SignatureReport]) -> Answer<()> {
    let reports =
        verify_pdf(signed).map_err(failed("failed to check a signed PDF", SIGN_FAILED))?;
    let new = added(&reports, before).unwrap_or_default();
    let [last] = new[..] else {
        log::warn!("a PDF Blank signed didn't check out");
        return Err(SigningError::Failed(SIGN_FAILED.into()));
    };
    if !(last.valid() && last.covers_the_whole_file()) {
        log::warn!("a PDF Blank signed didn't check out");
        return Err(SigningError::Failed(SIGN_FAILED.into()));
    }
    if timestamped && (last.timestamp.is_none() || last.timestamp_unreadable) {
        log::warn!("a PDF Blank signed has no timestamp that holds");
        return Err(SigningError::Timestamp(
            Refusal::TimestampUnusable.to_string(),
        ));
    }
    Ok(())
}

/// check_unsigned makes sure an update without a signature added none, and
/// left the signatures as valid as they were
fn check_unsigned(updated: &[u8], before: &[SignatureReport]) -> Answer<()> {
    let reports =
        verify_pdf(updated).map_err(failed("failed to check an updated PDF", STAMP_FAILED))?;
    if added(&reports, before).is_none_or(|new| !new.is_empty()) {
        log::warn!("a PDF Blank added to didn't check out");
        return Err(SigningError::Failed(STAMP_FAILED.into()));
    }
    Ok(())
}

/// what the header `blank-signing` holds
#[derive(Deserialize)]
struct Header {
    /// none: the stamps and fields alone, no signature
    #[serde(default, deserialize_with = "passphrase")]
    passphrase: Option<Passphrase>,
    source: Source,
    plan: Plan,
}

/// passphrase reads a passphrase straight into memory that is wiped
fn passphrase<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<Passphrase>, D::Error> {
    Option::<String>::deserialize(deserializer).map(|p| p.map(Passphrase::new))
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

/// the most parts a request may have
const MAX_PARTS: usize = 1_024;

/// parts splits the body into its parts: a little-endian u32 count, then
/// each part as a little-endian u64 length and its bytes, nothing after
fn parts(body: &[u8]) -> Option<Vec<&[u8]>> {
    let count = u32::from_le_bytes(body.get(..4)?.try_into().ok()?) as usize;
    if count > MAX_PARTS {
        return None;
    }
    let mut rest = &body[4..];
    let mut out = Vec::with_capacity(count);
    for _ in 0..count {
        let length = u64::from_le_bytes(rest.get(..8)?.try_into().ok()?);
        let length = usize::try_from(length).ok()?;
        let part = rest.get(8..8usize.checked_add(length)?)?;
        out.push(part);
        rest = &rest[8 + length..];
    }
    rest.is_empty().then_some(out)
}

/// tab_bytes is the PDF of a PDF tab to sign: its file, read again, while
/// it is the one the tab opened, with the tab's fills written into it by
/// the tab's helper as a revision of their own.
///
/// INTEGRATION POINT: the fills are `pdf_view::filled_bytes(tabs, tab,
/// path, sha256, fills)` of the helper's stream; until it lands here, a PDF
/// with fills isn't signed.
fn tab_bytes(
    _tabs: &PdfTabs,
    _tab: &str,
    path: &Path,
    sha256: &str,
    fills: &[Fill],
) -> Answer<Vec<u8>> {
    let bytes = read_checked(path, sha256).map_err(|error| {
        log::warn!("failed to read a PDF tab's file to sign: {}", error.kind());
        match error.kind() {
            std::io::ErrorKind::InvalidData => SigningError::FileChanged,
            std::io::ErrorKind::NotFound => SigningError::FileMissing,
            _ => SigningError::Failed("Blank can't read this PDF again".into()),
        }
    })?;
    if !fills.is_empty() {
        log::warn!("a PDF tab's fills can't be written yet");
        return Err(SigningError::Failed(
            "Blank can't fill in this PDF's fields yet".into(),
        ));
    }
    Ok(bytes.to_vec())
}

/// signing_sign_pdf adds stamps, empty signature fields for others and a
/// signature to a PDF, and returns it. Its header `blank-signing` holds,
/// as JSON, the passphrase (null: no signature, the stamps and fields
/// alone), where the PDF comes from (`source`: the body's part 0, or a PDF
/// tab's file) and the `plan`; the body holds the parts (see `parts`), the
/// stamps' one-page PDFs among them.
#[tauri::command]
pub async fn signing_sign_pdf(
    app: AppHandle,
    tabs: tauri::State<'_, PdfTabs>,
    request: tauri::ipc::Request<'_>,
) -> Answer<tauri::ipc::Response> {
    let refused = || SigningError::Failed(SIGN_FAILED.into());
    let tauri::ipc::InvokeBody::Raw(body) = request.body() else {
        return Err(refused());
    };
    let header = request
        .headers()
        .get("blank-signing")
        .and_then(|value| value.to_str().ok())
        .and_then(header)
        .ok_or_else(refused)?;
    if parts(body).is_none() {
        log::warn!("a request to sign had a body that isn't parts");
        return Err(refused());
    }
    let pdf = match &header.source {
        Source::Body => None,
        Source::Tab {
            tab,
            path,
            sha256,
            fills,
        } => Some(tab_bytes(&tabs, tab, path, sha256, fills)?),
    };
    let p12 = match header.passphrase {
        Some(_) => Some(read_key(&app)?),
        None => None,
    };
    let body = body.clone();
    let signed = tauri::async_runtime::spawn_blocking(move || {
        let parts = parts(&body).ok_or_else(refused)?;
        let pdf = match &pdf {
            Some(pdf) => pdf.as_slice(),
            None => parts.first().copied().ok_or_else(refused)?,
        };
        let key = match (&p12, &header.passphrase) {
            (Some(p12), Some(passphrase)) => Some(Key { p12, passphrase }),
            _ => None,
        };
        sign(key, pdf, &parts, &header.plan)
    })
    .await
    .map_err(|_| refused())??;
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
    Ok(trust::checked_all(reports, own.as_deref(), &trusted))
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

#[cfg(test)]
mod received;

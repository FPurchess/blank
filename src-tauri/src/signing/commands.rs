//! The user's certificate and signing, as the webview asks for them
//! (src/signing/ipc.ts). The key never leaves this side: the webview sends
//! the passphrase once per signing, and gets the signed PDF back.
//!
//! What goes wrong is logged by its context and kind only: errors of the
//! crypto crates may quote what they were given.

use std::path::PathBuf;

use der::Decode;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

use crate::signing::keys::{self, Identity};
use crate::signing::pdf::sign::{sign_pdf, SignRequest};
use crate::signing::verify::{cert_info, common_name, verify_pdf};

/// the folder of the user's signature, initials, key and certificate
const FOLDER: &str = "signing";
/// the user's key and certificate, as a PKCS#12 file their passphrase opens
const KEY: &str = "key.p12";
/// the user's certificate alone, to show it without the passphrase
const CERTIFICATE: &str = "certificate.cer";
/// the DER bytes reserved for the signature: enough for a P-256 key, a
/// self-signed certificate and a timestamp token; sign_pdf retries with
/// twice that for a longer chain
const RESERVE: usize = 16 * 1024;

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

/// failed logs `context` and the error's kind, and says `message` to the
/// user
fn failed<'a>(context: &'a str, message: &'a str) -> impl Fn(anyhow::Error) -> SigningError + 'a {
    move |error| {
        log::warn!("{context}: {}", kind_of(&error));
        SigningError::Failed(message.to_string())
    }
}

/// kind_of names an error without what it may quote: its type, and
/// whether it was about a passphrase or a file
fn kind_of(error: &anyhow::Error) -> &'static str {
    if error.downcast_ref::<std::io::Error>().is_some() {
        "a file couldn't be read or written"
    } else if is_wrong_passphrase(error) {
        "wrong passphrase"
    } else {
        "the crypto or PDF library refused"
    }
}

/// whether the error says the passphrase doesn't open the PKCS#12 file: its
/// MAC doesn't match, as p12-keystore and our BER shim report it
fn is_wrong_passphrase(error: &anyhow::Error) -> bool {
    let text = format!("{error:#}").to_lowercase();
    text.contains("mac") || text.contains("passphrase") || text.contains("password")
}

fn folder(app: &AppHandle) -> Answer<PathBuf> {
    app.path()
        .app_config_dir()
        .map(|dir| dir.join(FOLDER))
        .map_err(|_| SigningError::Failed("Blank can't find its settings folder".into()))
}

/// what the webview shows of a certificate
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateInfo {
    /// its common name, e.g. "Ada Lovelace"
    pub name: String,
    pub issuer: String,
    pub not_before: String,
    pub not_after: String,
    pub self_signed: bool,
    /// SHA-256 of the certificate, in capital hex
    pub fingerprint: String,
}

/// info returns what the webview shows of the certificate `der`
pub fn info(der: &[u8]) -> anyhow::Result<CertificateInfo> {
    let certificate = x509_cert::Certificate::from_der(der)?;
    let details = cert_info(&certificate, der);
    let tbs = &certificate.tbs_certificate;
    Ok(CertificateInfo {
        name: common_name(&tbs.subject).unwrap_or(details.subject),
        issuer: common_name(&tbs.issuer).unwrap_or(details.issuer),
        not_before: details.not_before,
        not_after: details.not_after,
        self_signed: details.self_signed,
        fingerprint: details.sha256,
    })
}

/// writes `bytes` to `path` as a whole: to a file beside it, then renamed
fn write_whole(path: &std::path::Path, bytes: &[u8]) -> std::io::Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    let partial = path.with_extension("tmp");
    std::fs::write(&partial, bytes)?;
    std::fs::rename(&partial, path)
}

/// keeps an identity's key file and its certificate
fn keep(app: &AppHandle, p12: &[u8], identity: &Identity) -> Answer<CertificateInfo> {
    let dir = folder(app)?;
    let shown = info(&identity.cert).map_err(failed(
        "the new certificate can't be read",
        "Blank can't read this certificate",
    ))?;
    write_whole(&dir.join(KEY), p12)
        .and_then(|()| write_whole(&dir.join(CERTIFICATE), &identity.cert))
        .map_err(|error| {
            log::warn!("failed to keep the certificate: {}", error.kind());
            SigningError::Failed("Blank couldn't save your certificate".into())
        })?;
    Ok(shown)
}

/// signing_certificate returns the user's certificate, or None
#[tauri::command]
pub async fn signing_certificate(app: AppHandle) -> Answer<Option<CertificateInfo>> {
    let path = folder(&app)?.join(CERTIFICATE);
    let Ok(der) = std::fs::read(&path) else {
        return Ok(None);
    };
    info(&der).map(Some).map_err(failed(
        "the certificate can't be read",
        "Blank can't read your certificate",
    ))
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
    tauri::async_runtime::spawn_blocking(move || {
        let email = email.filter(|email| !email.trim().is_empty());
        let made = keys::create_certificate(name.trim(), email.as_deref(), &passphrase)
            .and_then(|p12| Ok((keys::load_p12(&p12, &passphrase)?, p12)));
        let (identity, p12) = made.map_err(failed(
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
    tauri::async_runtime::spawn_blocking(move || {
        let p12 = std::fs::read(&path).map_err(|error| {
            log::warn!("failed to read a key file: {}", error.kind());
            SigningError::Failed("Blank can't read this file".into())
        })?;
        let identity = keys::load_p12(&p12, &passphrase).map_err(|error| {
            if is_wrong_passphrase(&error) {
                return SigningError::WrongPassphrase;
            }
            log::warn!("failed to open a key file: {}", kind_of(&error));
            SigningError::Failed(
                "This isn't a key file Blank can use: it needs a certificate and its private key (RSA or ECDSA)".into(),
            )
        })?;
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
    let dir = folder(&app)?;
    for name in [KEY, CERTIFICATE] {
        let path = dir.join(name);
        if path.exists() {
            std::fs::remove_file(&path).map_err(|error| {
                log::warn!("failed to remove the certificate: {}", error.kind());
                SigningError::Failed("Blank couldn't remove your certificate".into())
            })?;
        }
    }
    Ok(())
}

/// signing_check_passphrase tells whether `passphrase` opens the user's
/// key, before anything is exported to sign
#[tauri::command]
pub async fn signing_check_passphrase(app: AppHandle, passphrase: String) -> Answer<()> {
    let p12 = std::fs::read(folder(&app)?.join(KEY)).map_err(|_| SigningError::NoCertificate)?;
    tauri::async_runtime::spawn_blocking(move || {
        keys::load_p12(&p12, &passphrase).map(|_| ()).map_err(|error| {
            if is_wrong_passphrase(&error) {
                SigningError::WrongPassphrase
            } else {
                log::warn!("failed to open the key: {}", kind_of(&error));
                SigningError::Failed("Blank can't open your key".into())
            }
        })
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
    let identity = keys::load_p12(p12, passphrase).map_err(|error| {
        if is_wrong_passphrase(&error) {
            SigningError::WrongPassphrase
        } else {
            log::warn!("failed to open the key: {}", kind_of(&error));
            SigningError::Failed("Blank can't open your key".into())
        }
    })?;
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
        let text = format!("{error:#}");
        log::warn!("failed to sign a PDF: {}", kind_of(&error));
        // what the signer says of the PDF itself is for the user; it
        // never quotes the key
        SigningError::Failed(if text.contains("timestamp server") {
            "The timestamp server didn't answer".into()
        } else if text.contains("doesn't allow any changes") || text.contains("restrictions") {
            text
        } else {
            "Blank couldn't sign the PDF".into()
        })
    })?;
    // what was just signed must check out, or it isn't saved
    let checked = verify_pdf(&signed.bytes).map_err(failed(
        "failed to check a signed PDF",
        "Blank couldn't sign the PDF",
    ))?;
    if !checked.last().is_some_and(|report| report.valid()) {
        log::warn!("a PDF Blank signed didn't check out");
        return Err(SigningError::Failed("Blank couldn't sign the PDF".into()));
    }
    Ok(signed.bytes)
}

/// signing_sign_pdf signs the PDF in the request's body with the user's
/// key; its header `blank-signing` holds the passphrase and the
/// SignOptions as JSON. It returns the signed PDF.
#[tauri::command]
pub async fn signing_sign_pdf(
    app: AppHandle,
    request: tauri::ipc::Request<'_>,
) -> Answer<tauri::ipc::Response> {
    #[derive(Deserialize)]
    struct Header {
        passphrase: String,
        options: SignOptions,
    }
    let tauri::ipc::InvokeBody::Raw(pdf) = request.body() else {
        return Err(SigningError::Failed("Blank couldn't sign the PDF".into()));
    };
    let header: Header = request
        .headers()
        .get("blank-signing")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| percent_decode(value))
        .and_then(|json| serde_json::from_str(&json).ok())
        .ok_or_else(|| SigningError::Failed("Blank couldn't sign the PDF".into()))?;
    let p12 = std::fs::read(folder(&app)?.join(KEY)).map_err(|_| SigningError::NoCertificate)?;
    let pdf = pdf.clone();
    let signed = tauri::async_runtime::spawn_blocking(move || {
        sign(&p12, &header.passphrase, &pdf, &header.options)
    })
    .await
    .map_err(|_| SigningError::Failed("Blank couldn't sign the PDF".into()))??;
    Ok(tauri::ipc::Response::new(signed))
}

/// percent_decode decodes the header value, which the webview encodes with
/// encodeURIComponent so it can hold any character
fn percent_decode(value: &str) -> Option<String> {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            let hex = std::str::from_utf8(bytes.get(index + 1..index + 3)?).ok()?;
            out.push(u8::from_str_radix(hex, 16).ok()?);
            index += 3;
        } else {
            out.push(bytes[index]);
            index += 1;
        }
    }
    String::from_utf8(out).ok()
}

#[cfg(test)]
mod tests;

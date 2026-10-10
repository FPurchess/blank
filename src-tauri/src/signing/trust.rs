//! Whom a PDF's signatures are from, as far as Blank can tell, and what the
//! webview shows of each (`CheckedSignature`). Blank trusts the user's own
//! certificate, and the certificates the user trusted after comparing their
//! fingerprints with the signers' (`trusted/<fingerprint>.cer` in the
//! signing folder). A certificate a certificate authority issued is only
//! "issued by" it: Blank doesn't check certificate authorities, nor whether
//! a certificate was revoked.

use std::collections::HashSet;
use std::io;
use std::path::Path;

use serde::Serialize;

use crate::signing::certificate::CertificateInfo;
use crate::signing::verify::{Coverage, SignatureReport};

/// the folder of the trusted certificates, in the signing folder
const TRUSTED: &str = "trusted";

/// how far Blank trusts who signed
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Trust {
    /// the user's own certificate
    Own,
    /// one the user trusted
    Trusted,
    /// one a certificate authority issued, which Blank doesn't check
    IssuedBy { issuer: String },
    /// a self-signed one Blank doesn't know
    Unknown,
}

/// what a signature says of the PDF
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum Status {
    /// intact, and nothing but validation data came after it
    Valid,
    /// intact for the version it signed; the PDF changed after it, and a
    /// later signature signed those changes
    SignedAgainLater,
    /// intact, but the PDF changed after it
    ChangedAfterSigning,
    /// it doesn't match the PDF, or can't be checked
    Invalid,
}

/// a signature of a PDF, as the webview shows it (src/signing/ipc.ts)
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CheckedSignature {
    pub field: String,
    /// who signed: the certificate's name, else what the signature says
    pub name: Option<String>,
    /// when, in ISO 8601: the timestamp's time, else the signer's clock
    /// (as written, without an offset when it has none)
    pub time: Option<String>,
    pub timestamped: bool,
    /// who timestamped it: the name in the timestamp's certificate
    pub timestamp_authority: Option<String>,
    /// whether that certificate is one the user trusts: else the time is
    /// only what the timestamp says, not checked
    pub timestamp_trusted: bool,
    /// the weak algorithm it relies on ("SHA-1"), if it does
    pub weak: Option<&'static str>,
    /// for SignedAgainLater: who signed next, after the changes
    pub later_signer: Option<String>,
    pub reason: Option<String>,
    pub location: Option<String>,
    pub status: Status,
    pub trust: Trust,
    pub certificate: Option<CertificateInfo>,
    /// the certificate, DER in hex, to trust it
    pub certificate_der: Option<String>,
}

/// classify says how far Blank trusts the certificate `signer`, given the
/// fingerprints of the user's own and of those they trusted
pub fn classify(signer: &CertificateInfo, own: Option<&str>, trusted: &HashSet<String>) -> Trust {
    if own == Some(signer.fingerprint.as_str()) {
        Trust::Own
    } else if trusted.contains(&signer.fingerprint) {
        Trust::Trusted
    } else if !signer.self_signed {
        Trust::IssuedBy {
            issuer: signer.issuer.clone(),
        }
    } else {
        Trust::Unknown
    }
}

/// status says what `report` says of the PDF
pub fn status(report: &SignatureReport) -> Status {
    if !report.valid() {
        return Status::Invalid;
    }
    match report.coverage {
        Coverage::WholeFile | Coverage::ValidationData => Status::Valid,
        Coverage::SignedAgainLater => Status::SignedAgainLater,
        Coverage::ChangedAfterSigning => Status::ChangedAfterSigning,
        Coverage::Unknown => Status::Invalid,
    }
}

/// signer_of names who made `report`: the certificate's name, else what the
/// signature says
fn signer_of(report: &SignatureReport) -> Option<String> {
    report
        .signer
        .as_ref()
        .map(|signer| signer.name.clone())
        .or_else(|| report.name.clone())
}

/// end is where `report`'s signed bytes end, if its byte range says
fn end(report: &SignatureReport) -> Option<i64> {
    (report.byte_range.len() == 4)
        .then(|| report.byte_range[2].saturating_add(report.byte_range[3]))
}

/// checked_all makes what the webview shows of a PDF's `reports`, naming
/// for each one signed again later who signed next
pub fn checked_all(
    reports: Vec<SignatureReport>,
    own: Option<&str>,
    trusted: &HashSet<String>,
) -> Vec<CheckedSignature> {
    // (end, name) of every intact signature, by where it ends
    let mut ends: Vec<(i64, Option<String>)> = reports
        .iter()
        .filter(|report| report.valid())
        .filter_map(|report| end(report).map(|end| (end, signer_of(report))))
        .collect();
    ends.sort_by_key(|(end, _)| *end);
    reports
        .into_iter()
        .map(|report| {
            let later = (status(&report) == Status::SignedAgainLater)
                .then(|| end(&report))
                .flatten()
                .and_then(|mine| ends.iter().find(|(end, _)| *end > mine))
                .and_then(|(_, name)| name.clone());
            CheckedSignature {
                later_signer: later,
                ..checked(report, own, trusted)
            }
        })
        .collect()
}

/// checked makes what the webview shows of `report`
pub fn checked(
    report: SignatureReport,
    own: Option<&str>,
    trusted: &HashSet<String>,
) -> CheckedSignature {
    let status = status(&report);
    let trust = report
        .signer
        .as_ref()
        .map_or(Trust::Unknown, |signer| classify(signer, own, trusted));
    let timestamp = report.timestamp.as_deref().and_then(generalized_time);
    let authority = timestamp.as_ref().and(report.timestamp_authority.as_ref());
    CheckedSignature {
        name: signer_of(&report),
        field: report.field,
        timestamped: timestamp.is_some(),
        timestamp_authority: authority.map(|tsa| tsa.name.clone()),
        timestamp_trusted: authority
            .is_some_and(|tsa| matches!(classify(tsa, own, trusted), Trust::Own | Trust::Trusted)),
        weak: report.weak,
        later_signer: None,
        time: timestamp.or_else(|| report.time.as_deref().and_then(pdf_date)),
        reason: report.reason,
        location: report.location,
        status,
        trust,
        certificate: report.signer,
        certificate_der: report.signer_der.map(hex::encode),
    }
}

/// the digits of `text` from `at`, as a number, if it has `count` there
fn digits(text: &str, at: usize, count: usize) -> Option<u32> {
    let part = text.get(at..at + count)?;
    part.bytes()
        .all(|byte| byte.is_ascii_digit())
        .then(|| part.parse().ok())
        .flatten()
}

/// generalized_time writes an ASN.1 GeneralizedTime in UTC, as a timestamp
/// token's genTime ("20261008120000Z", maybe with fractions), in ISO 8601
pub fn generalized_time(text: &str) -> Option<String> {
    let (year, month, day) = (
        digits(text, 0, 4)?,
        digits(text, 4, 2)?,
        digits(text, 6, 2)?,
    );
    let (hour, minute, second) = (
        digits(text, 8, 2)?,
        digits(text, 10, 2)?,
        digits(text, 12, 2)?,
    );
    text.ends_with('Z')
        .then(|| format!("{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}Z"))
}

/// pdf_date writes a PDF date ("D:20261008140000+02'00'", the parts after
/// the year optional) in ISO 8601
pub fn pdf_date(text: &str) -> Option<String> {
    let text = text.strip_prefix("D:").unwrap_or(text);
    let year = digits(text, 0, 4)?;
    let part = |at, default| digits(text, at, 2).unwrap_or(default);
    let (month, day) = (part(4, 1), part(6, 1));
    let (hour, minute, second) = (part(8, 0), part(10, 0), part(12, 0));
    let zone = text.get(14..).unwrap_or("");
    let offset = match zone.chars().next() {
        Some(sign @ ('+' | '-')) => {
            let hours = digits(zone, 1, 2)?;
            let minutes = digits(zone, 4, 2).unwrap_or(0);
            format!("{sign}{hours:02}:{minutes:02}")
        }
        Some('Z') => "Z".into(),
        // a local time of a clock Blank doesn't know: shown as written
        _ => String::new(),
    };
    Some(format!(
        "{year:04}-{month:02}-{day:02}T{hour:02}:{minute:02}:{second:02}{offset}"
    ))
}

/// whether `fingerprint` is one: SHA-256 in capital hex
fn is_fingerprint(fingerprint: &str) -> bool {
    fingerprint.len() == 64
        && fingerprint
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'A'..=b'F').contains(&byte))
}

/// the certificates the user trusts, in `signing` (the signing folder)
pub fn trusted_in(signing: &Path) -> Vec<CertificateInfo> {
    let Ok(entries) = std::fs::read_dir(signing.join(TRUSTED)) else {
        return vec![];
    };
    let mut found: Vec<CertificateInfo> = entries
        .filter_map(|entry| std::fs::read(entry.ok()?.path()).ok())
        .filter_map(|der| CertificateInfo::from_der(&der).ok())
        .collect();
    found.sort_by(|a, b| a.name.cmp(&b.name));
    found
}

/// trusts the certificate `der`, kept in `signing`'s trusted folder by its
/// fingerprint
pub fn trust_in(signing: &Path, der: &[u8]) -> io::Result<CertificateInfo> {
    let info = CertificateInfo::from_der(der).map_err(|_| io::ErrorKind::InvalidData)?;
    let dir = signing.join(TRUSTED);
    std::fs::create_dir_all(&dir)?;
    std::fs::write(dir.join(format!("{}.cer", info.fingerprint)), der)?;
    Ok(info)
}

/// stops trusting the certificate of `fingerprint`
pub fn untrust_in(signing: &Path, fingerprint: &str) -> io::Result<()> {
    if !is_fingerprint(fingerprint) {
        return Err(io::ErrorKind::InvalidInput.into());
    }
    match std::fs::remove_file(signing.join(TRUSTED).join(format!("{fingerprint}.cer"))) {
        Err(error) if error.kind() != io::ErrorKind::NotFound => Err(error),
        _ => Ok(()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn signer(self_signed: bool) -> CertificateInfo {
        CertificateInfo {
            name: "Ada Lovelace".into(),
            issuer: if self_signed {
                "Ada Lovelace"
            } else {
                "DigiCert"
            }
            .into(),
            self_signed,
            fingerprint: "AB".repeat(32),
            ..Default::default()
        }
    }

    #[test]
    fn trusts_the_users_own_and_trusted_certificates_only() {
        let fingerprint = "AB".repeat(32);
        let none = HashSet::new();
        assert_eq!(
            classify(&signer(true), Some(&fingerprint), &none),
            Trust::Own
        );
        let trusted = HashSet::from([fingerprint.clone()]);
        assert_eq!(classify(&signer(true), None, &trusted), Trust::Trusted);
        assert_eq!(classify(&signer(true), None, &none), Trust::Unknown);
        assert_eq!(
            classify(&signer(false), None, &none),
            Trust::IssuedBy {
                issuer: "DigiCert".into()
            }
        );
    }

    #[test]
    fn says_what_a_signature_says_of_the_pdf() {
        let report = |coverage, passed| SignatureReport {
            checks: vec![("check", passed, String::new())],
            coverage,
            ..Default::default()
        };
        assert_eq!(status(&report(Coverage::WholeFile, true)), Status::Valid);
        assert_eq!(
            status(&report(Coverage::ValidationData, true)),
            Status::Valid
        );
        assert_eq!(
            status(&report(Coverage::SignedAgainLater, true)),
            Status::SignedAgainLater
        );
        assert_eq!(
            status(&report(Coverage::ChangedAfterSigning, true)),
            Status::ChangedAfterSigning
        );
        assert_eq!(status(&report(Coverage::WholeFile, false)), Status::Invalid);
        assert_eq!(status(&report(Coverage::Unknown, true)), Status::Invalid);
    }

    #[test]
    fn shows_the_timestamps_time_else_the_signers_clock() {
        let report = SignatureReport {
            checks: vec![("check", true, String::new())],
            coverage: Coverage::WholeFile,
            name: Some("from the dictionary".into()),
            time: Some("D:20261008140000+02'00'".into()),
            ..Default::default()
        };
        let shown = checked(report, None, &HashSet::new());
        assert_eq!(shown.name.as_deref(), Some("from the dictionary"));
        assert_eq!(shown.time.as_deref(), Some("2026-10-08T14:00:00+02:00"));
        assert!(!shown.timestamped);
        assert_eq!(shown.trust, Trust::Unknown);

        let report = SignatureReport {
            signer: Some(signer(true)),
            timestamp: Some("20261008120000.5Z".into()),
            time: Some("D:20261008140000+02'00'".into()),
            ..Default::default()
        };
        let shown = checked(report, None, &HashSet::new());
        assert_eq!(shown.name.as_deref(), Some("Ada Lovelace"));
        assert_eq!(shown.time.as_deref(), Some("2026-10-08T12:00:00Z"));
        assert!(shown.timestamped);
        assert_eq!(shown.status, Status::Invalid);
    }

    #[test]
    fn reads_the_dates_of_pdfs() {
        assert_eq!(pdf_date("D:2026").as_deref(), Some("2026-01-01T00:00:00"));
        assert_eq!(
            pdf_date("D:20261008140000").as_deref(),
            Some("2026-10-08T14:00:00")
        );
        assert_eq!(
            pdf_date("D:20261008093000-05'30'").as_deref(),
            Some("2026-10-08T09:30:00-05:30")
        );
        assert_eq!(
            pdf_date("D:20261008093000Z").as_deref(),
            Some("2026-10-08T09:30:00Z")
        );
        assert_eq!(pdf_date("yesterday"), None);
        assert_eq!(generalized_time("2026100812"), None);
    }

    #[test]
    fn keeps_the_trusted_certificates_by_their_fingerprints() {
        let (_, identity) =
            crate::signing::keys::create_certificate_with("Grace Hopper", None, "pass", 1).unwrap();
        let dir = tempfile::tempdir().unwrap();
        assert!(trusted_in(dir.path()).is_empty());

        let info = trust_in(dir.path(), &identity.cert).unwrap();
        assert_eq!(trusted_in(dir.path())[0].fingerprint, info.fingerprint);
        assert!(trust_in(dir.path(), b"not a certificate").is_err());

        untrust_in(dir.path(), &info.fingerprint).unwrap();
        assert!(trusted_in(dir.path()).is_empty());
        assert!(untrust_in(dir.path(), "../key.p12").is_err());
    }
}

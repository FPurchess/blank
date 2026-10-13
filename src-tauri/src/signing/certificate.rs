//! What Blank shows of a certificate: the user's own in Settings, and a
//! signer's when it checks a signature.

use der::asn1::{BmpString, PrintableStringRef, Utf8StringRef};
use der::{Decode, Tag, Tagged};
use serde::Serialize;
use sha2::{Digest, Sha256};
use x509_cert::name::Name;
use x509_cert::Certificate;

/// id-at-commonName
const COMMON_NAME: const_oid::ObjectIdentifier = const_oid::db::rfc4519::CN;

/// what Blank shows of a certificate; the webview reads these names
#[derive(Debug, Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CertificateInfo {
    /// its subject's common name, e.g. "Ada Lovelace", or the whole subject
    /// when it has none
    pub name: String,
    /// its issuer's common name, or the whole issuer
    pub issuer: String,
    pub not_before: String,
    pub not_after: String,
    /// whether it was issued by itself
    pub self_signed: bool,
    /// SHA-256 of the certificate, in capital hex
    pub fingerprint: String,
}

impl CertificateInfo {
    /// of describes `certificate`, whose DER is `der`
    pub fn of(certificate: &Certificate, der: &[u8]) -> Self {
        let tbs = &certificate.tbs_certificate;
        CertificateInfo {
            name: common_name(&tbs.subject).unwrap_or_else(|| tbs.subject.to_string()),
            issuer: common_name(&tbs.issuer).unwrap_or_else(|| tbs.issuer.to_string()),
            not_before: tbs.validity.not_before.to_string(),
            not_after: tbs.validity.not_after.to_string(),
            self_signed: tbs.subject == tbs.issuer,
            fingerprint: hex::encode_upper(Sha256::digest(der)),
        }
    }

    /// from_der describes the certificate `der`
    pub fn from_der(der: &[u8]) -> der::Result<Self> {
        Ok(Self::of(&Certificate::from_der(der)?, der))
    }
}

/// common_name returns the last (most specific) common name of `name`, as
/// it is: a name with a comma, "Lovelace, Ada", stays one name
pub fn common_name(name: &Name) -> Option<String> {
    name.0
        .iter()
        .flat_map(|rdn| rdn.0.iter())
        .rev()
        .filter(|attribute| attribute.oid == COMMON_NAME)
        .find_map(|attribute| {
            let value = &attribute.value;
            match value.tag() {
                Tag::Utf8String => value
                    .decode_as::<Utf8StringRef>()
                    .ok()
                    .map(|text| text.to_string()),
                Tag::PrintableString => value
                    .decode_as::<PrintableStringRef>()
                    .ok()
                    .map(|text| text.to_string()),
                Tag::BmpString => value
                    .decode_as::<BmpString>()
                    .ok()
                    .map(|text| text.to_string()),
                _ => None,
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::str::FromStr;

    #[test]
    fn keeps_a_common_name_with_a_comma_whole() {
        let name = Name::from_str("CN=Lovelace\\, Ada,O=Analytical Engines").unwrap();
        assert_eq!(common_name(&name).as_deref(), Some("Lovelace, Ada"));
    }

    #[test]
    fn has_no_common_name_without_one() {
        let name = Name::from_str("O=Analytical Engines").unwrap();
        assert_eq!(common_name(&name), None);
    }
}

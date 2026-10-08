//! signing PDFs with the user's certificate: PAdES (ETSI EN 319 142-1)
//! signatures appended to a PDF as an incremental update, so the bytes
//! before them never change. See .claude/rules/signing.md.
//!
//! - `keys`: the user's certificate and key, kept in a PKCS#12 file
//! - `certificate`: what Blank shows of a certificate
//! - `commands`: what the webview asks for: the certificate, signing
//! - `cms`: the CMS SignedData over the PDF's byte ranges (B-B)
//! - `tsa`: an RFC 3161 timestamp of the signature (B-T)
//! - `pdf`: loading a PDF for an update, and signing it
//! - `verify`: checking the signatures of a PDF
//! - `der`: the bits of DER the crates don't do for us

pub mod certificate;
mod cms;
pub mod commands;
mod der;
mod keys;
mod pdf;
mod tsa;
pub mod verify;

/// why signing stopped, where the user is told more than that it failed.
/// It travels in an anyhow::Error (`downcast_ref`), and its text is a
/// sentence for the user, which never quotes the PDF or the key.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    /// the PDF is encrypted, or has restrictions set by its author
    Restricted,
    /// a certified PDF that allows no changes (DocMDP P=1)
    Certified,
    /// the timestamp server can't be reached or didn't answer
    NoTimestamp,
    /// the timestamp server answered, and refused
    TimestampRefused,
    /// the timestamp server's answer isn't a token for this signature
    TimestampUnusable,
}

impl std::fmt::Display for Refusal {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Refusal::Restricted => {
                "This PDF has restrictions set by its author. Blank can't sign it yet."
            }
            Refusal::Certified => "This PDF doesn't allow any changes, not even signatures",
            Refusal::NoTimestamp => "The timestamp server didn't answer",
            Refusal::TimestampRefused => "The timestamp server refused to timestamp the signature",
            Refusal::TimestampUnusable => "The timestamp server's answer can't be used",
        })
    }
}

impl std::error::Error for Refusal {}

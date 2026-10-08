//! Signing PDFs with the user's certificate: PAdES (ETSI EN 319 142-1)
//! signatures appended to a PDF as an incremental update, so the bytes
//! before them never change. See .claude/rules/signing.md.
//!
//! - `keys`: the user's certificate and key, kept in a PKCS#12 file
//! - `commands`: what the webview asks for: the certificate, signing
//! - `cms`: the CMS SignedData over the PDF's byte ranges (B-B)
//! - `tsa`: an RFC 3161 timestamp of the signature (B-T)
//! - `pdf`: loading a PDF for an update, and signing it
//! - `verify`: checking the signatures of a PDF
//! - `der`: the bits of DER the crates don't do for us

pub mod cms;
pub mod commands;
pub mod der;
pub mod keys;
pub mod pdf;
pub mod tsa;
pub mod verify;

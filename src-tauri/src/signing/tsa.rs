//! RFC 3161: asks a timestamp server for a token over a hash, so a signature
//! shows when it was made from a trusted clock (PAdES B-T). Only the SHA-256
//! of the signature value leaves the computer.

use anyhow::{bail, Context, Result};
use sha2::{Digest, Sha256};

use crate::signing::der as d;

/// how long the server may take, in seconds
const TIMEOUT: u64 = 20;
/// the longest answer read
const MAX_RESPONSE: usize = 1 << 20;

/// the request for SHA-256(`data`), with `nonce`
fn request(data: &[u8], nonce: &[u8; 8]) -> (Vec<u8>, Vec<u8>) {
    let hash = Sha256::digest(data);
    let sha256 = d::seq(&[&d::tlv(
        0x06,
        &[0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01],
    )]);
    let imprint = d::seq(&[&sha256, &d::octets(&hash)]);
    let nonce_der = d::uint(nonce);
    // version 1, the imprint, the nonce, and certReq: the token carries the
    // server's certificate
    let request = d::seq(&[&d::uint(&[1]), &imprint, &nonce_der, &d::tlv(0x01, &[0xff])]);
    (request, nonce_der)
}

/// token reads the TimeStampToken (a DER ContentInfo) out of a server's
/// TimeStampResp, checking its status and that it carries our nonce
pub fn token(body: &[u8], nonce_der: &[u8]) -> Result<Vec<u8>> {
    // TimeStampResp ::= SEQUENCE { status PKIStatusInfo, timeStampToken ContentInfo OPTIONAL }
    let (outer, _) = d::read(body).context("the timestamp server's answer isn't DER")?;
    let parts =
        d::children(outer.content).context("the timestamp server's answer can't be read")?;
    let status = parts
        .first()
        .and_then(|s| d::children(s.content))
        .context("the timestamp server's answer has no status")?;
    let code = status
        .first()
        .map(|i| i.content.last().copied().unwrap_or(255))
        .unwrap_or(255);
    if code > 1 {
        bail!("the timestamp server refused (status {code})");
    }
    let token = parts.get(1).context("the timestamp server sent no token")?;
    if !token.raw.windows(nonce_der.len()).any(|w| w == nonce_der) {
        bail!("the timestamp server's token isn't for this request");
    }
    Ok(token.raw.to_vec())
}

/// timestamp returns the token of the server at `url` for SHA-256(`data`)
pub async fn timestamp(url: &str, data: &[u8]) -> Result<Vec<u8>> {
    let nonce: [u8; 8] = rand_core::RngCore::next_u64(&mut rand_core::OsRng).to_be_bytes();
    let (request, nonce_der) = request(data, &nonce);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(TIMEOUT))
        .build()?;
    let response = client
        .post(url)
        .header("Content-Type", "application/timestamp-query")
        .body(request)
        .send()
        .await
        .context("The timestamp server didn't answer")?
        .error_for_status()
        .context("The timestamp server didn't answer")?;
    let body = response
        .bytes()
        .await
        .context("The timestamp server didn't answer")?;
    if body.len() > MAX_RESPONSE {
        bail!("the timestamp server's answer is too long");
    }
    token(&body, &nonce_der)
}

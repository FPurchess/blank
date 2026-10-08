//! RFC 3161: asks a timestamp server for a token over a hash, so a signature
//! shows when it was made from a trusted clock (PAdES B-T). Only the SHA-256
//! of the signature value leaves the computer.

use std::time::Duration;

use anyhow::{Context, Result};
use sha2::{Digest, Sha256};

use crate::signing::der as d;
use crate::signing::Refusal;

/// how long connecting to the server may take
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);
/// how long the server may take to answer
const TIMEOUT: Duration = Duration::from_secs(20);
/// the longest answer read
const MAX_RESPONSE: usize = 1 << 20;

/// request is the request for SHA-256(`data`) with `nonce`, and the nonce
/// as DER, which the answer must carry
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
fn token(body: &[u8], nonce_der: &[u8]) -> Result<Vec<u8>> {
    // TimeStampResp ::= SEQUENCE { status PKIStatusInfo, timeStampToken ContentInfo OPTIONAL }
    let (outer, _) = d::read(body).context(Refusal::TimestampUnusable)?;
    let parts = d::children(outer.content).context(Refusal::TimestampUnusable)?;
    let status = parts
        .first()
        .and_then(|s| d::children(s.content))
        .context(Refusal::TimestampUnusable)?;
    // PKIStatus: 0 granted, 1 granted with modifications, 2 rejection, …
    let code = status
        .first()
        .filter(|code| code.tag == 0x02)
        .and_then(|code| code.content.last().copied())
        .context(Refusal::TimestampUnusable)?;
    if code > 1 {
        return Err(Refusal::TimestampRefused.into());
    }
    let token = parts.get(1).context(Refusal::TimestampUnusable)?;
    if !token.raw.windows(nonce_der.len()).any(|w| w == nonce_der) {
        return Err(Refusal::TimestampUnusable.into());
    }
    Ok(token.raw.to_vec())
}

/// timestamp returns the token of the server at `url` for SHA-256(`data`)
pub async fn timestamp(url: &str, data: &[u8]) -> Result<Vec<u8>> {
    let nonce: [u8; 8] = rand_core::RngCore::next_u64(&mut rand_core::OsRng).to_be_bytes();
    let (request, nonce_der) = request(data, &nonce);
    let client = crate::http::client(CONNECT_TIMEOUT, TIMEOUT);
    let response = client
        .post(url)
        .header("Content-Type", "application/timestamp-query")
        .body(request)
        .send()
        .await
        .context(Refusal::NoTimestamp)?
        .error_for_status()
        .context(Refusal::NoTimestamp)?;
    let body = response.bytes().await.context(Refusal::NoTimestamp)?;
    if body.len() > MAX_RESPONSE {
        return Err(Refusal::TimestampUnusable.into());
    }
    token(&body, &nonce_der)
}

#[cfg(test)]
mod tests {
    use super::*;

    const NONCE: [u8; 8] = [0x12, 0x34, 0x56, 0x78, 0x9a, 0xbc, 0xde, 0xf0];

    /// an answer of `status` with a token that carries `nonce`: a
    /// ContentInfo whose TSTInfo is cut down to the nonce, all token reads
    fn answer(status: u8, nonce: &[u8; 8]) -> Vec<u8> {
        let status = d::seq(&[&d::uint(&[status])]);
        let token = d::seq(&[
            &d::tlv(
                0x06,
                &[0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x07, 0x02],
            ),
            &d::tlv(0xa0, &d::seq(&[&d::uint(nonce)])),
        ]);
        d::seq(&[&status, &token])
    }

    fn refusal(result: Result<Vec<u8>>) -> Option<Refusal> {
        result.err()?.downcast_ref::<Refusal>().copied()
    }

    #[test]
    fn takes_the_token_of_a_granted_request() {
        let (_, nonce_der) = request(b"signature", &NONCE);
        let body = answer(0, &NONCE);
        let token = token(&body, &nonce_der).unwrap();
        assert_eq!(token[0], 0x30);
        assert!(body.ends_with(&token));
    }

    #[test]
    fn says_when_the_server_refused() {
        let (_, nonce_der) = request(b"signature", &NONCE);
        assert_eq!(
            refusal(token(&answer(2, &NONCE), &nonce_der)),
            Some(Refusal::TimestampRefused)
        );
    }

    #[test]
    fn refuses_a_token_for_another_request() {
        let (_, nonce_der) = request(b"signature", &NONCE);
        assert_eq!(
            refusal(token(&answer(0, &[7; 8]), &nonce_der)),
            Some(Refusal::TimestampUnusable)
        );
    }

    #[test]
    fn refuses_an_answer_that_isnt_der() {
        let (_, nonce_der) = request(b"signature", &NONCE);
        assert_eq!(
            refusal(token(b"<html>busy</html>", &nonce_der)),
            Some(Refusal::TimestampUnusable)
        );
    }

    #[test]
    fn fails_without_a_server_instead_of_panicking() {
        // nothing listens on the discard port: the connection is refused
        let result = tauri::async_runtime::block_on(timestamp("http://127.0.0.1:9/", b"x"));
        assert_eq!(refusal(result), Some(Refusal::NoTimestamp));
    }
}

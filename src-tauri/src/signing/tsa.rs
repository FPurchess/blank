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
    token(&read_limited(response).await?, &nonce_der)
}

/// read_limited reads an answer of at most MAX_RESPONSE bytes, stopping as
/// soon as it says or turns out to be longer
async fn read_limited(mut response: reqwest::Response) -> Result<Vec<u8>> {
    if response
        .content_length()
        .is_some_and(|length| length > MAX_RESPONSE as u64)
    {
        return Err(Refusal::TimestampUnusable.into());
    }
    let mut body = Vec::new();
    while let Some(chunk) = response.chunk().await.context(Refusal::NoTimestamp)? {
        if body.len() + chunk.len() > MAX_RESPONSE {
            return Err(Refusal::TimestampUnusable.into());
        }
        body.extend_from_slice(&chunk);
    }
    Ok(body)
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

    /// serve answers every request with `body`, its length told or, with
    /// `chunked`, not, and returns the server's URL
    fn serve(body: Vec<u8>, chunked: bool) -> String {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let url = format!("http://{}/", server.server_addr().to_ip().unwrap());
        std::thread::spawn(move || {
            for request in server.incoming_requests() {
                let length = (!chunked).then_some(body.len());
                let reader = std::io::Cursor::new(body.clone());
                let response = tiny_http::Response::new(200.into(), vec![], reader, length, None);
                let _ = request.respond(response);
            }
        });
        url
    }

    #[test]
    fn refuses_an_answer_too_long_whether_its_length_is_told_or_not() {
        let long = vec![0x30; MAX_RESPONSE + 1];
        for chunked in [false, true] {
            let url = serve(long.clone(), chunked);
            let result = tauri::async_runtime::block_on(timestamp(&url, b"x"));
            assert_eq!(refusal(result), Some(Refusal::TimestampUnusable));
        }
    }

    #[test]
    fn reads_an_answer_in_chunks() {
        // a granted answer, but for another nonce than the request's
        let url = serve(answer(0, &NONCE), true);
        let result = tauri::async_runtime::block_on(timestamp(&url, b"x"));
        assert_eq!(refusal(result), Some(Refusal::TimestampUnusable));
        // a refusal is read in full
        let url = serve(answer(2, &NONCE), true);
        let result = tauri::async_runtime::block_on(timestamp(&url, b"x"));
        assert_eq!(refusal(result), Some(Refusal::TimestampRefused));
    }

    #[test]
    fn stops_reading_an_answer_longer_than_any_token() {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let url = format!("http://{}/", listener.local_addr().unwrap());
        // an answer that doesn't say its length, longer than MAX_RESPONSE
        let server = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0; 4096];
            let _ = stream.read(&mut request);
            let _ = stream.write_all(
                b"HTTP/1.1 200 OK\r\nContent-Type: application/timestamp-reply\r\nConnection: close\r\n\r\n",
            );
            let chunk = vec![0x30; 64 * 1024];
            for _ in 0..(2 * MAX_RESPONSE / chunk.len()) {
                if stream.write_all(&chunk).is_err() {
                    break;
                }
            }
        });
        let result = tauri::async_runtime::block_on(timestamp(&url, b"x"));
        assert_eq!(refusal(result), Some(Refusal::TimestampUnusable));
        server.join().unwrap();
    }

    #[test]
    fn fails_without_a_server_instead_of_panicking() {
        // nothing listens on the discard port: the connection is refused
        let result = tauri::async_runtime::block_on(timestamp("http://127.0.0.1:9/", b"x"));
        assert_eq!(refusal(result), Some(Refusal::NoTimestamp));
    }
}

//! The HTTP client of Blank's own requests: dictionary downloads
//! (spellcheck/download.rs) and timestamps (signing/tsa.rs).

use std::time::Duration;

/// client returns a client that gives up on connecting after
/// `connect_timeout` and on the whole request after `timeout`. It installs
/// rustls' crypto provider first: reqwest is built without one
/// (`rustls-no-provider`), and a client without it panics on its first
/// HTTPS request.
pub fn client(connect_timeout: Duration, timeout: Duration) -> reqwest::Client {
    // rustls with ring builds without extra tools on every platform; a
    // second install fails harmlessly, the provider is already there
    let _ = rustls::crypto::ring::default_provider().install_default();
    reqwest::Client::builder()
        .connect_timeout(connect_timeout)
        .timeout(timeout)
        .build()
        .expect("failed to set up the HTTP client")
}

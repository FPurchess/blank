//! keys and certificates: a P-256 key and a self-signed certificate made
//! with rcgen and kept in a PKCS#12 file (p12-keystore), and reading any
//! PKCS#12 file a user has.

use anyhow::Result;
use der::{Decode, Encode};
use p12_keystore::error::Error as P12Error;
use p12_keystore::{EncryptionAlgorithm, KeyStore, KeyStoreEntry, MacAlgorithm, PrivateKeyChain};
use pkcs12::pfx::Pfx;
use rcgen::{
    CertificateParams, DnType, ExtendedKeyUsagePurpose, IsCa, KeyPair, KeyUsagePurpose, SanType,
    PKCS_ECDSA_P256_SHA256,
};
use sha2::{Digest, Sha256};
use x509_cert::Certificate;

/// a private key Blank can sign with
pub enum Key {
    P256(p256::ecdsa::SigningKey),
    P384(p384::ecdsa::SigningKey),
    Rsa(rsa::RsaPrivateKey),
}

/// a key and its certificate, as a key file holds them
pub struct Identity {
    pub key: Key,
    /// DER of the signer's certificate
    pub cert: Vec<u8>,
    /// DER of the other certificates in the file (issuers), if any
    pub chain: Vec<Vec<u8>>,
}

/// why a key file doesn't open. Its text is fixed, so it may be logged.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OpenError {
    /// the passphrase doesn't open the file
    WrongPassphrase,
    /// a PKCS#12 file, but not one Blank can sign with: an algorithm it
    /// doesn't know, no key, no certificate for the key
    Unsupported,
    /// not a PKCS#12 file, or a broken one
    Malformed,
}

impl std::fmt::Display for OpenError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            OpenError::WrongPassphrase => "wrong passphrase",
            OpenError::Unsupported => "a key file Blank can't use",
            OpenError::Malformed => "not a key file Blank can read",
        })
    }
}

impl std::error::Error for OpenError {}

/// id-kp-documentSigning (RFC 9336)
const DOCUMENT_SIGNING: &[u64] = &[1, 3, 6, 1, 5, 5, 7, 3, 36];
/// Microsoft Document Signing
const MS_DOCUMENT_SIGNING: &[u64] = &[1, 3, 6, 1, 4, 1, 311, 10, 3, 12];

/// the rounds of PBKDF2 that protect the key file: OWASP's advice for
/// PBKDF2-HMAC-SHA256, about a second to open the file
const ITERATIONS: u64 = 600_000;

/// the most rounds of a key file's MAC Blank goes through: more is no
/// protection but a file that takes hours to open
const MAX_ITERATIONS: i32 = 10_000_000;

/// create_certificate makes a P-256 key and a self-signed certificate for
/// signing documents. It returns them as a PKCS#12 file (AES-256-CBC and
/// PBKDF2, an HMAC-SHA256 MAC) that `passphrase` opens, and as the identity
/// the file holds, so they needn't be read back from it.
pub fn create_certificate(
    name: &str,
    email: Option<&str>,
    passphrase: &str,
) -> Result<(Vec<u8>, Identity)> {
    create_certificate_with(name, email, passphrase, ITERATIONS)
}

/// create_certificate_with is create_certificate with the rounds of PBKDF2
/// given, which the tests keep low
pub fn create_certificate_with(
    name: &str,
    email: Option<&str>,
    passphrase: &str,
    iterations: u64,
) -> Result<(Vec<u8>, Identity)> {
    let key = KeyPair::generate_for(&PKCS_ECDSA_P256_SHA256)?;
    let mut params = CertificateParams::new(Vec::<String>::new())?;
    params.distinguished_name.push(DnType::CommonName, name);
    if let Some(email) = email {
        params
            .subject_alt_names
            .push(SanType::Rfc822Name(email.try_into()?));
    }
    let now = time::OffsetDateTime::now_utc();
    params.not_before = now - time::Duration::minutes(5);
    params.not_after = now + time::Duration::days(5 * 365);
    params.is_ca = IsCa::ExplicitNoCa;
    params.key_usages = vec![
        KeyUsagePurpose::DigitalSignature,
        KeyUsagePurpose::ContentCommitment,
    ];
    params.extended_key_usages = vec![
        ExtendedKeyUsagePurpose::EmailProtection,
        ExtendedKeyUsagePurpose::Other(DOCUMENT_SIGNING.to_vec()),
        ExtendedKeyUsagePurpose::Other(MS_DOCUMENT_SIGNING.to_vec()),
    ];
    params.use_authority_key_identifier_extension = true;
    let cert = params.self_signed(&key)?;

    let cert_der = cert.der().to_vec();
    let key_der = key.serialize_der();
    let signing_key = {
        use p256::pkcs8::DecodePrivateKey;
        p256::ecdsa::SigningKey::from_pkcs8_der(&key_der)?
    };
    let local_key_id = Sha256::digest(&cert_der)[..20].to_vec();
    let chain = PrivateKeyChain::new(
        key_der,
        local_key_id,
        [p12_keystore::Certificate::from_der(&cert_der)?],
    );
    let mut store = KeyStore::new();
    store.add_entry(name, KeyStoreEntry::PrivateKeyChain(chain));
    let p12 = store
        .writer(passphrase)
        .encryption_algorithm(EncryptionAlgorithm::PbeWithHmacSha256AndAes256)
        .encryption_iterations(iterations)
        .mac_algorithm(MacAlgorithm::HmacSha256)
        .mac_iterations(iterations)
        .write()?;
    let identity = Identity {
        key: Key::P256(signing_key),
        cert: cert_der,
        chain: vec![],
    };
    Ok((p12, identity))
}

/// load_p12 opens the PKCS#12 file `data` with `passphrase`: its key, the
/// certificate of that key, and the other certificates as its chain
pub fn load_p12(data: &[u8], passphrase: &str) -> Result<Identity, OpenError> {
    let pfx = Pfx::from_der(data).ok();
    if pfx.as_ref().is_some_and(|pfx| !rounds_allowed(pfx)) {
        return Err(OpenError::Unsupported);
    }
    let has_mac = pfx.is_some_and(|pfx| pfx.mac_data.is_some());
    let store = match KeyStore::from_pkcs12(data, passphrase) {
        Ok(store) => store,
        Err(P12Error::DerError(error)) if error.kind() == der::ErrorKind::IndefiniteLength => {
            open_ber(data, passphrase)?
        }
        Err(error) => return Err(classify(error, has_mac)),
    };
    let (_, chain) = store.private_key_chain().ok_or(OpenError::Unsupported)?;
    let mut certs: Vec<Vec<u8>> = chain.chain().iter().map(|c| c.as_der().to_vec()).collect();
    let key = parse_pkcs8(chain.key()).ok_or(OpenError::Unsupported)?;
    // the signer's certificate is the one whose public key matches the key
    let spki = public_key_der(&key).ok_or(OpenError::Malformed)?;
    let index = certs
        .iter()
        .position(|c| {
            Certificate::from_der(c)
                .ok()
                .and_then(|c| c.tbs_certificate.subject_public_key_info.to_der().ok())
                .is_some_and(|d| d == spki)
        })
        .ok_or(OpenError::Unsupported)?;
    let cert = certs.remove(index);
    Ok(Identity {
        key,
        cert,
        chain: certs,
    })
}

/// classify tells why p12-keystore couldn't open a file; `has_mac`, whether
/// the file has a MAC, which says whether the passphrase is right before
/// anything is decrypted
fn classify(error: P12Error, has_mac: bool) -> OpenError {
    use P12Error as E;
    match error {
        E::MacError(_) => OpenError::WrongPassphrase,
        // without a MAC, only decrypting tells: what the wrong key decrypts
        // isn't padded right
        E::UnpadError | E::Pkcs5Error(_) if !has_mac => OpenError::WrongPassphrase,
        E::UnsupportedEncryptionScheme
        | E::UnsupportedMacAlgorithm
        | E::UnsupportedContentType
        | E::UnsupportedCertificateType
        | E::Pkcs5Error(_) => OpenError::Unsupported,
        _ => OpenError::Malformed,
    }
}

/// rounds_allowed tells whether the rounds of the file's MAC are sensible
fn rounds_allowed(pfx: &Pfx) -> bool {
    pfx.mac_data
        .as_ref()
        .is_none_or(|mac| (1..=MAX_ITERATIONS).contains(&mac.iterations))
}

/// parse_pkcs8 reads a PKCS#8 private key of a kind Blank signs with
fn parse_pkcs8(der: &[u8]) -> Option<Key> {
    use p256::pkcs8::DecodePrivateKey;
    if let Ok(k) = p256::ecdsa::SigningKey::from_pkcs8_der(der) {
        return Some(Key::P256(k));
    }
    if let Ok(k) = p384::ecdsa::SigningKey::from_pkcs8_der(der) {
        return Some(Key::P384(k));
    }
    rsa::RsaPrivateKey::from_pkcs8_der(der).ok().map(Key::Rsa)
}

/// public_key_der is the SubjectPublicKeyInfo of `key`, as DER
fn public_key_der(key: &Key) -> Option<Vec<u8>> {
    use spki::EncodePublicKey;
    let der = match key {
        Key::P256(k) => k.verifying_key().to_public_key_der(),
        Key::P384(k) => k.verifying_key().to_public_key_der(),
        Key::Rsa(k) => k.to_public_key().to_public_key_der(),
    };
    der.ok().map(|der| der.into_vec())
}

/// open_ber opens a PKCS#12 file in BER, as NSS (Firefox, Thunderbird)
/// writes them, which p12-keystore reads only as DER
fn open_ber(data: &[u8], passphrase: &str) -> Result<KeyStore, OpenError> {
    use crate::signing::der as d;
    let bad = OpenError::Malformed;
    // the outer layers as DER, the content as it is: the MAC is over the
    // content's bytes, BER or not
    let shallow = d::ber_to_der(data, false, true).ok_or(bad)?;
    let pfx = Pfx::from_der(&shallow).map_err(|_| bad)?;
    if pfx.mac_data.is_none() {
        // without a MAC, the BER can't be checked before it is converted
        return Err(OpenError::Unsupported);
    }
    if !rounds_allowed(&pfx) {
        return Err(OpenError::Unsupported);
    }
    // p12-keystore checks the MAC, and then can't read the BER inside: that
    // the passphrase is right. (Its KDF is optimized in debug builds, see
    // Cargo.toml; one called from here wouldn't be.)
    match KeyStore::from_pkcs12(&shallow, passphrase) {
        Ok(store) => return Ok(store),
        Err(P12Error::DerError(_)) => {}
        Err(error) => return Err(classify(error, true)),
    }
    // PFX ::= SEQUENCE { version, authSafe ContentInfo, macData MacData
    // OPTIONAL }: the content made DER, without the MAC, which would only
    // be checked again
    let (outer, _) = d::read(&shallow).ok_or(bad)?;
    let parts = d::children(outer.content).ok_or(bad)?;
    let [version, auth_safe, _] = parts.as_slice() else {
        return Err(bad);
    };
    let ci = d::children(auth_safe.content).ok_or(bad)?;
    let explicit = ci.get(1).ok_or(bad)?;
    let (octets, _) = d::read(explicit.content).ok_or(bad)?;
    let inner = d::ber_to_der(octets.content, true, true).ok_or(bad)?;
    let new_ci = d::seq(&[ci[0].raw, &d::tlv(0xa0, &d::octets(&inner))]);
    let der = d::seq(&[version.raw, &new_ci]);
    KeyStore::from_pkcs12(&der, passphrase).map_err(|error| classify(error, true))
}

#[cfg(test)]
mod tests;

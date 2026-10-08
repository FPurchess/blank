//! Keys and certificates: a P-256 self-signed certificate made with rcgen and
//! kept in a PKCS#12 file (p12-keystore), and reading any PKCS#12 a user has.

use anyhow::{anyhow, bail, Context, Result};
use der::{Decode, Encode};
use p12_keystore::{EncryptionAlgorithm, KeyStore, KeyStoreEntry, MacAlgorithm, PrivateKeyChain};
use rcgen::{
    CertificateParams, DnType, ExtendedKeyUsagePurpose, IsCa, KeyPair, KeyUsagePurpose, SanType,
    PKCS_ECDSA_P256_SHA256,
};
use sha2::{Digest, Sha256};
use x509_cert::Certificate;

pub enum Key {
    P256(p256::ecdsa::SigningKey),
    P384(p384::ecdsa::SigningKey),
    Rsa(rsa::RsaPrivateKey),
}

impl Key {
    pub fn describe(&self) -> &'static str {
        match self {
            Key::P256(_) => "ECDSA P-256",
            Key::P384(_) => "ECDSA P-384",
            Key::Rsa(_) => "RSA",
        }
    }
}

pub struct Identity {
    pub key: Key,
    /// DER of the signer's certificate
    pub cert: Vec<u8>,
    /// DER of the other certificates in the file (issuers), if any
    pub chain: Vec<Vec<u8>>,
}

/// id-kp-documentSigning (RFC 9336)
pub const DOCUMENT_SIGNING: &[u64] = &[1, 3, 6, 1, 5, 5, 7, 3, 36];
/// Microsoft Document Signing
pub const MS_DOCUMENT_SIGNING: &[u64] = &[1, 3, 6, 1, 4, 1, 311, 10, 3, 12];

/// Makes a P-256 key and a self-signed certificate for signing documents, and
/// returns them as a PKCS#12 file (AES-256-CBC + PBKDF2, HMAC-SHA256 MAC).
pub fn create_certificate(name: &str, email: Option<&str>, passphrase: &str) -> Result<Vec<u8>> {
    create_certificate_with(name, email, passphrase, ITERATIONS)
}

/// the rounds of PBKDF2 that protect the key file: OWASP's advice for
/// PBKDF2-HMAC-SHA256, about a second to open the file
const ITERATIONS: u64 = 600_000;

/// create_certificate with the rounds of PBKDF2 given, which the tests keep
/// low
pub fn create_certificate_with(
    name: &str,
    email: Option<&str>,
    passphrase: &str,
    iterations: u64,
) -> Result<Vec<u8>> {
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
    Ok(p12)
}

pub fn load_p12(data: &[u8], passphrase: &str) -> Result<Identity> {
    let store = match KeyStore::from_pkcs12(data, passphrase) {
        Ok(s) => s,
        Err(e) if e.to_string().contains("indefinite length") => {
            // BER, as NSS (Firefox, Thunderbird) writes it: check the MAC on the
            // original bytes, convert to DER, MAC it again for p12-keystore
            let der = normalize_ber_p12(data, passphrase)?;
            KeyStore::from_pkcs12(&der, passphrase)
                .map_err(|e| anyhow!("can't open the PKCS#12 file: {e}"))?
        }
        Err(e) => bail!("can't open the PKCS#12 file: {e}"),
    };
    let (_, chain) = store
        .private_key_chain()
        .ok_or_else(|| anyhow!("the PKCS#12 file holds no private key"))?;
    let certs: Vec<Vec<u8>> = chain.chain().iter().map(|c| c.as_der().to_vec()).collect();
    if certs.is_empty() {
        bail!("the PKCS#12 file holds a key but no certificate for it");
    }
    let key = parse_pkcs8(chain.key())?;
    // the signer's certificate is the one whose public key matches the key
    let spki = public_key_der(&key)?;
    let idx = certs
        .iter()
        .position(|c| {
            Certificate::from_der(c)
                .ok()
                .and_then(|c| c.tbs_certificate.subject_public_key_info.to_der().ok())
                .is_some_and(|d| d == spki)
        })
        .context("no certificate in the file matches its private key")?;
    let mut certs = certs;
    let cert = certs.remove(idx);
    Ok(Identity {
        key,
        cert,
        chain: certs,
    })
}

fn parse_pkcs8(der: &[u8]) -> Result<Key> {
    use p256::pkcs8::DecodePrivateKey;
    if let Ok(k) = p256::ecdsa::SigningKey::from_pkcs8_der(der) {
        return Ok(Key::P256(k));
    }
    if let Ok(k) = p384::ecdsa::SigningKey::from_pkcs8_der(der) {
        return Ok(Key::P384(k));
    }
    if let Ok(k) = rsa::RsaPrivateKey::from_pkcs8_der(der) {
        return Ok(Key::Rsa(k));
    }
    bail!("unsupported private key type (only P-256, P-384 and RSA)")
}

fn public_key_der(key: &Key) -> Result<Vec<u8>> {
    use spki::EncodePublicKey;
    Ok(match key {
        Key::P256(k) => k.verifying_key().to_public_key_der()?.into_vec(),
        Key::P384(k) => k.verifying_key().to_public_key_der()?.into_vec(),
        Key::Rsa(k) => k.to_public_key().to_public_key_der()?.into_vec(),
    })
}

pub fn fingerprint(cert_der: &[u8]) -> String {
    hex::encode_upper(Sha256::digest(cert_der))
}

fn pkcs12_mac(
    alg: &[u8],
    password: &str,
    salt: &[u8],
    iterations: i32,
    data: &[u8],
) -> Result<Vec<u8>> {
    use hmac::{Hmac, Mac};
    use pkcs12::kdf::{derive_key_utf8, Pkcs12KeyType};
    macro_rules! mac {
        ($h:ty, $n:expr) => {{
            let key = derive_key_utf8::<$h>(password, salt, Pkcs12KeyType::Mac, iterations, $n)?;
            let mut m = <Hmac<$h>>::new_from_slice(&key)?;
            m.update(data);
            m.finalize().into_bytes().to_vec()
        }};
    }
    Ok(match alg {
        // OID content bytes of SHA-1 and SHA-256
        [0x2b, 0x0e, 0x03, 0x02, 0x1a] => mac!(sha1::Sha1, 20),
        [0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x01] => mac!(sha2::Sha256, 32),
        [0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x02] => mac!(sha2::Sha384, 48),
        [0x60, 0x86, 0x48, 0x01, 0x65, 0x03, 0x04, 0x02, 0x03] => mac!(sha2::Sha512, 64),
        _ => bail!("unsupported PKCS#12 MAC algorithm"),
    })
}

/// PFX ::= SEQUENCE { version, authSafe ContentInfo, macData MacData }
fn normalize_ber_p12(data: &[u8], password: &str) -> Result<Vec<u8>> {
    use crate::signing::der as d;
    let bad = || anyhow!("malformed PKCS#12 file");
    let shallow = d::ber_to_der(data, false, true).ok_or_else(bad)?;
    let (pfx, _) = d::read(&shallow).ok_or_else(bad)?;
    let parts = d::children(pfx.content).ok_or_else(bad)?;
    let [version, auth_safe, mac_data] = parts.as_slice() else {
        bail!("PKCS#12 file without a MAC")
    };
    let ci = d::children(auth_safe.content).ok_or_else(bad)?;
    let explicit = ci.get(1).ok_or_else(bad)?;
    let (octets, _) = d::read(explicit.content).ok_or_else(bad)?;
    let original = octets.content;

    // MacData ::= SEQUENCE { mac DigestInfo, macSalt OCTET STRING, iterations INTEGER DEFAULT 1 }
    let md = d::children(mac_data.content).ok_or_else(bad)?;
    let digest_info = d::children(md.first().ok_or_else(bad)?.content).ok_or_else(bad)?;
    let alg = d::children(digest_info.first().ok_or_else(bad)?.content).ok_or_else(bad)?;
    let alg_oid = alg.first().ok_or_else(bad)?.content;
    let tag = digest_info.get(1).ok_or_else(bad)?.content;
    let salt = md.get(1).ok_or_else(bad)?.content;
    let iterations = md
        .get(2)
        .map(|i| i.content.iter().fold(0i32, |a, b| (a << 8) | *b as i32))
        .unwrap_or(1);
    if pkcs12_mac(alg_oid, password, salt, iterations, original)? != tag {
        bail!("can't open the PKCS#12 file: MAC tag mismatch (wrong passphrase?)");
    }
    let inner = d::ber_to_der(original, true, true).ok_or_else(bad)?;
    let new_tag = pkcs12_mac(alg_oid, password, salt, iterations, &inner)?;
    let new_mac = d::seq(&[
        &d::seq(&[digest_info[0].raw, &d::octets(&new_tag)]),
        &md[1..]
            .iter()
            .flat_map(|t| t.raw.to_vec())
            .collect::<Vec<u8>>(),
    ]);
    let new_ci = d::seq(&[ci[0].raw, &d::tlv(0xa0, &d::octets(&inner))]);
    Ok(d::seq(&[version.raw, &new_ci, &new_mac]))
}

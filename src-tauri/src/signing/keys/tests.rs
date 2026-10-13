use super::*;
use crate::signing::certificate::CertificateInfo;

const PASSPHRASE: &str = "correct horse";

/// the key files of fixtures/, see its README
const RSA: &[u8] = include_bytes!("../fixtures/rsa.p12");
const NO_MAC: &[u8] = include_bytes!("../fixtures/nomac.p12");
const LEGACY: &[u8] = include_bytes!("../fixtures/legacy.p12");
const NSS: &[u8] = include_bytes!("../fixtures/nss.p12");

fn name_of(identity: &Identity) -> String {
    CertificateInfo::from_der(&identity.cert).unwrap().name
}

#[test]
fn makes_a_key_file_that_holds_what_it_returns() {
    let (p12, made) = create_certificate_with("Ada Lovelace", None, PASSPHRASE, 1000).unwrap();
    let opened = load_p12(&p12, PASSPHRASE).unwrap();
    assert_eq!(opened.cert, made.cert);
    assert!(matches!(
        (&opened.key, &made.key),
        (Key::P256(a), Key::P256(b)) if a.verifying_key() == b.verifying_key()
    ));
    assert_eq!(name_of(&made), "Ada Lovelace");
}

#[test]
fn opens_an_rsa_key_file_from_openssl() {
    let identity = load_p12(RSA, PASSPHRASE).unwrap();
    assert!(matches!(identity.key, Key::Rsa(_)));
    assert_eq!(name_of(&identity), "Lovelace, Ada");
    assert!(identity.chain.is_empty());
}

#[test]
fn opens_a_legacy_key_file() {
    let identity = load_p12(LEGACY, PASSPHRASE).unwrap();
    assert!(matches!(identity.key, Key::Rsa(_)));
}

#[test]
fn opens_a_key_file_without_a_mac() {
    assert!(load_p12(NO_MAC, PASSPHRASE).is_ok());
}

#[test]
fn opens_a_ber_key_file_from_nss() {
    // 600,000 rounds, which NSS won't lower: the one slow key file
    let identity = load_p12(NSS, PASSPHRASE).unwrap();
    assert!(matches!(identity.key, Key::P256(_)));
    assert_eq!(name_of(&identity), "Grace Hopper");
}

#[test]
fn says_when_the_passphrase_is_wrong() {
    for (file, data) in [
        ("rsa", RSA),
        ("legacy", LEGACY),
        ("no MAC", NO_MAC),
        ("NSS", NSS),
    ] {
        assert_eq!(
            load_p12(data, "wrong").err(),
            Some(OpenError::WrongPassphrase),
            "{file}"
        );
    }
}

#[test]
fn tells_a_broken_file_from_a_wrong_passphrase() {
    for (file, data) in [("rsa", RSA), ("legacy", LEGACY), ("NSS", NSS)] {
        let truncated = &data[..data.len() / 2];
        let error = load_p12(truncated, PASSPHRASE).err();
        assert!(
            matches!(error, Some(OpenError::Malformed | OpenError::Unsupported)),
            "{file}: {error:?}"
        );
    }
    assert_eq!(
        load_p12(b"not a key file", PASSPHRASE).err(),
        Some(OpenError::Malformed)
    );
}

#[test]
fn refuses_absurd_mac_rounds() {
    let mut pfx = Pfx::from_der(RSA).unwrap();
    pfx.mac_data.as_mut().unwrap().iterations = i32::MAX;
    let data = pfx.to_der().unwrap();
    assert_eq!(
        load_p12(&data, PASSPHRASE).err(),
        Some(OpenError::Unsupported)
    );
}

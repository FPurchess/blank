//! A CAdES-BES detached CMS SignedData over a PDF's byte ranges (PAdES B-B),
//! with the RustCrypto `cms` builder; optionally a signature timestamp (B-T).

use crate::signing::der as d;
use crate::signing::keys::{Identity, Key};
use anyhow::{anyhow, Context, Result};
use cms::builder::{SignedDataBuilder, SignerInfoBuilder};
use cms::cert::{CertificateChoices, IssuerAndSerialNumber};
use cms::content_info::ContentInfo;
use cms::signed_data::{EncapsulatedContentInfo, SignedData, SignerIdentifier, SignerInfos};
use const_oid::db::rfc5911::ID_DATA;
use const_oid::ObjectIdentifier;
use der::asn1::SetOfVec;
use der::{Any, Decode, Encode};
use sha2::{Digest, Sha256};
use spki::AlgorithmIdentifierOwned;
use x509_cert::attr::Attribute;
use x509_cert::Certificate;

pub const SHA256: ObjectIdentifier = ObjectIdentifier::new_unwrap("2.16.840.1.101.3.4.2.1");
pub const SIGNING_CERTIFICATE_V2: ObjectIdentifier =
    ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.16.2.47");
pub const SIGNATURE_TIME_STAMP_TOKEN: ObjectIdentifier =
    ObjectIdentifier::new_unwrap("1.2.840.113549.1.9.16.2.14");

/// ESS signing-certificate-v2 (RFC 5035) with SHA-256 (the default, so the
/// algorithm is left out) and the issuer and serial.
fn signing_certificate_v2(cert_der: &[u8], cert: &Certificate) -> Result<Attribute> {
    let hash = Sha256::digest(cert_der);
    let issuer = cert.tbs_certificate.issuer.to_der()?;
    let serial = cert.tbs_certificate.serial_number.to_der()?;
    // GeneralNames ::= SEQUENCE OF GeneralName; directoryName [4] EXPLICIT Name
    let general_names = d::seq(&[&d::tlv(0xa4, &issuer)]);
    let issuer_serial = d::seq(&[&general_names, &serial]);
    let ess_cert_id_v2 = d::seq(&[&d::octets(&hash), &issuer_serial]);
    let value = d::seq(&[&d::seq(&[&ess_cert_id_v2])]);
    let mut values = SetOfVec::new();
    values.insert(Any::from_der(&value)?)?;
    Ok(Attribute {
        oid: SIGNING_CERTIFICATE_V2,
        values,
    })
}

/// Signs `digest` (SHA-256 of the PDF's byte ranges). `timestamp` gets the
/// signature value and returns an RFC 3161 token (DER ContentInfo).
pub fn sign_detached(
    id: &Identity,
    digest: &[u8; 32],
    timestamp: Option<&dyn Fn(&[u8]) -> Result<Vec<u8>>>,
) -> Result<Vec<u8>> {
    let cert = Certificate::from_der(&id.cert)?;
    let sid = SignerIdentifier::IssuerAndSerialNumber(IssuerAndSerialNumber {
        issuer: cert.tbs_certificate.issuer.clone(),
        serial_number: cert.tbs_certificate.serial_number.clone(),
    });
    let digest_alg = AlgorithmIdentifierOwned {
        oid: SHA256,
        parameters: None,
    };
    let econtent = EncapsulatedContentInfo {
        econtent_type: ID_DATA,
        econtent: None,
    };

    let mut sd = SignedDataBuilder::new(&econtent);
    sd.add_digest_algorithm(digest_alg.clone()).map_err(e)?;
    sd.add_certificate(CertificateChoices::Certificate(cert.clone()))
        .map_err(e)?;
    for c in &id.chain {
        sd.add_certificate(CertificateChoices::Certificate(Certificate::from_der(c)?))
            .map_err(e)?;
    }
    let ess = signing_certificate_v2(&id.cert, &cert)?;
    macro_rules! signer_info {
        ($signer:expr) => {{
            let mut b = SignerInfoBuilder::new(
                $signer,
                sid.clone(),
                digest_alg.clone(),
                &econtent,
                Some(digest),
            )
            .map_err(e)?;
            b.add_signed_attribute(ess.clone()).map_err(e)?;
            b
        }};
    }
    match &id.key {
        Key::P256(k) => {
            sd.add_signer_info::<_, p256::ecdsa::DerSignature>(signer_info!(k))
                .map_err(e)?;
        }
        Key::P384(k) => {
            sd.add_signer_info::<_, p384::ecdsa::DerSignature>(signer_info!(k))
                .map_err(e)?;
        }
        Key::Rsa(k) => {
            let k = rsa::pkcs1v15::SigningKey::<Sha256>::new(k.clone());
            sd.add_signer_info::<_, rsa::pkcs1v15::Signature>(signer_info!(&k))
                .map_err(e)?;
        }
    }
    let ci = sd.build().map_err(e)?;
    let Some(timestamp) = timestamp else {
        return Ok(ci.to_der()?);
    };

    // B-T: timestamp the signature value and add the token as an unsigned attribute
    let mut signed: SignedData = ci.content.decode_as()?;
    let mut infos: Vec<_> = signed.signer_infos.0.into_vec();
    let token = timestamp(infos[0].signature.as_bytes()).context("timestamp")?;
    let mut values = SetOfVec::new();
    values.insert(Any::from_der(&token)?)?;
    let attr = Attribute {
        oid: SIGNATURE_TIME_STAMP_TOKEN,
        values,
    };
    let mut unsigned = SetOfVec::new();
    unsigned.insert(attr)?;
    infos[0].unsigned_attrs = Some(unsigned);
    signed.signer_infos = SignerInfos(SetOfVec::try_from(infos)?);
    let ci = ContentInfo {
        content_type: ci.content_type,
        content: Any::from_der(&signed.to_der()?)?,
    };
    Ok(ci.to_der()?)
}

fn e(err: impl std::fmt::Debug) -> anyhow::Error {
    anyhow!("cms: {err:?}")
}

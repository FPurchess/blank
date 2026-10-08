//! Checking every signature of a PDF: the byte ranges against the usual
//! attacks (USF, signature wrapping), the digest, the CMS signature, the
//! signer, and whether the file changed after signing.

use crate::signing::der as d;
use anyhow::{Context, Result};
use cms::content_info::ContentInfo;
use cms::signed_data::{SignedData, SignerIdentifier};
use const_oid::ObjectIdentifier as Oid;
use der::{Decode, Encode};
use lopdf::{Document, Object, ObjectId};
use sha2::Digest;
use spki::SubjectPublicKeyInfoOwned;
use x509_cert::name::Name;
use x509_cert::Certificate;

#[derive(Debug, Default)]
pub struct CertInfo {
    pub subject: String,
    pub issuer: String,
    pub serial: String,
    pub not_before: String,
    pub not_after: String,
    pub self_signed: bool,
    pub sha256: String,
    pub key: String,
}

#[derive(Debug, Default)]
pub struct SignatureReport {
    pub field: String,
    pub sub_filter: String,
    pub byte_range: Vec<i64>,
    /// (check, passed, detail)
    pub checks: Vec<(&'static str, bool, String)>,
    pub signer: Option<CertInfo>,
    pub digest_algorithm: String,
    pub signature_algorithm: String,
    pub timestamp: Option<String>,
    pub coverage: String,
    pub signing_time_claimed: Option<String>,
}

impl SignatureReport {
    pub fn valid(&self) -> bool {
        !self.checks.is_empty() && self.checks.iter().all(|c| c.1)
    }
}

pub fn common_name(n: &Name) -> Option<String> {
    let s = n.to_string();
    s.split(',')
        .find_map(|p| p.trim().strip_prefix("CN=").map(|v| v.to_string()))
}

fn oid_name(o: &Oid) -> String {
    const_oid::db::DB
        .by_oid(o)
        .map(|s| s.to_string())
        .unwrap_or_else(|| o.to_string())
}

pub fn hash(oid: &Oid, parts: &[&[u8]]) -> Option<Vec<u8>> {
    macro_rules! h {
        ($t:ty) => {{
            let mut h = <$t>::new();
            for p in parts {
                h.update(p);
            }
            Some(h.finalize().to_vec())
        }};
    }
    match oid.to_string().as_str() {
        "1.3.14.3.2.26" => h!(sha1::Sha1),
        "2.16.840.1.101.3.4.2.1" => h!(sha2::Sha256),
        "2.16.840.1.101.3.4.2.2" => h!(sha2::Sha384),
        "2.16.840.1.101.3.4.2.3" => h!(sha2::Sha512),
        _ => None,
    }
}

/// The digest algorithm a signature algorithm names, if it names one.
fn sig_alg_hash(o: &Oid) -> Option<Oid> {
    let s = match o.to_string().as_str() {
        "1.2.840.10045.4.1" | "1.2.840.113549.1.1.5" => "1.3.14.3.2.26",
        "1.2.840.10045.4.3.2" | "1.2.840.113549.1.1.11" => "2.16.840.1.101.3.4.2.1",
        "1.2.840.10045.4.3.3" | "1.2.840.113549.1.1.12" => "2.16.840.1.101.3.4.2.2",
        "1.2.840.10045.4.3.4" | "1.2.840.113549.1.1.13" => "2.16.840.1.101.3.4.2.3",
        _ => return None,
    };
    Some(Oid::new_unwrap(s))
}

/// Checks a signature given the hash (`prehash`, made with `hash_oid`) of what was signed.
fn verify_signature(
    spki: &SubjectPublicKeyInfoOwned,
    sig_alg: &spki::AlgorithmIdentifierOwned,
    hash_oid: &Oid,
    prehash: &[u8],
    sig: &[u8],
) -> Result<(), String> {
    let key_alg = spki.algorithm.oid.to_string();
    let pk_bytes = spki.subject_public_key.raw_bytes();
    match key_alg.as_str() {
        "1.2.840.10045.2.1" => {
            use p256::ecdsa::signature::hazmat::PrehashVerifier;
            let curve = spki
                .algorithm
                .parameters
                .as_ref()
                .and_then(|p| p.decode_as::<Oid>().ok())
                .map(|o| o.to_string())
                .unwrap_or_default();
            match curve.as_str() {
                "1.2.840.10045.3.1.7" => {
                    let k = p256::ecdsa::VerifyingKey::from_sec1_bytes(pk_bytes)
                        .map_err(|e| e.to_string())?;
                    let s = p256::ecdsa::Signature::from_der(sig).map_err(|e| e.to_string())?;
                    k.verify_prehash(prehash, &s)
                        .map_err(|_| "ECDSA signature doesn't match".to_string())
                }
                "1.3.132.0.34" => {
                    let k = p384::ecdsa::VerifyingKey::from_sec1_bytes(pk_bytes)
                        .map_err(|e| e.to_string())?;
                    let s = p384::ecdsa::Signature::from_der(sig).map_err(|e| e.to_string())?;
                    k.verify_prehash(prehash, &s)
                        .map_err(|_| "ECDSA signature doesn't match".to_string())
                }
                c => Err(format!("unsupported curve {c}")),
            }
        }
        "1.2.840.113549.1.1.1" | "1.2.840.113549.1.1.10" => {
            use rsa::pkcs8::DecodePublicKey;
            let der = spki.to_der().map_err(|e| e.to_string())?;
            let k = rsa::RsaPublicKey::from_public_key_der(&der).map_err(|e| e.to_string())?;
            if sig_alg.oid.to_string() == "1.2.840.113549.1.1.10" {
                // RSASSA-PSS-params: [0] hash, [1] mgf, [2] salt length; defaults SHA-1 and 20
                let params = sig_alg
                    .parameters
                    .as_ref()
                    .and_then(|p| p.to_der().ok())
                    .unwrap_or_default();
                let mut h = Oid::new_unwrap("1.3.14.3.2.26");
                let mut salt = 20usize;
                if let Some((seq, _)) = d::read(&params) {
                    for c in d::children(seq.content).unwrap_or_default() {
                        match c.tag {
                            0xa0 => {
                                if let Some(alg) =
                                    d::read(c.content).and_then(|(a, _)| d::read(a.content))
                                {
                                    h = Oid::from_der(alg.0.raw).unwrap_or(h);
                                }
                            }
                            0xa2 => {
                                if let Some((i, _)) = d::read(c.content) {
                                    salt = i
                                        .content
                                        .iter()
                                        .fold(0usize, |a, b| (a << 8) | *b as usize);
                                }
                            }
                            _ => {}
                        }
                    }
                }
                let ph = if &h == hash_oid {
                    prehash.to_vec()
                } else {
                    return Err("PSS hash differs from the digest algorithm".into());
                };
                let r = match h.to_string().as_str() {
                    "2.16.840.1.101.3.4.2.1" => {
                        k.verify(rsa::Pss::new_with_salt::<sha2::Sha256>(salt), &ph, sig)
                    }
                    "2.16.840.1.101.3.4.2.2" => {
                        k.verify(rsa::Pss::new_with_salt::<sha2::Sha384>(salt), &ph, sig)
                    }
                    "2.16.840.1.101.3.4.2.3" => {
                        k.verify(rsa::Pss::new_with_salt::<sha2::Sha512>(salt), &ph, sig)
                    }
                    "1.3.14.3.2.26" => {
                        k.verify(rsa::Pss::new_with_salt::<sha1::Sha1>(salt), &ph, sig)
                    }
                    o => return Err(format!("unsupported PSS hash {o}")),
                };
                r.map_err(|_| "RSA-PSS signature doesn't match".to_string())
            } else {
                let scheme = match hash_oid.to_string().as_str() {
                    "1.3.14.3.2.26" => rsa::Pkcs1v15Sign::new::<sha1::Sha1>(),
                    "2.16.840.1.101.3.4.2.1" => rsa::Pkcs1v15Sign::new::<sha2::Sha256>(),
                    "2.16.840.1.101.3.4.2.2" => rsa::Pkcs1v15Sign::new::<sha2::Sha384>(),
                    "2.16.840.1.101.3.4.2.3" => rsa::Pkcs1v15Sign::new::<sha2::Sha512>(),
                    o => return Err(format!("unsupported hash {o}")),
                };
                k.verify(scheme, prehash, sig)
                    .map_err(|_| "RSA signature doesn't match".to_string())
            }
        }
        a => Err(format!("unsupported key algorithm {a}")),
    }
}

pub fn cert_info(c: &Certificate, der_bytes: &[u8]) -> CertInfo {
    let tbs = &c.tbs_certificate;
    CertInfo {
        subject: tbs.subject.to_string(),
        issuer: tbs.issuer.to_string(),
        serial: hex::encode_upper(tbs.serial_number.as_bytes()),
        not_before: tbs.validity.not_before.to_string(),
        not_after: tbs.validity.not_after.to_string(),
        self_signed: tbs.subject == tbs.issuer,
        sha256: hex::encode_upper(sha2::Sha256::digest(der_bytes)),
        key: oid_name(&tbs.subject_public_key_info.algorithm.oid),
    }
}

/// The raw [0] IMPLICIT signedAttrs of the first SignerInfo, re-tagged as a
/// SET (what the signature covers), taken from the bytes so that a signer's
/// encoding is kept even if it isn't sorted.
fn raw_signed_attrs(content_info: &[u8]) -> Option<Vec<u8>> {
    let (ci, _) = d::read(content_info)?;
    let ci = d::children(ci.content)?;
    let (sd, _) = d::read(ci.get(1)?.content)?; // [0] EXPLICIT SignedData
    let parts = d::children(sd.content)?;
    let infos = parts.iter().rev().find(|p| p.tag == 0x31)?;
    let (si, _) = d::read(infos.content)?;
    let si = d::children(si.content)?;
    let attrs = si.iter().find(|p| p.tag == 0xa0)?;
    let mut out = attrs.raw.to_vec();
    out[0] = 0x31;
    Some(out)
}

pub struct CmsCheck {
    pub checks: Vec<(&'static str, bool, String)>,
    pub signer: Option<CertInfo>,
    pub digest_algorithm: Oid,
    pub signature_algorithm: String,
    pub signature: Vec<u8>,
    pub econtent: Option<Vec<u8>>,
    pub timestamp_token: Option<Vec<u8>>,
    pub signing_time: Option<String>,
}

/// Checks a CMS SignedData. `detached` hashes the external content with a
/// given digest algorithm (None: the content is inside).
pub fn check_cms(
    der_bytes: &[u8],
    detached: Option<&dyn Fn(&Oid) -> Option<Vec<u8>>>,
) -> Result<CmsCheck> {
    let ci = match ContentInfo::from_der(der_bytes) {
        Ok(ci) => ci,
        Err(e) => {
            let der = d::ber_to_der(der_bytes, false, false)
                .context("can't parse the CMS (neither DER nor BER)")?;
            if der == der_bytes {
                return Err(e).context("can't parse the CMS");
            }
            return check_cms(&der, detached).map(|mut c| {
                c.checks.insert(
                    0,
                    (
                        "CMS is BER (converted to DER to read it)",
                        true,
                        String::new(),
                    ),
                );
                c
            });
        }
    };
    let sd: SignedData = match ci.content.decode_as() {
        Ok(sd) => sd,
        Err(e) if e.to_string().contains("SET") => {
            // duplicate or unsorted certificates (NSS)
            let fixed = d::fix_cms_sets(der_bytes).context("can't parse SignedData")?;
            return check_cms(&fixed, detached).map(|mut c| {
                c.checks.insert(
                    0,
                    (
                        "certificate set sorted/deduplicated to read it",
                        true,
                        e.to_string(),
                    ),
                );
                c
            });
        }
        Err(e) => return Err(e).context("can't parse SignedData"),
    };
    let si = sd.signer_infos.0.get(0).context("no SignerInfo")?;
    let digest_oid = si.digest_alg.oid;
    let mut checks = vec![];

    let econtent = sd
        .encap_content_info
        .econtent
        .as_ref()
        .map(|e| e.value().to_vec());
    let content_hash = match (&econtent, detached) {
        (Some(c), _) => hash(&digest_oid, &[c]),
        (None, Some(f)) => f(&digest_oid),
        (None, None) => None,
    };

    let attr = |oid: &str| -> Option<Vec<u8>> {
        let attrs = si.signed_attrs.as_ref()?;
        let a = attrs.iter().find(|a| a.oid.to_string() == oid)?;
        a.values.get(0).map(|v| v.value().to_vec())
    };
    let signing_time =
        attr("1.2.840.113549.1.9.5").map(|v| String::from_utf8_lossy(&v).to_string());
    let prehash_target: Option<(Oid, Vec<u8>)>;
    if si.signed_attrs.is_some() {
        let md = attr("1.2.840.113549.1.9.4");
        match (&content_hash, &md) {
            (Some(h), Some(m)) => {
                checks.push(("message digest matches the content", h == m, String::new()))
            }
            (None, _) => checks.push((
                "message digest matches the content",
                false,
                format!("unsupported digest {digest_oid}"),
            )),
            (_, None) => checks.push((
                "message digest matches the content",
                false,
                "no message-digest attribute".into(),
            )),
        }
        let raw = raw_signed_attrs(der_bytes).context("can't find the signed attributes")?;
        let reencoded = si.signed_attrs.as_ref().unwrap().to_der()?;
        if raw != reencoded {
            checks.push((
                "signed attributes are DER",
                true,
                "not in DER order (verified as sent)".into(),
            ));
        }
        let h = sig_alg_hash(&si.signature_algorithm.oid).unwrap_or(digest_oid);
        prehash_target = hash(&h, &[&raw]).map(|p| (h, p));
    } else {
        prehash_target = content_hash.clone().map(|p| (digest_oid, p));
    }

    // the signer's certificate
    let certs: Vec<Certificate> = sd
        .certificates
        .as_ref()
        .map(|cs| {
            cs.0.iter()
                .filter_map(|c| match c {
                    cms::cert::CertificateChoices::Certificate(c) => Some(c.clone()),
                    _ => None,
                })
                .collect()
        })
        .unwrap_or_default();
    let cert = certs.iter().find(|c| match &si.sid {
        SignerIdentifier::IssuerAndSerialNumber(is) => {
            c.tbs_certificate.issuer == is.issuer
                && c.tbs_certificate.serial_number == is.serial_number
        }
        SignerIdentifier::SubjectKeyIdentifier(ski) => c
            .tbs_certificate
            .extensions
            .as_ref()
            .and_then(|exts| exts.iter().find(|e| e.extn_id.to_string() == "2.5.29.14"))
            .is_some_and(|e| e.extn_value.as_bytes().ends_with(ski.0.as_bytes())),
    });
    let signer = cert.map(|c| cert_info(c, &c.to_der().unwrap_or_default()));
    match (cert, &prehash_target) {
        (Some(c), Some((h, ph))) => {
            let r = verify_signature(
                &c.tbs_certificate.subject_public_key_info,
                &si.signature_algorithm,
                h,
                ph,
                si.signature.as_bytes(),
            );
            checks.push((
                "CMS signature over the signed attributes",
                r.is_ok(),
                r.err().unwrap_or_default(),
            ));
        }
        (None, _) => checks.push((
            "CMS signature over the signed attributes",
            false,
            "the signer's certificate isn't in the signature".into(),
        )),
        (_, None) => checks.push((
            "CMS signature over the signed attributes",
            false,
            "unsupported digest".into(),
        )),
    }

    let timestamp_token = si.unsigned_attrs.as_ref().and_then(|u| {
        u.iter()
            .find(|a| a.oid.to_string() == "1.2.840.113549.1.9.16.2.14")
            .and_then(|a| a.values.get(0))
            .and_then(|v| v.to_der().ok())
    });
    Ok(CmsCheck {
        checks,
        signer,
        digest_algorithm: digest_oid,
        signature_algorithm: oid_name(&si.signature_algorithm.oid),
        signature: si.signature.as_bytes().to_vec(),
        econtent,
        timestamp_token,
        signing_time,
    })
}

/// TSTInfo: (imprint hash algorithm, imprint, genTime)
pub fn tst_info(der_bytes: &[u8]) -> Option<(Oid, Vec<u8>, String)> {
    let (tst, _) = d::read(der_bytes)?;
    let parts = d::children(tst.content)?;
    let imprint = d::children(parts.get(2)?.content)?;
    let alg = d::children(imprint.first()?.content)?;
    let oid = Oid::from_der(alg.first()?.raw).ok()?;
    let gen_time = String::from_utf8_lossy(parts.get(4)?.content).to_string();
    Some((oid, imprint.get(1)?.content.to_vec(), gen_time))
}

/// Checks an RFC 3161 token over `data`; returns the time it gives.
fn check_timestamp(token: &[u8], data: &[u8]) -> (bool, String) {
    match check_cms(token, None) {
        Ok(c) => {
            let Some((oid, imprint, time)) = c.econtent.as_deref().and_then(tst_info) else {
                return (false, "can't read TSTInfo".into());
            };
            let ok_imprint = hash(&oid, &[data]).is_some_and(|h| h == imprint);
            let ok_cms = c.checks.iter().all(|c| c.1);
            let tsa = c.signer.map(|s| s.subject).unwrap_or_default();
            (
                ok_imprint && ok_cms,
                format!(
                    "{time} by {tsa}{}",
                    if ok_imprint {
                        ""
                    } else {
                        " (imprint mismatch)"
                    }
                ),
            )
        }
        Err(e) => (false, format!("{e:#}")),
    }
}

fn is_ws(b: u8) -> bool {
    matches!(b, b' ' | b'\n' | b'\r' | b'\t' | b'\x0c' | 0)
}

struct SigDict {
    field: String,
    id: Option<ObjectId>,
}

fn collect_sig_fields(doc: &Document) -> Vec<SigDict> {
    let mut out = vec![];
    let Some(form) = doc
        .catalog()
        .ok()
        .and_then(|c| c.get(b"AcroForm").ok())
        .and_then(|o| doc.dereference(o).ok())
        .map(|x| x.1)
    else {
        return out;
    };
    let Some(fields) = form
        .as_dict()
        .ok()
        .and_then(|f| f.get(b"Fields").ok())
        .and_then(|o| doc.dereference(o).ok())
        .and_then(|x| x.1.as_array().ok())
    else {
        return out;
    };
    let mut stack: Vec<(Object, String, bool)> = fields
        .iter()
        .map(|f| (f.clone(), String::new(), false))
        .collect();
    let mut guard = 0;
    while let Some((o, prefix, parent_sig)) = stack.pop() {
        guard += 1;
        if guard > 100_000 {
            break;
        }
        let Ok((_, obj)) = doc.dereference(&o) else {
            continue;
        };
        let Ok(f) = obj.as_dict() else { continue };
        let t = f
            .get(b"T")
            .and_then(Object::as_str)
            .map(|t| String::from_utf8_lossy(t).to_string())
            .ok();
        let name = match (&t, prefix.is_empty()) {
            (Some(t), true) => t.clone(),
            (Some(t), false) => format!("{prefix}.{t}"),
            (None, _) => prefix.clone(),
        };
        let is_sig = f
            .get(b"FT")
            .and_then(Object::as_name)
            .map(|n| n == b"Sig")
            .unwrap_or(parent_sig);
        if is_sig {
            if let Ok(v) = f.get(b"V") {
                out.push(SigDict {
                    field: name.clone(),
                    id: v.as_reference().ok(),
                });
            }
        }
        if let Ok(kids) = f
            .get(b"Kids")
            .and_then(|k| doc.dereference(k).map(|x| x.1))
            .and_then(Object::as_array)
        {
            stack.extend(kids.iter().map(|k| (k.clone(), name.clone(), is_sig)));
        }
    }
    out.reverse();
    // widgets of signature fields that aren't in /AcroForm (poppler 24.02's
    // pdfsig -add-signature doesn't add its field there)
    let known: std::collections::HashSet<_> = out.iter().filter_map(|s| s.id).collect();
    for (_, page) in doc.get_pages() {
        let Some(annots) = doc
            .get_dictionary(page)
            .ok()
            .and_then(|p| p.get(b"Annots").ok())
            .and_then(|a| doc.dereference(a).ok())
            .and_then(|x| x.1.as_array().ok())
        else {
            continue;
        };
        for a in annots {
            let Some(w) = doc.dereference(a).ok().and_then(|x| x.1.as_dict().ok()) else {
                continue;
            };
            if w.get(b"FT").and_then(Object::as_name).ok() != Some(b"Sig") {
                continue;
            }
            if let Ok(id) = w.get(b"V").and_then(Object::as_reference) {
                if !known.contains(&id) {
                    let t = w
                        .get(b"T")
                        .and_then(Object::as_str)
                        .map(|t| String::from_utf8_lossy(t).to_string())
                        .unwrap_or_default();
                    out.push(SigDict {
                        field: format!("{t} (not in /AcroForm)"),
                        id: Some(id),
                    });
                }
            }
        }
    }
    out
}

pub fn verify_pdf(bytes: &[u8]) -> Result<Vec<SignatureReport>> {
    let doc = Document::load_mem(bytes).context("can't read the PDF")?;
    let header = bytes.windows(5).position(|w| w == b"%PDF-").unwrap_or(0);
    let effective_len = bytes.len() - bytes.iter().rev().take_while(|b| is_ws(**b)).count();
    let mut reports = vec![];
    for sd in collect_sig_fields(&doc) {
        let mut r = SignatureReport {
            field: sd.field.clone(),
            ..Default::default()
        };
        let Some(id) = sd.id else {
            r.checks.push((
                "signature dictionary is an indirect object",
                false,
                String::new(),
            ));
            reports.push(r);
            continue;
        };
        let Ok(sig) = doc.get_dictionary(id) else {
            r.checks
                .push(("signature dictionary readable", false, String::new()));
            reports.push(r);
            continue;
        };
        r.sub_filter = sig
            .get(b"SubFilter")
            .and_then(Object::as_name)
            .map(|n| String::from_utf8_lossy(n).to_string())
            .unwrap_or_default();
        r.byte_range = sig
            .get(b"ByteRange")
            .and_then(|b| doc.dereference(b).map(|x| x.1))
            .and_then(Object::as_array)
            .map(|a| a.iter().filter_map(|i| i.as_i64().ok()).collect())
            .unwrap_or_default();
        let contents = sig
            .get(b"Contents")
            .and_then(Object::as_str)
            .map(|s| s.to_vec())
            .unwrap_or_default();
        let br = &r.byte_range;
        let len = bytes.len() as i64;
        let br_ok = br.len() == 4
            && br[0] == 0
            && br[1] > 0
            && br[2] > br[1]
            && br[3] >= 0
            && br[2] + br[3] <= len;
        r.checks.push((
            "ByteRange starts at 0 and lies in the file",
            br_ok,
            format!("{br:?}"),
        ));
        if !br_ok {
            reports.push(r);
            continue;
        }
        let (b1, b2, b3) = (br[1] as usize, br[2] as usize, br[3] as usize);

        // the gap is exactly this dictionary's /Contents
        let gap = &bytes[b1..b2];
        let gap_ok = gap.first() == Some(&b'<') && gap.last() == Some(&b'>') && {
            let hex: Vec<u8> = gap[1..gap.len() - 1]
                .iter()
                .copied()
                .filter(|b| !is_ws(*b))
                .collect();
            hex::decode(&hex).map(|g| g == contents).unwrap_or(false)
        };
        // where the dictionary is in the file
        let entry = doc.reference_table.get(id.0).cloned();
        let (obj_ok, obj_detail) = match entry {
            Some(lopdf::xref::XrefEntry::Normal { offset, .. }) => {
                let start = header + offset as usize;
                let end = bytes[start..]
                    .windows(6)
                    .position(|w| w == b"endobj")
                    .map(|p| start + p + 6)
                    .unwrap_or(bytes.len());
                // the /Contents key right before the gap, inside this object
                let key_ok = start < b1 && b2 <= end && {
                    let before = &bytes[start..b1];
                    before
                        .windows(9)
                        .rposition(|w| w == b"/Contents")
                        .is_some_and(|p| before[p + 9..].iter().all(|b| is_ws(*b)))
                };
                let inside = start < b1 && end <= b2 + b3 && end > b2;
                (
                    key_ok && inside,
                    format!("object {} at {start}..{end}", id.0),
                )
            }
            Some(lopdf::xref::XrefEntry::Compressed { .. }) => (
                false,
                "in an object stream, outside the signed bytes".into(),
            ),
            _ => (false, "not in the cross-reference table".into()),
        };
        r.checks.push((
            "the gap is this dictionary's /Contents",
            gap_ok && obj_ok,
            obj_detail.clone(),
        ));
        r.checks.push((
            "the signature dictionary lies inside the signed bytes",
            obj_ok,
            obj_detail,
        ));

        // the CMS
        let converted;
        let cms_der: &[u8] = match d::read(&contents) {
            Some((ci, _)) => ci.raw,
            None => match d::ber_to_der(&contents, false, false) {
                // BER, as NSS writes it (poppler's pdfsig, Firefox-era tools)
                Some(der) => {
                    converted = der;
                    r.checks.push((
                        "CMS is BER (converted to DER to read it)",
                        true,
                        String::new(),
                    ));
                    &converted
                }
                None => {
                    r.checks
                        .push(("CMS readable", false, "neither DER nor BER".into()));
                    reports.push(r);
                    continue;
                }
            },
        };
        let ranges: [&[u8]; 2] = [&bytes[..b1], &bytes[b2..b2 + b3]];
        let detached = |oid: &Oid| hash(oid, &ranges);
        let sub = r.sub_filter.clone();
        let check = match sub.as_str() {
            "adbe.pkcs7.detached" | "ETSI.CAdES.detached" => check_cms(cms_der, Some(&detached)),
            "adbe.pkcs7.sha1" | "ETSI.RFC3161" => check_cms(cms_der, None),
            s => {
                r.checks.push(("supported SubFilter", false, s.to_string()));
                reports.push(r);
                continue;
            }
        };
        match check {
            Ok(c) => {
                r.digest_algorithm = oid_name(&c.digest_algorithm);
                r.signature_algorithm = c.signature_algorithm.clone();
                r.checks.extend(c.checks);
                r.signer = c.signer;
                r.signing_time_claimed = c.signing_time;
                match sub.as_str() {
                    "adbe.pkcs7.sha1" => {
                        let inner = c.econtent.clone();
                        let h = hash(&Oid::new_unwrap("1.3.14.3.2.26"), &ranges);
                        r.checks.push((
                            "SHA-1 in the content matches the byte ranges",
                            inner.is_some() && inner == h,
                            String::new(),
                        ));
                    }
                    "ETSI.RFC3161" => {
                        let ok = c.econtent.as_deref().and_then(tst_info).is_some_and(
                            |(oid, imprint, t)| {
                                r.timestamp = Some(t);
                                hash(&oid, &ranges).is_some_and(|h| h == imprint)
                            },
                        );
                        r.checks.push((
                            "timestamp imprint matches the byte ranges",
                            ok,
                            String::new(),
                        ));
                    }
                    _ => {}
                }
                if let Some(tok) = c.timestamp_token {
                    let (ok, detail) = check_timestamp(&tok, &c.signature);
                    r.timestamp = Some(detail.clone());
                    r.checks.push(("signature timestamp", ok, detail));
                }
            }
            Err(e) => r.checks.push(("CMS readable", false, format!("{e:#}"))),
        }
        r.coverage = String::new();
        reports.push(r);
    }

    // changed after signing?
    let ends: Vec<usize> = reports
        .iter()
        .filter(|r| r.byte_range.len() == 4 && r.valid())
        .map(|r| (r.byte_range[2] + r.byte_range[3]) as usize)
        .collect();
    let last_covered = ends.iter().copied().max().unwrap_or(0);
    let tail_dss_only =
        last_covered < effective_len && tail_is_validation_data(&doc, bytes, header, last_covered);
    let eofs: Vec<usize> = bytes
        .windows(5)
        .enumerate()
        .filter(|(_, w)| *w == b"%%EOF")
        .map(|(i, _)| i + 5)
        .collect();
    for r in &mut reports {
        if r.byte_range.len() != 4 || !r.checks.first().is_some_and(|c| c.1) {
            r.coverage = "unknown (bad ByteRange)".into();
            continue;
        }
        let end = (r.byte_range[2] + r.byte_range[3]) as usize;
        let later = eofs.iter().filter(|e| **e > end + 2).count();
        r.coverage = if end >= effective_len {
            "covers the whole file".into()
        } else if last_covered >= effective_len {
            format!("signed again later ({later} later revision(s), the last one signed)")
        } else if tail_dss_only && end == last_covered {
            "covers the whole file but validation data (DSS) added later".into()
        } else if tail_dss_only {
            format!(
                "signed again later ({later} later revision(s)), then validation data (DSS) added"
            )
        } else {
            format!("CHANGED AFTER SIGNING ({} bytes, {later} revision(s) not covered by any signature)", effective_len - end)
        };
    }
    Ok(reports)
}

/// Whether everything written after `from` is PAdES validation data: a DSS
/// dictionary, VRI entries, certificates/OCSP/CRL streams and the catalog that
/// points to them, unchanged but for its /DSS. (A heuristic.)
fn tail_is_validation_data(doc: &Document, bytes: &[u8], header: usize, from: usize) -> bool {
    use lopdf::xref::XrefEntry;
    let in_tail = |off: u32| header + off as usize >= from;
    let mut ids = vec![];
    for (id, e) in &doc.reference_table.entries {
        match e {
            XrefEntry::Normal { offset, generation } if in_tail(*offset) => {
                ids.push((*id, *generation))
            }
            XrefEntry::Compressed { container, .. } => {
                if let Some(XrefEntry::Normal { offset, .. }) = doc.reference_table.get(*container)
                {
                    if in_tail(*offset) {
                        ids.push((*id, 0));
                    }
                }
            }
            _ => {}
        }
    }
    let keys_within = |d: &lopdf::Dictionary, allowed: &[&[u8]]| {
        d.iter().all(|(k, _)| allowed.contains(&k.as_slice()))
    };
    // the catalog may only have gained (or changed) its /DSS
    let catalog_ok = || -> bool {
        let Ok(root) = doc.trailer.get(b"Root").and_then(Object::as_reference) else {
            return false;
        };
        if !ids.contains(&root) {
            return true;
        }
        let Ok(prev) = Document::load_mem(&bytes[..from]) else {
            return false;
        };
        let (Ok(now), Ok(before)) = (doc.get_dictionary(root), prev.get_dictionary(root)) else {
            return false;
        };
        let strip = |d: &lopdf::Dictionary| {
            let mut d = d.clone();
            d.remove(b"DSS");
            format!("{d:?}")
        };
        now.has(b"DSS") && strip(now) == strip(before)
    };
    !ids.is_empty()
        && catalog_ok()
        && ids.iter().all(|id| match doc.objects.get(id) {
            Some(Object::Dictionary(d)) => {
                d.get(b"Type").and_then(Object::as_name).ok() == Some(b"Catalog")
                    || keys_within(d, &[b"Type", b"Certs", b"OCSPs", b"CRLs", b"VRI"])
                    || keys_within(d, &[b"Type", b"Cert", b"OCSP", b"CRL", b"TU", b"TS"])
                    || d.iter().all(|(k, v)| {
                        k.len() == 40 && matches!(v, Object::Reference(_) | Object::Dictionary(_))
                    })
            }
            Some(Object::Array(_)) => true, // arrays of references (Certs, OCSPs)
            Some(Object::Stream(st)) => {
                let t = st.dict.get(b"Type").and_then(Object::as_name).ok();
                matches!(t, Some(b"ObjStm") | Some(b"XRef"))
                    || (t.is_none() && !st.dict.has(b"Subtype"))
            }
            None => true, // the xref stream itself isn't kept as an object
            _ => false,
        })
}

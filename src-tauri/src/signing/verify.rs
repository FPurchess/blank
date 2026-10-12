//! checking every signature of a PDF: the byte ranges against the usual
//! attacks (USF, signature wrapping), the digest, the CMS signature, the
//! signer, and whether the file changed after signing

use crate::signing::certificate::CertificateInfo;
use crate::signing::der as d;
use anyhow::{Context, Result};
use cms::content_info::ContentInfo;
use cms::signed_data::{SignedData, SignerIdentifier};
use const_oid::ObjectIdentifier as Oid;
use der::{Decode, Encode};
use lopdf::{Document, Object, ObjectId};
use sha2::Digest;
use spki::SubjectPublicKeyInfoOwned;
use x509_cert::Certificate;

/// what coverage says of a signature whose byte ranges reach the end of
/// the file
const WHOLE_FILE: &str = "covers the whole file";

/// what Blank found of one signature of a PDF
#[derive(Debug, Default)]
pub struct SignatureReport {
    pub field: String,
    pub sub_filter: String,
    pub byte_range: Vec<i64>,
    /// (check, passed, detail)
    pub checks: Vec<(&'static str, bool, String)>,
    pub signer: Option<CertificateInfo>,
    pub digest_algorithm: String,
    pub signature_algorithm: String,
    pub timestamp: Option<String>,
    /// how much of the file the signature covers, in words: the whole
    /// file, or what came after it
    pub coverage: String,
    pub signing_time_claimed: Option<String>,
}

impl SignatureReport {
    /// valid tells whether every check passed: the signature is intact and
    /// signs the bytes it names. It doesn't say whether those bytes are the
    /// whole file; that is covers_the_whole_file.
    pub fn valid(&self) -> bool {
        !self.checks.is_empty() && self.checks.iter().all(|c| c.1)
    }

    /// covers_the_whole_file tells whether nothing was added to the file
    /// after this signature
    pub fn covers_the_whole_file(&self) -> bool {
        self.coverage == WHOLE_FILE
    }
}

/// oid_name names an OID, or writes it in dots
fn oid_name(o: &Oid) -> String {
    const_oid::db::DB
        .by_oid(o)
        .map(|s| s.to_string())
        .unwrap_or_else(|| o.to_string())
}

/// hash hashes `parts` with the digest algorithm `oid`, if Blank knows it
fn hash(oid: &Oid, parts: &[&[u8]]) -> Option<Vec<u8>> {
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

/// sig_alg_hash returns the digest algorithm a signature algorithm names,
/// if it names one
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

/// verify_signature checks a signature given the hash (`prehash`, made with
/// `hash_oid`) of what was signed
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

/// raw_signed_attrs returns the raw [0] IMPLICIT signedAttrs of the first
/// SignerInfo, re-tagged as a SET (what the signature covers), taken from
/// the bytes so that a signer's encoding is kept even if it isn't sorted
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

/// hashes the content a detached signature signs with a digest algorithm
type Detached<'a> = &'a dyn Fn(&Oid) -> Option<Vec<u8>>;

/// what check_cms found
struct CmsCheck {
    checks: Vec<(&'static str, bool, String)>,
    signer: Option<CertificateInfo>,
    digest_algorithm: Oid,
    signature_algorithm: String,
    signature: Vec<u8>,
    econtent: Option<Vec<u8>>,
    timestamp_token: Option<Vec<u8>>,
    signing_time: Option<String>,
}

/// check_cms checks a CMS SignedData. `detached` hashes the external
/// content with a given digest algorithm (None: the content is inside).
fn check_cms(der_bytes: &[u8], detached: Option<Detached>) -> Result<CmsCheck> {
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
            if fixed == der_bytes {
                // sorting didn't help: reading it again would loop
                return Err(e).context("can't parse SignedData");
            }
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
    let prehash_target = if let Some(signed_attrs) = &si.signed_attrs {
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
        let reencoded = signed_attrs.to_der()?;
        if raw != reencoded {
            checks.push((
                "signed attributes are DER",
                true,
                "not in DER order (verified as sent)".into(),
            ));
        }
        let h = sig_alg_hash(&si.signature_algorithm.oid).unwrap_or(digest_oid);
        hash(&h, &[&raw]).map(|p| (h, p))
    } else {
        content_hash.clone().map(|p| (digest_oid, p))
    };

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
            // SubjectKeyIdentifier ::= KeyIdentifier (OCTET STRING), in the
            // extension's OCTET STRING
            .and_then(|e| d::read(e.extn_value.as_bytes()))
            .is_some_and(|(id, rest)| {
                id.tag == 0x04 && rest.is_empty() && id.content == ski.0.as_bytes()
            }),
    });
    let signer = cert.map(|c| CertificateInfo::of(c, &c.to_der().unwrap_or_default()));
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

/// tst_info reads a TSTInfo: (imprint hash algorithm, imprint, genTime)
fn tst_info(der_bytes: &[u8]) -> Option<(Oid, Vec<u8>, String)> {
    let (tst, _) = d::read(der_bytes)?;
    let parts = d::children(tst.content)?;
    let imprint = d::children(parts.get(2)?.content)?;
    let alg = d::children(imprint.first()?.content)?;
    let oid = Oid::from_der(alg.first()?.raw).ok()?;
    let gen_time = String::from_utf8_lossy(parts.get(4)?.content).to_string();
    Some((oid, imprint.get(1)?.content.to_vec(), gen_time))
}

/// check_timestamp checks an RFC 3161 token over `data`; it returns the
/// time it gives
fn check_timestamp(token: &[u8], data: &[u8]) -> (bool, String) {
    match check_cms(token, None) {
        Ok(c) => {
            let Some((oid, imprint, time)) = c.econtent.as_deref().and_then(tst_info) else {
                return (false, "can't read TSTInfo".into());
            };
            let ok_imprint = hash(&oid, &[data]).is_some_and(|h| h == imprint);
            let ok_cms = c.checks.iter().all(|c| c.1);
            let tsa = c.signer.map(|s| s.name).unwrap_or_default();
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

/// is_ws tells whether `b` is PDF whitespace
fn is_ws(b: u8) -> bool {
    matches!(b, b' ' | b'\n' | b'\r' | b'\t' | b'\x0c' | 0)
}

/// a signature field and its signature dictionary
struct SigDict {
    field: String,
    id: Option<ObjectId>,
}

/// collect_sig_fields finds the signed signature fields, in /AcroForm and
/// on the pages
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

/// verify_pdf checks every signature of the PDF `bytes`, in the order of
/// its form's fields
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
            && br[2].checked_add(br[3]).is_some_and(|end| end <= len);
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
                let end = bytes
                    .get(start..)
                    .and_then(|object| object.windows(6).position(|w| w == b"endobj"))
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
            WHOLE_FILE.into()
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

/// tail_is_validation_data tells whether everything written after `from`
/// is PAdES validation data: a DSS dictionary, VRI entries,
/// certificates/OCSP/CRL streams and the catalog that points to them,
/// unchanged but for its /DSS. (A heuristic.) An object the signed revision
/// already had may only be written again if that revision's own DSS held
/// it: otherwise a page's content stream written again under its number
/// would pass for a certificate.
fn tail_is_validation_data(doc: &Document, bytes: &[u8], header: usize, from: usize) -> bool {
    use lopdf::xref::XrefEntry;
    let in_tail = |off: u32| header + off as usize >= from;
    // each object written after `from`, with where it starts if not in an
    // object stream
    let mut ids = vec![];
    for (id, e) in &doc.reference_table.entries {
        match e {
            XrefEntry::Normal { offset, generation } if in_tail(*offset) => {
                ids.push(((*id, *generation), Some(header + *offset as usize)))
            }
            XrefEntry::Compressed { container, .. } => {
                if let Some(XrefEntry::Normal { offset, .. }) = doc.reference_table.get(*container)
                {
                    if in_tail(*offset) {
                        ids.push(((*id, 0), None));
                    }
                }
            }
            _ => {}
        }
    }
    if ids.is_empty() {
        return false;
    }
    let Ok(root) = doc.trailer.get(b"Root").and_then(Object::as_reference) else {
        return false;
    };
    let Ok(before) = Document::load_mem(&bytes[..from]) else {
        return false;
    };
    // the catalog may only have gained (or changed) its /DSS
    let catalog_ok = || -> bool {
        let (Ok(now), Ok(then)) = (doc.get_dictionary(root), before.get_dictionary(root)) else {
            return false;
        };
        let strip = |d: &lopdf::Dictionary| {
            let mut d = d.clone();
            d.remove(b"DSS");
            format!("{d:?}")
        };
        now.has(b"DSS") && strip(now) == strip(then)
    };
    // nothing the signed revision had may have gone, nor point elsewhere:
    // an update that marks a page's content stream free changes the page as
    // surely as one that writes it again. lopdf reads no free entries, so
    // the tail's own cross-reference sections are read here
    if !before.objects.keys().all(|id| doc.objects.contains_key(id)) {
        return false;
    }
    let Some(entries) = tail_entries(bytes, header, from) else {
        return false;
    };
    let numbers: std::collections::HashSet<u32> = before.objects.keys().map(|(n, _)| *n).collect();
    let had = |number: u32| numbers.contains(&number);
    let kept = entries.iter().all(|&(number, entry)| {
        let then = before.reference_table.get(number);
        match entry {
            _ if number == 0 => true,
            TailEntry::Free => !had(number),
            TailEntry::Normal { offset, generation } if header + offset < from => matches!(
                then,
                Some(lopdf::xref::XrefEntry::Normal { offset: o, generation: g })
                    if *o as usize == offset && *g == generation
            ),
            TailEntry::Compressed { container }
                if doc
                    .reference_table
                    .get(container)
                    .is_some_and(|e| !matches!(e, lopdf::xref::XrefEntry::Normal { offset, .. } if header + *offset as usize >= from)) =>
            {
                matches!(
                    then,
                    Some(lopdf::xref::XrefEntry::Compressed { container: c, .. }) if *c == container
                )
            }
            _ => true,
        }
    });
    if !kept {
        return false;
    }
    let held_then = dss_objects(&before);
    let held_now = dss_objects(doc);
    let keys_within = |d: &lopdf::Dictionary, allowed: &[&[u8]]| {
        !d.is_empty() && d.iter().all(|(k, _)| allowed.contains(&k.as_slice()))
    };
    let validation_data = |object: &Object| match object {
        Object::Dictionary(d) => {
            keys_within(d, &[b"Type", b"Certs", b"OCSPs", b"CRLs", b"VRI"])
                && (d.get(b"Type").and_then(Object::as_name).ok() == Some(b"DSS")
                    || [&b"Certs"[..], b"OCSPs", b"CRLs", b"VRI"]
                        .iter()
                        .any(|key| d.has(key)))
                || keys_within(d, &[b"Type", b"Cert", b"OCSP", b"CRL", b"TU", b"TS"])
                    && d.iter().any(|(k, _)| k.as_slice() != b"Type")
                // the VRI: entries by the SHA-1 of a signature, in hex
                || !d.is_empty()
                    && d.iter().all(|(k, v)| {
                        k.len() == 40 && matches!(v, Object::Reference(_) | Object::Dictionary(_))
                    })
        }
        // Certs, OCSPs and CRLs: arrays of references to streams
        Object::Array(items) => items
            .iter()
            .all(|item| matches!(item, Object::Reference(_))),
        Object::Stream(st) => {
            st.dict.get(b"Type").and_then(Object::as_name).is_err() && !st.dict.has(b"Subtype")
        }
        _ => false,
    };
    // the cross-reference stream itself isn't kept as an object: it's the
    // one at `at` that says it is one
    let xref_stream = |at: Option<usize>| {
        let Some(at) = at else {
            return false;
        };
        let Some(rest) = bytes.get(at..) else {
            return false;
        };
        let head = &rest[..rest.len().min(512)];
        let dict_end = head
            .windows(6)
            .position(|w| w == b"stream")
            .unwrap_or(head.len());
        head[..dict_end].windows(5).any(|w| w == b"/XRef")
    };
    ids.iter().all(|&(id, at)| {
        if id == root {
            return catalog_ok();
        }
        match doc.objects.get(&id) {
            Some(Object::Stream(st))
                if matches!(
                    st.dict.get(b"Type").and_then(Object::as_name).ok(),
                    Some(b"ObjStm") | Some(b"XRef")
                ) =>
            {
                true
            }
            Some(object) => {
                let held = if before.objects.contains_key(&id) {
                    &held_then
                } else {
                    &held_now
                };
                held.contains(&id) && validation_data(object)
            }
            None => !before.objects.contains_key(&id) && xref_stream(at),
        }
    })
}

/// an entry of a cross-reference section, as written
#[derive(Clone, Copy, Debug, PartialEq)]
enum TailEntry {
    Free,
    /// where the object starts, from the header on
    Normal {
        offset: usize,
        generation: u16,
    },
    Compressed {
        container: u32,
    },
}

/// what a cross-reference section holds: its entries by number, and where
/// the sections it points to start (/Prev, /XRefStm)
type Section = (Vec<(u32, TailEntry)>, Vec<usize>);

/// how many sections an update's chain of cross-references may have
const MAX_SECTIONS: usize = 256;

/// tail_entries reads the entries of every cross-reference section written
/// at or after `from`, following /Prev and /XRefStm from the last
/// startxref, free ones too, which lopdf skips. None if one can't be read
fn tail_entries(bytes: &[u8], header: usize, from: usize) -> Option<Vec<(u32, TailEntry)>> {
    let last = bytes.windows(9).rposition(|w| w == b"startxref")?;
    let mut next = vec![first_integer(&bytes[last + 9..])?];
    let mut seen = std::collections::HashSet::new();
    let mut entries = vec![];
    while let Some(offset) = next.pop() {
        let at = header.checked_add(offset)?;
        if at < from || !seen.insert(at) {
            continue;
        }
        if seen.len() > MAX_SECTIONS {
            return None;
        }
        let section = bytes.get(at..)?;
        let (found, more) = if section.starts_with(b"xref") {
            xref_table(section)?
        } else {
            xref_stream(section)?
        };
        entries.extend(found);
        next.extend(more);
    }
    Some(entries)
}

/// first_integer reads the unsigned integer at the start of `text`, after
/// white space
fn first_integer(text: &[u8]) -> Option<usize> {
    let start = text.iter().position(|b| !is_ws(*b))?;
    let digits = text[start..]
        .iter()
        .take_while(|b| b.is_ascii_digit())
        .count();
    std::str::from_utf8(&text[start..start + digits])
        .ok()?
        .parse()
        .ok()
}

/// the integer after `key` in a dictionary's text, if it has the key
fn integer_after(text: &[u8], key: &[u8]) -> Option<usize> {
    let at = text.windows(key.len() + 1).position(|w| {
        w.starts_with(key) && (is_ws(w[key.len()]) || w[key.len()].is_ascii_digit())
    })?;
    first_integer(&text[at + key.len()..])
}

/// xref_table reads a cross-reference table: its entries, and the sections
/// its trailer's /Prev and /XRefStm point to
fn xref_table(section: &[u8]) -> Option<Section> {
    let end = section.windows(7).position(|w| w == b"trailer")?;
    let text = std::str::from_utf8(&section[4..end]).ok()?;
    let mut words = text.split_ascii_whitespace();
    let mut entries = vec![];
    while let Some(start) = words.next() {
        let start: u32 = start.parse().ok()?;
        let count: u32 = words.next()?.parse().ok()?;
        for index in 0..count {
            let offset: usize = words.next()?.parse().ok()?;
            let generation: u16 = words.next()?.parse().ok()?;
            let number = start.checked_add(index)?;
            entries.push((
                number,
                match words.next()? {
                    "n" => TailEntry::Normal { offset, generation },
                    "f" => TailEntry::Free,
                    _ => return None,
                },
            ));
        }
    }
    let trailer = &section[end..];
    let trailer = &trailer[..trailer
        .windows(9)
        .position(|w| w == b"startxref")
        .unwrap_or(trailer.len())];
    let more = [b"/Prev".as_slice(), b"/XRefStm"]
        .iter()
        .filter_map(|key| integer_after(trailer, key))
        .collect();
    Some((entries, more))
}

/// xref_stream reads a cross-reference stream: its entries, and the
/// section its /Prev points to. lopdf decodes it, loaded as the only object
/// of a PDF of its own
fn xref_stream(section: &[u8]) -> Option<Section> {
    let body = section.windows(3).position(|w| w == b"obj")? + 3;
    let end = section.windows(9).position(|w| w == b"endstream")? + 9;
    let mut pdf = b"%PDF-1.7\n".to_vec();
    let start = pdf.len();
    pdf.extend_from_slice(b"1 0 obj");
    pdf.extend_from_slice(section.get(body..end)?);
    pdf.extend_from_slice(b"\nendobj\n");
    let xref = pdf.len();
    pdf.extend_from_slice(
        format!(
            "xref\n0 2\n0000000000 65535 f \n{start:010} 00000 n \ntrailer\n<< /Size 2 /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n"
        )
        .as_bytes(),
    );
    let doc = Document::load_mem(&pdf).ok()?;
    let stream = doc.get_object((1, 0)).ok()?.as_stream().ok()?;
    let dict = &stream.dict;
    if dict.get(b"Type").and_then(Object::as_name).ok() != Some(b"XRef") {
        return None;
    }
    let integers = |key: &[u8]| -> Option<Vec<usize>> {
        dict.get(key)
            .ok()?
            .as_array()
            .ok()?
            .iter()
            .map(|n| n.as_i64().ok().and_then(|n| usize::try_from(n).ok()))
            .collect()
    };
    let size = usize::try_from(dict.get(b"Size").ok()?.as_i64().ok()?).ok()?;
    let widths = integers(b"W")?;
    if widths.len() < 3 || widths.iter().any(|w| *w > 8) || widths.iter().sum::<usize>() == 0 {
        return None;
    }
    let index = integers(b"Index").unwrap_or_else(|| vec![0, size]);
    let content = if dict.has(b"Filter") {
        stream.decompressed_content().ok()?
    } else {
        stream.content.clone()
    };
    let mut read = content.as_slice();
    let mut field = |width: usize, default: u64| -> Option<u64> {
        if width == 0 {
            return Some(default);
        }
        let (bytes, rest) = read.split_at_checked(width)?;
        read = rest;
        Some(bytes.iter().fold(0, |n, b| n << 8 | u64::from(*b)))
    };
    let mut entries = vec![];
    for range in index.chunks(2) {
        let [start, count] = range else {
            return None;
        };
        for number in *start..start.checked_add(*count)? {
            let kind = field(widths[0], 1)?;
            let second = field(widths[1], 0)?;
            let third = field(widths[2], 0)?;
            let number = u32::try_from(number).ok()?;
            entries.push((
                number,
                match kind {
                    0 => TailEntry::Free,
                    1 => TailEntry::Normal {
                        offset: usize::try_from(second).ok()?,
                        generation: u16::try_from(third).ok()?,
                    },
                    2 => TailEntry::Compressed {
                        container: u32::try_from(second).ok()?,
                    },
                    _ => continue,
                },
            ));
        }
    }
    let more = dict
        .get(b"Prev")
        .and_then(Object::as_i64)
        .ok()
        .and_then(|n| usize::try_from(n).ok())
        .into_iter()
        .collect();
    Some((entries, more))
}

/// dss_objects returns the objects the catalog's /DSS reaches through
/// dictionaries, arrays and streams' dictionaries: itself, its VRI entries,
/// certificates, OCSP responses and CRLs. Not those the catalog reaches
/// otherwise too: a DSS that lists a page's content stream, as a document
/// prepared before signing may, doesn't make that stream validation data
fn dss_objects(doc: &Document) -> std::collections::HashSet<ObjectId> {
    let Ok(catalog) = doc.catalog() else {
        return Default::default();
    };
    let Ok(dss) = catalog.get(b"DSS") else {
        return Default::default();
    };
    let Some(mut held) = reached(doc, vec![dss]) else {
        return Default::default();
    };
    // the catalog's other entries, and the trailer's (its /Info)
    let others = catalog
        .iter()
        .filter(|(key, _)| key.as_slice() != b"DSS")
        .chain(
            doc.trailer
                .iter()
                .filter(|(key, _)| ![&b"Root"[..], b"Prev", b"XRefStm"].contains(&key.as_slice())),
        )
        .map(|(_, value)| value)
        .collect();
    // nothing counts as held unless all else is known
    let Some(elsewhere) = reached(doc, others) else {
        return Default::default();
    };
    held.retain(|id| !elsewhere.contains(id));
    held
}

/// reached returns the objects `from` refers to, and those they refer to,
/// through dictionaries, arrays and streams' dictionaries; the catalog
/// only as a reference, not what it holds. None past a million, more than
/// a PDF Blank signs has
fn reached<'a>(
    doc: &'a Document,
    from: Vec<&'a Object>,
) -> Option<std::collections::HashSet<ObjectId>> {
    let root = doc.trailer.get(b"Root").and_then(Object::as_reference).ok();
    let mut found = std::collections::HashSet::new();
    let mut stack = from;
    while let Some(object) = stack.pop() {
        if found.len() > 1_000_000 {
            return None;
        }
        match object {
            Object::Reference(id) => {
                if found.insert(*id) && Some(*id) != root {
                    if let Ok(target) = doc.get_object(*id) {
                        stack.push(target);
                    }
                }
            }
            Object::Dictionary(d) => stack.extend(d.iter().map(|(_, v)| v)),
            Object::Stream(s) => stack.extend(s.dict.iter().map(|(_, v)| v)),
            Object::Array(a) => stack.extend(a.iter()),
            _ => {}
        }
    }
    Some(found)
}

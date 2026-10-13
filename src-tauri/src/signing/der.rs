//! a few lines of DER: enough to hand-encode what the `cms` crate has no
//! type for (ESS signing-certificate-v2, RFC 3161 requests) and to walk
//! structures whose raw bytes matter (signed attributes, TSTInfo)

/// len encodes a length
pub fn len(n: usize) -> Vec<u8> {
    if n < 0x80 {
        vec![n as u8]
    } else {
        let bytes: Vec<u8> = n
            .to_be_bytes()
            .iter()
            .copied()
            .skip_while(|b| *b == 0)
            .collect();
        let mut out = vec![0x80 | bytes.len() as u8];
        out.extend(bytes);
        out
    }
}

/// tlv encodes `content` with `tag`
pub fn tlv(tag: u8, content: &[u8]) -> Vec<u8> {
    let mut out = vec![tag];
    out.extend(len(content.len()));
    out.extend_from_slice(content);
    out
}

/// seq encodes a SEQUENCE of `parts`
pub fn seq(parts: &[&[u8]]) -> Vec<u8> {
    tlv(0x30, &parts.concat())
}

/// octets encodes an OCTET STRING
pub fn octets(b: &[u8]) -> Vec<u8> {
    tlv(0x04, b)
}

/// uint encodes an unsigned INTEGER from big-endian bytes
pub fn uint(b: &[u8]) -> Vec<u8> {
    let mut v: Vec<u8> = b.iter().copied().skip_while(|x| *x == 0).collect();
    if v.is_empty() || v[0] & 0x80 != 0 {
        v.insert(0, 0);
    }
    tlv(0x02, &v)
}

/// a DER value as read: its tag, content and all its bytes
#[derive(Clone, Copy, Debug)]
pub struct Tlv<'a> {
    pub tag: u8,
    pub content: &'a [u8],
    /// tag + length + content
    pub raw: &'a [u8],
}

/// read reads one definite-length TLV; it returns it and the rest
pub fn read(data: &[u8]) -> Option<(Tlv<'_>, &[u8])> {
    let tag = *data.first()?;
    if tag & 0x1f == 0x1f {
        return None; // multi-byte tags: not needed here
    }
    let l0 = *data.get(1)? as usize;
    let (n, hdr) = if l0 < 0x80 {
        (l0, 2)
    } else {
        let k = l0 & 0x7f;
        if k == 0 || k > 4 {
            return None; // indefinite (BER) or absurd
        }
        let mut n = 0usize;
        for i in 0..k {
            n = (n << 8) | *data.get(2 + i)? as usize;
        }
        (n, 2 + k)
    };
    let end = hdr.checked_add(n)?;
    if end > data.len() {
        return None;
    }
    Some((
        Tlv {
            tag,
            content: &data[hdr..end],
            raw: &data[..end],
        },
        &data[end..],
    ))
}

/// children reads all TLVs inside a constructed value
pub fn children(mut data: &[u8]) -> Option<Vec<Tlv<'_>>> {
    let mut out = vec![];
    while !data.is_empty() {
        let (t, rest) = read(data)?;
        out.push(t);
        data = rest;
    }
    Some(out)
}

/// a parsed BER element (definite or indefinite length)
struct Ber<'a> {
    tag: u8,
    content: BerContent<'a>,
}

/// what a BER element holds
enum BerContent<'a> {
    Primitive(&'a [u8]),
    Constructed(Vec<Ber<'a>>),
}

/// parse_ber reads one BER element, nested at most 64 deep
fn parse_ber(data: &[u8], depth: usize) -> Option<(Ber<'_>, &[u8])> {
    if depth > 64 {
        return None;
    }
    let tag = *data.first()?;
    if tag & 0x1f == 0x1f {
        return None;
    }
    let constructed = tag & 0x20 != 0;
    let l0 = *data.get(1)? as usize;
    if l0 == 0x80 {
        if !constructed {
            return None;
        }
        let mut rest = &data[2..];
        let mut kids = vec![];
        loop {
            if rest.starts_with(&[0, 0]) {
                return Some((
                    Ber {
                        tag,
                        content: BerContent::Constructed(kids),
                    },
                    &rest[2..],
                ));
            }
            let (k, r) = parse_ber(rest, depth + 1)?;
            kids.push(k);
            rest = r;
        }
    }
    let (t, rest) = read(data)?;
    if constructed {
        let mut kids = vec![];
        let mut inner = t.content;
        while !inner.is_empty() {
            let (k, r) = parse_ber(inner, depth + 1)?;
            kids.push(k);
            inner = r;
        }
        Some((
            Ber {
                tag,
                content: BerContent::Constructed(kids),
            },
            rest,
        ))
    } else {
        Some((
            Ber {
                tag,
                content: BerContent::Primitive(t.content),
            },
            rest,
        ))
    }
}

/// flatten returns the octets of a (possibly constructed) string
fn flatten(b: &Ber) -> Vec<u8> {
    match &b.content {
        BerContent::Primitive(c) => c.to_vec(),
        BerContent::Constructed(kids) => kids.iter().flat_map(flatten).collect(),
    }
}

/// encode_der writes a BER element as DER; see ber_to_der for `deep` and
/// `p12`
fn encode_der(b: &Ber, deep: bool, p12: bool) -> Vec<u8> {
    match (&b.content, b.tag) {
        (BerContent::Primitive(c), 0x04) => tlv(0x04, &maybe_deep(c, deep, p12)),
        (BerContent::Primitive(c), tag) => tlv(tag, c),
        (BerContent::Constructed(_), 0x24) => tlv(0x04, &maybe_deep(&flatten(b), deep, p12)),
        (BerContent::Constructed(kids), tag) => {
            // EncryptedContentInfo ::= SEQUENCE { contentType OID, alg SEQUENCE,
            //   encryptedContent [0] IMPLICIT OCTET STRING }: a constructed [0]
            // here is a chunked OCTET STRING, which DER makes primitive
            let implicit_octets = p12
                && tag == 0x30
                && kids.len() == 3
                && kids[0].tag == 0x06
                && kids[1].tag == 0x30
                && kids[2].tag == 0xa0;
            let mut out = vec![];
            for (i, k) in kids.iter().enumerate() {
                if implicit_octets && i == 2 {
                    out.extend(tlv(0x80, &flatten(k)));
                } else {
                    out.extend(encode_der(k, deep, p12));
                }
            }
            // an HMAC PRF without parameters, as NSS writes it: pkcs5 0.7 (under
            // p12-keystore 0.2) wants the NULL, so add it (fixed in pkcs5 0.8)
            if p12 && tag == 0x30 && kids.len() == 1 && kids[0].tag == 0x06 {
                if let BerContent::Primitive(oid) = &kids[0].content {
                    if oid.len() == 8
                        && oid.starts_with(&[0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x02])
                        && (7..=13).contains(&oid[7])
                    {
                        out.extend([0x05, 0x00]);
                    }
                }
            }
            tlv(tag, &out)
        }
    }
}

/// fix_cms_sets is for reading CMS that NSS wrote: the certificates [0] of a SignedData
/// (whose second element is the digestAlgorithms SET) can hold the same
/// certificate twice and be unsorted, which the `der` crate rejects. The
/// certificates aren't signed, so sort and dedupe them.
pub fn fix_cms_sets(der: &[u8]) -> Option<Vec<u8>> {
    fn walk(t: &Tlv, depth: usize) -> Option<Vec<u8>> {
        if depth > 32 || t.tag & 0x20 == 0 {
            return Some(t.raw.to_vec());
        }
        let kids = children(t.content)?;
        let signed_data =
            t.tag == 0x30 && kids.len() >= 4 && kids[0].tag == 0x02 && kids[1].tag == 0x31;
        let mut out = vec![];
        for (i, k) in kids.iter().enumerate() {
            if signed_data && (k.tag == 0xa0 || i == 1) {
                let mut elems: Vec<Vec<u8>> = children(k.content)?
                    .iter()
                    .map(|c| c.raw.to_vec())
                    .collect();
                elems.sort();
                elems.dedup();
                out.extend(tlv(k.tag, &elems.concat()));
            } else {
                out.extend(walk(k, depth + 1)?);
            }
        }
        Some(tlv(t.tag, &out))
    }
    let (t, _) = read(der)?;
    walk(&t, 0)
}

/// maybe_deep converts the content of an OCTET STRING too, with `deep`,
/// when it holds a SEQUENCE
fn maybe_deep(c: &[u8], deep: bool, p12: bool) -> Vec<u8> {
    // NSS nests BER (an indefinite SEQUENCE) inside OCTET STRINGs, and
    // SafeContents (DER) hold the AlgorithmIdentifiers to fix; anything that
    // parses completely as one SEQUENCE is converted (an encrypted blob that
    // happens to parse is astronomically unlikely, and the key is matched
    // against its certificate afterwards)
    if deep && c.first() == Some(&0x30) {
        if let Some(d) = ber_to_der(c, true, p12) {
            return d;
        }
    }
    c.to_vec()
}

/// ber_to_der turns BER into DER: definite lengths, primitive strings.
/// With `deep`, OCTET STRINGs that hold a SEQUENCE are converted too;
/// `p12` adds the PKCS#12 fix-ups (implicit encryptedContent, HMAC PRF
/// parameters).
pub fn ber_to_der(data: &[u8], deep: bool, p12: bool) -> Option<Vec<u8>> {
    let (b, rest) = parse_ber(data, 0)?;
    if !rest.iter().all(|x| *x == 0) {
        return None;
    }
    Some(encode_der(&b, deep, p12))
}

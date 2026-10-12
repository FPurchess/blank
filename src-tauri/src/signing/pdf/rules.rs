//! what may be added to a PDF (see .claude/rules/signing.md), read once: a
//! certification's DocMDP permission, whether it is signed already, and
//! the fields earlier signatures locked (FieldMDP). Encrypted PDFs never
//! get this far: `load_for_update` refuses them.

use std::collections::HashSet;

use lopdf::{Dictionary, Document, Object};

use super::{docmdp_permission, form_fields, resolve};

/// the fields one signature locks once it is signed
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Lock {
    /// every field
    All,
    /// only these, by full name
    Include(Vec<String>),
    /// every field but these
    Exclude(Vec<String>),
}

impl Lock {
    /// read reads a FieldMDP lock: a field's `/Lock`, or the
    /// TransformParams of a FieldMDP reference
    fn read(doc: &Document, dict: &Dictionary) -> Option<Self> {
        let names = || -> Vec<String> {
            dict.get(b"Fields")
                .ok()
                .and_then(|f| resolve(doc, f))
                .and_then(|f| f.as_array().ok())
                .map(|fields| {
                    fields
                        .iter()
                        .filter_map(|f| resolve(doc, f))
                        .filter_map(|f| lopdf::decode_text_string(f).ok())
                        .collect()
                })
                .unwrap_or_default()
        };
        match dict.get(b"Action").and_then(Object::as_name).ok()? {
            b"All" => Some(Lock::All),
            b"Include" => Some(Lock::Include(names())),
            b"Exclude" => Some(Lock::Exclude(names())),
            _ => None,
        }
    }

    /// locks tells whether this lock covers the field `name`
    fn locks(&self, name: &str) -> bool {
        match self {
            Lock::All => true,
            Lock::Include(names) => names.iter().any(|n| n == name),
            Lock::Exclude(names) => !names.iter().any(|n| n == name),
        }
    }
}

/// what may be added to a PDF
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Rules {
    /// the DocMDP permission of a certified PDF: 1 no changes, 2 filling in
    /// and signing, 3 annotations too
    pub docmdp: Option<i64>,
    /// a signature field of it is signed
    pub signed: bool,
    /// what the signed signatures lock
    pub locks: Vec<Lock>,
}

impl Rules {
    /// read reads the rules of `doc`
    pub fn read(doc: &Document) -> Self {
        let docmdp = docmdp_permission(doc);
        let mut signed = docmdp.is_some();
        let mut locks = vec![];
        let mut seen = HashSet::new();
        for field in form_fields(doc).iter().filter(|field| field.signature) {
            let Some(value) = field
                .dict
                .get(b"V")
                .ok()
                .and_then(|v| resolve(doc, v))
                .and_then(|v| v.as_dict().ok())
            else {
                continue;
            };
            signed = true;
            // a lock on the field takes effect once it is signed
            if let Some(lock) = field
                .dict
                .get(b"Lock")
                .ok()
                .and_then(|l| resolve(doc, l))
                .and_then(|l| l.as_dict().ok())
                .and_then(|l| Lock::read(doc, l))
            {
                if seen.insert(format!("{lock:?}")) {
                    locks.push(lock);
                }
            }
            // and the signature's own FieldMDP reference
            let references = value
                .get(b"Reference")
                .ok()
                .and_then(|r| resolve(doc, r))
                .and_then(|r| r.as_array().ok());
            for reference in references.into_iter().flatten() {
                let Some(reference) = resolve(doc, reference).and_then(|r| r.as_dict().ok()) else {
                    continue;
                };
                if reference
                    .get(b"TransformMethod")
                    .and_then(Object::as_name)
                    .ok()
                    != Some(b"FieldMDP")
                {
                    continue;
                }
                if let Some(lock) = reference
                    .get(b"TransformParams")
                    .ok()
                    .and_then(|p| resolve(doc, p))
                    .and_then(|p| p.as_dict().ok())
                    .and_then(|p| Lock::read(doc, p))
                {
                    if seen.insert(format!("{lock:?}")) {
                        locks.push(lock);
                    }
                }
            }
        }
        Self {
            docmdp,
            signed,
            locks,
        }
    }

    /// allows_changes tells whether anything may be added, a signature
    /// included: not to a certified PDF that allows no changes
    pub fn allows_changes(&self) -> bool {
        self.docmdp != Some(1)
    }

    /// allows_page_content tells whether stamps may go into the pages'
    /// content: not once the PDF is signed or certified (P=2 or 3 allow
    /// filling in and signing, not changing the pages)
    pub fn allows_page_content(&self) -> bool {
        !self.signed && self.docmdp.is_none()
    }

    /// locks tells whether an earlier signature locked the field `name`
    pub fn locks(&self, name: &str) -> bool {
        self.locks.iter().any(|lock| lock.locks(name))
    }
}

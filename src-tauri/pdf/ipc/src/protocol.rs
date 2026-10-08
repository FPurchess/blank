//! What the app and the helper say to each other, protocol version 1. Each
//! frame's header (frame.rs) is one of these as JSON:
//!
//! - the helper's first frame, unasked: `Hello`, with the protocol version
//!   and the ops it knows; the app stops a helper of another version;
//! - a request: `{"id": n ≥ 1, "op": "…", …}`;
//! - its answer: `{"id": n, "ok": …}` or `{"id": n, "error": {"kind": "…"}}`.
//!
//! Within version 1 a new op is optional: the app checks `Hello::ops`, and
//! the helper answers `unknownOp`. A breaking change raises `PROTOCOL` and the
//! frame's magic. Positions and sizes are display points: from the top left
//! of the page's crop box after its `/Rotate`, with its UserUnit applied.

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL: u32 = 1;

/// the most pixels a page is drawn with, 16 MP (4096 × 4096): the webview
/// asks for no more (`MAX_PAGE_PIXELS` in src/pdf/frames.ts)
pub const MAX_PIXELS: u64 = 1 << 24;

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Op {
    /// opens the PDF in the body; what was open before is closed
    Open {
        password: Option<String>,
    },
    /// the pages `from..to`
    Pages {
        from: usize,
        to: usize,
    },
    /// draws a page at `scale` (1 = a pixel per point); the answer's body is
    /// its pixels, RGBA, opaque
    Render {
        page: usize,
        scale: f32,
    },
    Fields,
    Signatures,
    /// stops request `target`, which then answers `cancelled`; no answer of
    /// its own
    Cancel {
        target: u64,
    },
    Ping,
}

impl Op {
    /// every op's name, as the helper says in its hello
    pub const NAMES: [&'static str; 7] = [
        "open",
        "pages",
        "render",
        "fields",
        "signatures",
        "cancel",
        "ping",
    ];
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Request {
    pub id: u64,
    #[serde(flatten)]
    pub op: Op,
}

/// why a request failed
#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ErrorKind {
    BadRequest,
    UnknownOp,
    NeedsPassword,
    /// not a PDF the engine can read
    Damaged,
    /// past the memory the helper may use, or the pixels it draws
    TooComplex,
    Cancelled,
    /// anything else the engine threw
    Engine,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Failure {
    pub kind: ErrorKind,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub enum Outcome {
    Ok(Value),
    Error(Failure),
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Response {
    pub id: u64,
    #[serde(flatten)]
    pub outcome: Outcome,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Hello {
    /// always 0
    pub id: u64,
    /// always "hello"
    pub event: String,
    pub protocol: u32,
    pub engine: String,
    pub engine_version: String,
    pub ops: Vec<String>,
}

/// `[x, y, width, height]` in display points
pub type Rect = [f32; 4];

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct OpenInfo {
    pub pages: usize,
    /// the engine had to repair the file to read it
    pub repaired: bool,
    /// it is encrypted, with no password needed to open it
    pub encrypted: bool,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PageInfo {
    pub width: f32,
    pub height: f32,
    /// the page's `/Rotate`: 0, 90, 180 or 270
    pub rotation: u32,
    pub user_unit: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct RenderInfo {
    pub width: u32,
    pub height: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum FieldKind {
    Text,
    Checkbox,
    Radio,
    Combo,
    List,
    Button,
    Signature,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct FieldFlags {
    pub read_only: bool,
    pub required: bool,
    pub multiline: bool,
    pub comb: bool,
    pub max_len: Option<u32>,
}

/// where a field shows: one of its widgets
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Widget {
    pub page: usize,
    pub rect: Rect,
    /// a checkbox's or radio button's state when it is on
    pub on_value: Option<String>,
}

/// a field of the PDF's form (AcroForm), with its full name and what it
/// inherits
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Field {
    pub name: String,
    pub kind: FieldKind,
    /// its `/TU`, what it is called for people
    pub label: Option<String>,
    pub value: String,
    /// a choice's options
    pub options: Vec<String>,
    pub flags: FieldFlags,
    /// a signature field that holds a signature
    pub signed: bool,
    /// its widgets on the pages; none for one that shows nowhere
    pub widgets: Vec<Widget>,
}

/// a signature in the PDF: where it is and what it says of itself; whether
/// it is valid is for the app's verify.rs to say
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct SigInfo {
    pub field: String,
    /// its first widget's page and box, if it shows on a page
    pub page: Option<usize>,
    pub rect: Option<Rect>,
    pub sub_filter: Option<String>,
    pub reason: Option<String>,
    pub location: Option<String>,
    pub name: Option<String>,
    /// its `/M`, as written
    pub time: Option<String>,
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn writes_requests_and_answers_as_the_protocol_says() {
        let request = Request {
            id: 3,
            op: Op::Render {
                page: 0,
                scale: 2.0,
            },
        };
        let written = serde_json::to_value(&request).unwrap();
        assert_eq!(
            written,
            json!({"id": 3, "op": "render", "page": 0, "scale": 2.0})
        );
        assert_eq!(serde_json::from_value::<Request>(written).unwrap(), request);
        let fields: Request = serde_json::from_value(json!({"id": 4, "op": "fields"})).unwrap();
        assert_eq!(fields.op, Op::Fields);

        let ok = Response {
            id: 3,
            outcome: Outcome::Ok(json!({"width": 2, "height": 1})),
        };
        assert_eq!(
            serde_json::to_value(&ok).unwrap(),
            json!({"id": 3, "ok": {"width": 2, "height": 1}})
        );
        let error = json!({"id": 5, "error": {"kind": "tooComplex"}});
        let read: Response = serde_json::from_value(error).unwrap();
        assert_eq!(
            read.outcome,
            Outcome::Error(Failure {
                kind: ErrorKind::TooComplex
            })
        );
    }

    #[test]
    fn names_every_op() {
        for name in Op::NAMES {
            let mut request = json!({"id": 1, "op": name});
            match name {
                "open" => request["password"] = Value::Null,
                "pages" => {
                    request["from"] = json!(0);
                    request["to"] = json!(1);
                }
                "render" => {
                    request["page"] = json!(0);
                    request["scale"] = json!(1);
                }
                "cancel" => request["target"] = json!(1),
                _ => {}
            }
            assert!(serde_json::from_value::<Request>(request).is_ok(), "{name}");
        }
    }
}

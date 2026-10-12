//! What the app and the helper say to each other, protocol version 1. Each
//! frame's header (frame.rs) is one of these as JSON:
//!
//! - the helper's first frame, unasked: `Hello`, with the protocol version
//!   and the ops it knows; the app stops a helper of another version;
//! - a request: `{"id": n ≥ 1, "op": "…", …}`;
//! - its answer: `{"id": n, "ok": …}` or `{"id": n, "error": {"kind": "…"}}`.
//!
//! Within version 1 a new op is optional: a helper that doesn't know it
//! answers `unknownOp`. The hello lists the ops the helper knows
//! (`Hello::ops`), and the client asks none other (`text`, `setFills` and
//! `save` came after the first ops). A breaking change raises `PROTOCOL`
//! and the frame's magic. Positions and sizes are display points: from the
//! top left of the page's crop box after its `/Rotate`, with its UserUnit
//! applied.

use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL: u32 = 1;

/// the most pixels a page is drawn with, 16 MP (4096 × 4096): the webview
/// asks for no more (`MAX_PAGE_PIXELS` in src/pdf/frames.ts)
pub const MAX_PIXELS: u64 = 1 << 24;

/// the most pages one `pages` request asks for, so that its answer stays
/// well within a frame's header (`MAX_HEADER`, ~60 bytes a page)
pub const PAGES_PER_REQUEST: usize = 4096;

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
    /// the words and drawn lines of a page (`PageText`), for the places to
    /// sign or fill in on a PDF without a form
    Text {
        page: usize,
    },
    /// the form's fields (`Field`), with the values the fills gave them
    Fields,
    /// fills in the form: always the whole set, on the PDF as it was opened
    /// (what an earlier `setFills` did is undone first); the answer is
    /// `Filled`, the pages to draw again. A value the field can't take, or
    /// a field that isn't there, fails the whole set and keeps the last one;
    /// the failure names that fill's field (`Failure::field`)
    SetFills {
        fills: Vec<Fill>,
    },
    /// the PDF with the fills as an incremental update: the bytes opened,
    /// unchanged, then the update; refused for a repaired or encrypted PDF
    Save,
    /// stops request `target`, which then answers `cancelled`; no answer of
    /// its own
    Cancel {
        target: u64,
    },
    Ping,
}

impl Op {
    /// every op's name, as the helper says in its hello
    pub const NAMES: [&'static str; 9] = [
        "open", "pages", "render", "text", "fields", "setFills", "save", "cancel", "ping",
    ];

    /// its name, as in the request and in the log
    pub fn name(&self) -> &'static str {
        match self {
            Op::Open { .. } => "open",
            Op::Pages { .. } => "pages",
            Op::Render { .. } => "render",
            Op::Text { .. } => "text",
            Op::Fields => "fields",
            Op::SetFills { .. } => "setFills",
            Op::Save => "save",
            Op::Cancel { .. } => "cancel",
            Op::Ping => "ping",
        }
    }
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
    /// `save`: the engine had to repair the PDF to read it, so an update
    /// can't be appended to it
    Repaired,
    /// `save`: the PDF is encrypted
    Encrypted,
    /// `setFills`: a value has characters the field's font can't show
    MissingGlyphs,
}

impl ErrorKind {
    /// its name, as in the answer
    pub fn name(self) -> &'static str {
        match self {
            ErrorKind::BadRequest => "badRequest",
            ErrorKind::UnknownOp => "unknownOp",
            ErrorKind::NeedsPassword => "needsPassword",
            ErrorKind::Damaged => "damaged",
            ErrorKind::TooComplex => "tooComplex",
            ErrorKind::Cancelled => "cancelled",
            ErrorKind::Engine => "engine",
            ErrorKind::Repaired => "repaired",
            ErrorKind::Encrypted => "encrypted",
            ErrorKind::MissingGlyphs => "missingGlyphs",
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Failure {
    pub kind: ErrorKind,
    /// `setFills`: the field of the fill that failed, when one did
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
}

impl From<ErrorKind> for Failure {
    fn from(kind: ErrorKind) -> Self {
        Failure { kind, field: None }
    }
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

/// a word on a page, as the engine reads the page's text
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Word {
    pub text: String,
    pub rect: Rect,
}

/// what a page says and the lines drawn on it: its words in reading order,
/// and its thin horizontal lines (at least 40 pt wide, at most 2 pt high,
/// stroked or filled, not white: `RULE_*` in the helper's shim), where
/// people sign or write
#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
pub struct PageText {
    pub words: Vec<Word>,
    pub rules: Vec<Rect>,
}

/// what a field is filled in with: a checkbox's `true` or `false`; else
/// text: a text field's, a choice's (one of its options, or any text for a
/// combo box that may be edited), a radio button's state when on (its
/// widget's `onValue`, or "Off" for none)
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
#[serde(untagged)]
pub enum FillValue {
    Checked(bool),
    Text(String),
}

/// a field (by its full name) and what it is filled in with
#[derive(Serialize, Deserialize, Debug, Clone, PartialEq)]
pub struct Fill {
    pub field: String,
    pub value: FillValue,
}

/// what `setFills` changed: the pages whose fields look different now
#[derive(Serialize, Deserialize, Debug, Clone, Default, PartialEq)]
pub struct Filled {
    pub pages: Vec<usize>,
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
        let fills = Request {
            id: 6,
            op: Op::SetFills {
                fills: vec![
                    Fill {
                        field: "agree".into(),
                        value: FillValue::Checked(true),
                    },
                    Fill {
                        field: "name".into(),
                        value: FillValue::Text("Ada".into()),
                    },
                ],
            },
        };
        let written = serde_json::to_value(&fills).unwrap();
        assert_eq!(
            written,
            json!({"id": 6, "op": "setFills", "fills": [
                {"field": "agree", "value": true},
                {"field": "name", "value": "Ada"}
            ]})
        );
        assert_eq!(serde_json::from_value::<Request>(written).unwrap(), fills);

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
        assert_eq!(read.outcome, Outcome::Error(ErrorKind::TooComplex.into()));
        // a refused fill names its field
        let refused = Response {
            id: 7,
            outcome: Outcome::Error(Failure {
                kind: ErrorKind::MissingGlyphs,
                field: Some("name".into()),
            }),
        };
        assert_eq!(
            serde_json::to_value(&refused).unwrap(),
            json!({"id": 7, "error": {"kind": "missingGlyphs", "field": "name"}})
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
                "text" => request["page"] = json!(0),
                "setFills" => {
                    request["fills"] =
                        json!([{"field": "a", "value": true}, {"field": "b", "value": "x"}])
                }
                "cancel" => request["target"] = json!(1),
                _ => {}
            }
            let request = serde_json::from_value::<Request>(request).unwrap();
            assert_eq!(request.op.name(), name);
        }
        for kind in [
            ErrorKind::BadRequest,
            ErrorKind::UnknownOp,
            ErrorKind::NeedsPassword,
            ErrorKind::Damaged,
            ErrorKind::TooComplex,
            ErrorKind::Cancelled,
            ErrorKind::Engine,
            ErrorKind::Repaired,
            ErrorKind::Encrypted,
            ErrorKind::MissingGlyphs,
        ] {
            assert_eq!(serde_json::to_value(kind).unwrap(), kind.name());
        }
    }
}

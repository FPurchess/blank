//! A helper for the client's tests (tests/client.rs), on the real loop: its
//! "PDF" is JSON, `{"pages": ["ok", "slow", …]}`, which says what drawing each
//! page does: "ok" draws a solid colour, "slow" runs until cancelled, "stuck"
//! ignores the cancel, "crash" dies, "reserve" asks for more memory than
//! the helper's limits allow, "short" draws fewer pixels than its size says,
//! "huge" a page past `MAX_PIXELS`. Its form is a text field "name" on page
//! 0 and a checkbox "agree" on page 1; a fill with "中" lacks glyphs, a
//! checkbox's text or a text field's `true` is a bad request (each refusal
//! names the fill that failed), `setFills` answers the pages whose values
//! changed since the last set, and `save` appends the fills to the "PDF" as
//! a line of JSON. Each page's text
//! is the word "page" and its number, over a rule. `--protocol N` says hello with another
//! version; `--garbage` answers every request with bytes that aren't a frame
//! and then keeps running.

use std::io;
use std::sync::Arc;
use std::time::{Duration, Instant};

use blank_pdf_ipc::engine::{Bitmap, CancelFlag, EngineError, PdfDoc, PdfEngine};
use blank_pdf_ipc::protocol::{
    ErrorKind, Field, FieldFlags, FieldKind, Fill, FillValue, OpenInfo, PageInfo, PageText, Widget,
    Word,
};
use blank_pdf_ipc::{frame, limits, serve};

struct Fake;

struct FakeDoc {
    bytes: Arc<[u8]>,
    pages: Vec<String>,
    fills: Vec<Fill>,
}

impl PdfEngine for Fake {
    type Doc = FakeDoc;

    fn name(&self) -> &'static str {
        "fake"
    }

    fn version(&self) -> String {
        "1".into()
    }

    fn open(&self, bytes: Arc<[u8]>, _password: Option<&str>) -> Result<FakeDoc, EngineError> {
        let json: serde_json::Value =
            serde_json::from_slice(&bytes).map_err(|_| ErrorKind::Damaged)?;
        let pages = json["pages"]
            .as_array()
            .ok_or(ErrorKind::Damaged)?
            .iter()
            .map(|page| page.as_str().unwrap_or("ok").to_string())
            .collect();
        Ok(FakeDoc {
            bytes,
            pages,
            fills: vec![],
        })
    }
}

impl PdfDoc for FakeDoc {
    fn info(&self) -> OpenInfo {
        OpenInfo {
            pages: self.pages.len(),
            repaired: false,
            encrypted: false,
        }
    }

    fn page(&mut self, _index: usize) -> Result<PageInfo, EngineError> {
        Ok(PageInfo {
            width: 10.0,
            height: 20.0,
            rotation: 0,
            user_unit: 1.0,
        })
    }

    fn render(
        &mut self,
        index: usize,
        scale: f32,
        cancel: &CancelFlag,
    ) -> Result<Bitmap, EngineError> {
        match self.pages[index].as_str() {
            "slow" => {
                let start = Instant::now();
                while !cancel.is_cancelled() && start.elapsed() < Duration::from_secs(10) {
                    std::thread::sleep(Duration::from_millis(5));
                }
                return Err(ErrorKind::Cancelled.into());
            }
            "stuck" => std::thread::sleep(Duration::from_secs(60)),
            // killed rather than aborted: a core dump would keep stdout
            // open for a while
            "crash" => {
                #[cfg(unix)]
                unsafe {
                    libc::kill(libc::getpid(), libc::SIGKILL);
                }
                std::process::exit(101);
            }
            "reserve" => {
                // past the address space limits::limit_helper allows on Linux
                let mut memory: Vec<u8> = Vec::new();
                return Err(match memory.try_reserve_exact(5 << 30) {
                    Err(_) => ErrorKind::TooComplex,
                    Ok(()) => ErrorKind::Engine,
                }
                .into());
            }
            "short" => {
                return Ok(Bitmap {
                    width: 10,
                    height: 10,
                    rgba: vec![0; 4],
                })
            }
            "huge" => {
                return Ok(Bitmap {
                    width: 1 << 13,
                    height: 1 << 13,
                    rgba: vec![],
                })
            }
            _ => {}
        }
        let (width, height) = ((10.0 * scale) as u32, (20.0 * scale) as u32);
        let colour = [index as u8 * 40, 100, 200, 255];
        Ok(Bitmap {
            width,
            height,
            rgba: colour.repeat((width * height) as usize),
        })
    }

    fn text(&mut self, index: usize) -> Result<PageText, EngineError> {
        Ok(PageText {
            words: vec![
                Word {
                    text: "page".into(),
                    rect: [1.0, 2.0, 3.0, 1.0],
                },
                Word {
                    text: index.to_string(),
                    rect: [5.0, 2.0, 1.0, 1.0],
                },
            ],
            rules: vec![[1.0, 4.0, 8.0, 0.5]],
        })
    }

    fn fields(&mut self) -> Result<Vec<Field>, EngineError> {
        let value =
            |name: &str, empty: &str| match self.fills.iter().find(|fill| fill.field == name) {
                Some(Fill {
                    value: FillValue::Text(text),
                    ..
                }) => text.clone(),
                Some(Fill {
                    value: FillValue::Checked(true),
                    ..
                }) => "Yes".into(),
                _ => empty.into(),
            };
        let field = |name: &str, kind, page, value| Field {
            name: name.into(),
            kind,
            label: None,
            value,
            options: vec![],
            flags: FieldFlags::default(),
            signed: false,
            widgets: vec![Widget {
                page,
                rect: [1.0, 1.0, 5.0, 2.0],
                on_value: None,
            }],
        };
        Ok(vec![
            field("name", FieldKind::Text, 0, value("name", "")),
            field("agree", FieldKind::Checkbox, 1, value("agree", "Off")),
        ])
    }

    fn set_fills(&mut self, fills: &[Fill]) -> Result<Vec<usize>, EngineError> {
        let page = |field: &str| if field == "name" { 0 } else { 1 };
        for (index, fill) in fills.iter().enumerate() {
            let refused = |kind| Err(EngineError::of_fill(kind, index));
            match (fill.field.as_str(), &fill.value) {
                ("name", FillValue::Text(text)) if text.contains('中') => {
                    return refused(ErrorKind::MissingGlyphs)
                }
                ("name", FillValue::Text(_)) | ("agree", FillValue::Checked(_)) => {}
                _ => return refused(ErrorKind::BadRequest),
            }
        }
        // as the real one: the pages of the fields whose values changed,
        // filled in, changed or no longer filled in
        let value = |set: &[Fill], field: &str| {
            set.iter()
                .find(|fill| fill.field == field)
                .map(|fill| fill.value.clone())
        };
        let mut pages: Vec<usize> = ["name", "agree"]
            .into_iter()
            .filter(|field| value(fills, field) != value(&self.fills, field))
            .map(page)
            .collect();
        pages.sort_unstable();
        pages.dedup();
        self.fills = fills.to_vec();
        Ok(pages)
    }

    fn save_incremental(&mut self) -> Result<Vec<u8>, EngineError> {
        let mut saved = self.bytes.to_vec();
        if !self.fills.is_empty() {
            saved.push(b'\n');
            saved.extend(serde_json::to_vec(&self.fills).map_err(|_| ErrorKind::Engine)?);
        }
        Ok(saved)
    }
}

fn main() {
    limits::limit_helper();
    let args: Vec<String> = std::env::args().collect();
    if let Some(at) = args.iter().position(|arg| arg == "--protocol") {
        let hello = serde_json::json!({"id": 0, "event": "hello", "protocol": args[at + 1].parse::<u32>().unwrap(), "engine": "fake", "engineVersion": "1", "ops": []});
        frame::write_frame(&mut io::stdout(), &serde_json::to_vec(&hello).unwrap(), &[]).unwrap();
        std::thread::sleep(Duration::from_secs(5));
        return;
    }
    if args.iter().any(|arg| arg == "--garbage") {
        let hello = serde_json::json!({"id": 0, "event": "hello", "protocol": blank_pdf_ipc::protocol::PROTOCOL, "engine": "fake", "engineVersion": "1", "ops": blank_pdf_ipc::protocol::Op::NAMES});
        let mut stdout = io::stdout();
        frame::write_frame(&mut stdout, &serde_json::to_vec(&hello).unwrap(), &[]).unwrap();
        let mut stdin = io::stdin();
        while frame::read_frame(&mut stdin, frame::MAX_BODY).is_ok() {
            io::Write::write_all(&mut stdout, b"not a frame at all").unwrap();
            io::Write::flush(&mut stdout).unwrap();
        }
        std::thread::sleep(Duration::from_secs(60));
        return;
    }
    serve::serve(&Fake, io::stdin(), io::stdout(), || std::process::exit(0)).unwrap();
}

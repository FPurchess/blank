//! A helper for the client's tests (tests/client.rs), on the real loop: its
//! "PDF" is JSON, `{"pages": ["ok", "slow", …]}`, which says what drawing each
//! page does: "ok" draws a solid colour, "slow" runs until cancelled, "stuck"
//! ignores the cancel, "crash" dies, "reserve" asks for more memory than
//! the helper's limits allow. `--protocol N` says hello with another version.

use std::io;
use std::sync::Arc;
use std::time::{Duration, Instant};

use blank_pdf_ipc::engine::{Bitmap, CancelFlag, EngineError, PdfDoc, PdfEngine};
use blank_pdf_ipc::protocol::{ErrorKind, Field, OpenInfo, PageInfo, SigInfo};
use blank_pdf_ipc::{frame, limits, serve};

struct Fake;

struct FakeDoc {
    pages: Vec<String>,
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
        Ok(FakeDoc { pages })
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

    fn fields(&mut self) -> Result<Vec<Field>, EngineError> {
        Ok(vec![])
    }

    fn signatures(&mut self) -> Result<Vec<SigInfo>, EngineError> {
        Ok(vec![])
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
    serve::serve(&Fake, io::stdin(), io::stdout(), || std::process::exit(0)).unwrap();
}

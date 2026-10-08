//! The helper's loop: a thread reads the requests from stdin, and the engine
//! answers them one after the other on the thread that called `serve`, which
//! keeps the engine (MuPDF's context belongs to one thread). The reader takes
//! `cancel` at once, so a request that runs can be stopped.

use std::collections::BTreeSet;
use std::io::{self, Read, Write};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, PoisonError};
use std::thread;

use serde_json::Value;

use crate::engine::{CancelFlag, EngineError, PdfDoc, PdfEngine};
use crate::frame::{read_frame, write_frame, Frame, MAX_BODY};
use crate::protocol::{ErrorKind, Failure, Hello, Op, Outcome, Request, Response, PROTOCOL};

/// the request that runs, and the requests cancelled before they ran
#[derive(Default)]
struct Running {
    current: Option<(u64, CancelFlag)>,
    cancelled: BTreeSet<u64>,
}

type Shared = Arc<Mutex<Running>>;

fn lock(running: &Shared) -> std::sync::MutexGuard<'_, Running> {
    running.lock().unwrap_or_else(PoisonError::into_inner)
}

/// the most requests cancelled before they ran that are remembered
const MAX_CANCELLED: usize = 1024;

/// answers requests from `input` on `output` with `engine` until `input`
/// ends. `on_eof` runs on the reader's thread once it has, after what runs
/// was cancelled: the helper exits there, in case the engine doesn't stop.
pub fn serve<E: PdfEngine>(
    engine: &E,
    input: impl Read + Send + 'static,
    mut output: impl Write,
    on_eof: impl FnOnce() + Send + 'static,
) -> io::Result<()> {
    let hello = Hello {
        id: 0,
        event: "hello".into(),
        protocol: PROTOCOL,
        engine: engine.name().into(),
        engine_version: engine.version(),
        ops: Op::NAMES.iter().map(|name| name.to_string()).collect(),
    };
    write_frame(&mut output, &serde_json::to_vec(&hello)?, &[])?;

    let running = Shared::default();
    let (send, requests) = mpsc::channel::<(Value, Vec<u8>)>();
    let reader = running.clone();
    thread::spawn(move || {
        read_requests(input, &reader, send);
        if let Some((_, flag)) = &lock(&reader).current {
            flag.cancel();
        }
        on_eof();
    });

    let mut doc: Option<E::Doc> = None;
    for (header, body) in requests {
        let Some(id) = header.get("id").and_then(Value::as_u64) else {
            continue;
        };
        let flag = CancelFlag::default();
        {
            let mut running = lock(&running);
            if running.cancelled.remove(&id) {
                flag.cancel();
            }
            running.cancelled.retain(|&target| target > id);
            running.current = Some((id, flag.clone()));
        }
        let answer = if flag.is_cancelled() {
            Err(ErrorKind::Cancelled)
        } else {
            match parse(header) {
                Ok(op) => answer(engine, &mut doc, op, body, &flag),
                Err(kind) => Err(kind),
            }
        };
        lock(&running).current = None;
        let (outcome, body) = match answer {
            Ok((value, body)) => (Outcome::Ok(value), body),
            Err(kind) => (Outcome::Error(Failure { kind }), vec![]),
        };
        let header = serde_json::to_vec(&Response { id, outcome })?;
        write_frame(&mut output, &header, &body)?;
    }
    Ok(())
}

/// reads frames until the input ends or isn't frames; cancels are handled
/// here, the rest goes to the engine's thread
fn read_requests(mut input: impl Read, running: &Shared, send: mpsc::Sender<(Value, Vec<u8>)>) {
    while let Ok(Frame { header, body }) = read_frame(&mut input, MAX_BODY) {
        // a header that isn't JSON can't be answered: the stream is wrong
        let Ok(header) = serde_json::from_slice::<Value>(&header) else {
            return;
        };
        if header.get("op").and_then(Value::as_str) == Some("cancel") {
            if let Some(target) = header.get("target").and_then(Value::as_u64) {
                let mut running = lock(running);
                match &running.current {
                    Some((id, flag)) if *id == target => flag.cancel(),
                    _ if running.cancelled.len() < MAX_CANCELLED => {
                        running.cancelled.insert(target);
                    }
                    _ => {}
                }
            }
            continue;
        }
        if send.send((header, body)).is_err() {
            return;
        }
    }
}

fn parse(header: Value) -> Result<Op, ErrorKind> {
    let known = header
        .get("op")
        .and_then(Value::as_str)
        .is_some_and(|op| Op::NAMES.contains(&op));
    if !known {
        return Err(ErrorKind::UnknownOp);
    }
    serde_json::from_value::<Request>(header)
        .map(|request| request.op)
        .map_err(|_| ErrorKind::BadRequest)
}

type Answer = Result<(Value, Vec<u8>), ErrorKind>;

fn json(value: impl serde::Serialize) -> Answer {
    serde_json::to_value(value)
        .map(|value| (value, vec![]))
        .map_err(|_| ErrorKind::Engine)
}

fn answer<E: PdfEngine>(
    engine: &E,
    doc: &mut Option<E::Doc>,
    op: Op,
    body: Vec<u8>,
    cancel: &CancelFlag,
) -> Answer {
    let failed = |error: EngineError| error.kind;
    if let Op::Open { password } = &op {
        *doc = None;
        let opened = engine
            .open(Arc::from(body), password.as_deref())
            .map_err(failed)?;
        let info = opened.info();
        *doc = Some(opened);
        return json(info);
    }
    if op == Op::Ping {
        return json(serde_json::json!({}));
    }
    let doc = doc.as_mut().ok_or(ErrorKind::BadRequest)?;
    match op {
        Op::Pages { from, to } => {
            let to = to.min(doc.info().pages);
            let pages = (from.min(to)..to)
                .map(|index| doc.page(index))
                .collect::<Result<Vec<_>, _>>()
                .map_err(failed)?;
            json(pages)
        }
        Op::Render { page, scale } => {
            if !(scale.is_finite() && scale > 0.0) || page >= doc.info().pages {
                return Err(ErrorKind::BadRequest);
            }
            let bitmap = doc.render(page, scale, cancel).map_err(failed)?;
            let (value, _) = json(crate::protocol::RenderInfo {
                width: bitmap.width,
                height: bitmap.height,
            })?;
            Ok((value, bitmap.rgba))
        }
        Op::Fields => json(doc.fields().map_err(failed)?),
        Op::Signatures => json(doc.signatures().map_err(failed)?),
        Op::Open { .. } | Op::Ping | Op::Cancel { .. } => Err(ErrorKind::BadRequest),
    }
}

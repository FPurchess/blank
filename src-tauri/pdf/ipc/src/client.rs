//! The app's side: starts a helper for a PDF, asks it one request at a time,
//! and watches it. A request that takes too long is cancelled, and the helper
//! is killed when it doesn't stop (a hang). A crash, a hang or the system's
//! memory backstop is a failure: after the first, the next request starts a
//! new helper and opens the PDF again, and the request that failed isn't
//! asked again; after the second, the supervisor gives up (`Failed`), and only
//! a new one (the tab's "Open again") tries again. A helper stopped for being
//! idle isn't a failure.

use std::io;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, Instant};

use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::frame::{read_frame, write_frame, MAX_BODY};
use crate::limits::Backstop;
use crate::protocol::{ErrorKind, Hello, Op, OpenInfo, Outcome, Request, Response, PROTOCOL};

/// why a request got no answer
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PdfError {
    /// the helper answered with an error
    Engine(ErrorKind),
    /// it took too long and stopped when asked
    TimedOut,
    /// the helper died while it worked on it
    Crashed,
    /// the helper didn't stop when asked, and was killed
    Hung,
    /// the helper failed twice: this PDF isn't shown any more
    Failed,
    /// the helper couldn't be started, or speaks another protocol
    Start,
    /// the PDF couldn't be read again, or isn't the one opened
    Source,
}

impl PdfError {
    /// the name the webview and the log get
    pub fn kind(self) -> &'static str {
        match self {
            PdfError::Engine(kind) => match kind {
                ErrorKind::BadRequest => "badRequest",
                ErrorKind::UnknownOp => "unknownOp",
                ErrorKind::NeedsPassword => "needsPassword",
                ErrorKind::Damaged => "damaged",
                ErrorKind::TooComplex => "tooComplex",
                ErrorKind::Cancelled => "cancelled",
                ErrorKind::Engine => "engine",
            },
            PdfError::TimedOut => "timedOut",
            PdfError::Crashed => "crashed",
            PdfError::Hung => "hung",
            PdfError::Failed => "failed",
            PdfError::Start => "start",
            PdfError::Source => "source",
        }
    }
}

/// how long each kind of request may take
#[derive(Debug, Clone)]
pub struct Timeouts {
    pub start: Duration,
    pub open: Duration,
    pub render: Duration,
    pub read: Duration,
    /// how long a cancelled request has to answer before the helper is killed
    pub cancel: Duration,
}

impl Default for Timeouts {
    fn default() -> Self {
        Timeouts {
            start: Duration::from_secs(10),
            open: Duration::from_secs(20),
            render: Duration::from_secs(15),
            read: Duration::from_secs(15),
            cancel: Duration::from_secs(1),
        }
    }
}

/// how a helper is started
#[derive(Debug, Clone)]
pub struct HelperConfig {
    pub program: PathBuf,
    pub args: Vec<String>,
    /// stderr goes nowhere: MuPDF's warnings may quote the PDF
    pub quiet: bool,
    pub timeouts: Timeouts,
}

/// reads the PDF's bytes again, for a new helper after a crash or an idle
/// stop; it checks that the file is still the one opened
pub type Source = Box<dyn Fn() -> io::Result<Arc<[u8]>> + Send + Sync>;

enum Incoming {
    /// a frame's header and body
    Frame(Value, Vec<u8>),
    Closed,
}

/// a running helper
struct Helper {
    child: Child,
    stdin: Arc<Mutex<ChildStdin>>,
    answers: Receiver<Incoming>,
    next_id: u64,
    _backstop: Backstop,
}

fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
    mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

impl Helper {
    fn start(config: &HelperConfig) -> Result<Helper, PdfError> {
        let mut command = Command::new(&config.program);
        command
            .args(&config.args)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(if config.quiet {
                Stdio::null()
            } else {
                Stdio::inherit()
            });
        crate::limits::spawn_options(&mut command);
        let mut child = command.spawn().map_err(|error| {
            log::warn!("PDF helper: start: {}", error.kind());
            PdfError::Start
        })?;
        let backstop = Backstop::watch(&child);
        let (stdin, stdout) = (child.stdin.take(), child.stdout.take());
        let (Some(stdin), Some(mut stdout)) = (stdin, stdout) else {
            let _ = child.kill();
            return Err(PdfError::Start);
        };
        let (send, answers) = mpsc::channel();
        thread::spawn(move || {
            while let Ok(frame) = read_frame(&mut stdout, MAX_BODY) {
                let Ok(header) = serde_json::from_slice(&frame.header) else {
                    break;
                };
                if send.send(Incoming::Frame(header, frame.body)).is_err() {
                    return;
                }
            }
            let _ = send.send(Incoming::Closed);
        });
        let mut helper = Helper {
            child,
            stdin: Arc::new(Mutex::new(stdin)),
            answers,
            next_id: 1,
            _backstop: backstop,
        };
        helper.greet(config.timeouts.start)?;
        Ok(helper)
    }

    /// waits for the hello and checks its protocol
    fn greet(&mut self, timeout: Duration) -> Result<(), PdfError> {
        match self.answers.recv_timeout(timeout) {
            Ok(Incoming::Frame(header, _)) => match serde_json::from_value::<Hello>(header) {
                Ok(hello) if hello.protocol == PROTOCOL => Ok(()),
                _ => {
                    log::warn!("PDF helper: start: another protocol");
                    self.kill();
                    Err(PdfError::Start)
                }
            },
            _ => {
                log::warn!("PDF helper: start: no hello");
                self.kill();
                Err(PdfError::Start)
            }
        }
    }

    fn kill(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }

    /// how the helper ended, for the log: its exit code or signal
    fn ended(&mut self) -> String {
        match self.child.wait() {
            Ok(status) => {
                #[cfg(unix)]
                if let Some(signal) = std::os::unix::process::ExitStatusExt::signal(&status) {
                    return format!("signal {signal}");
                }
                status
                    .code()
                    .map_or_else(|| "unknown".into(), |code| format!("code {code}"))
            }
            Err(_) => "unknown".into(),
        }
    }

    /// asks `op` and waits for its answer at most `timeout`; `sent` learns
    /// the request's id once it's written, so another thread can cancel it
    fn call(
        &mut self,
        op: &Op,
        body: &[u8],
        timeout: Duration,
        cancel_timeout: Duration,
        sent: impl FnOnce(u64, Arc<Mutex<ChildStdin>>),
    ) -> Result<(Value, Vec<u8>), PdfError> {
        let id = self.next_id;
        self.next_id += 1;
        let header =
            serde_json::to_vec(&Request { id, op: op.clone() }).map_err(|_| PdfError::Start)?;
        if write_frame(&mut *locked(&self.stdin), &header, body).is_err() {
            return Err(self.crashed(op));
        }
        sent(id, self.stdin.clone());
        let deadline = Instant::now() + timeout;
        let mut cancelled_at: Option<Instant> = None;
        loop {
            let until = cancelled_at.map_or(deadline, |at| at + cancel_timeout);
            match self
                .answers
                .recv_timeout(until.saturating_duration_since(Instant::now()))
            {
                Ok(Incoming::Frame(header, body)) => {
                    // an answer to an earlier request, cancelled meanwhile, is dropped
                    let Ok(response) = serde_json::from_value::<Response>(header) else {
                        continue;
                    };
                    if response.id != id {
                        continue;
                    }
                    return match response.outcome {
                        Outcome::Ok(value) => Ok((value, body)),
                        Outcome::Error(_) if cancelled_at.is_some() => Err(PdfError::TimedOut),
                        Outcome::Error(failure) => Err(PdfError::Engine(failure.kind)),
                    };
                }
                Ok(Incoming::Closed) | Err(RecvTimeoutError::Disconnected) => {
                    return Err(self.crashed(op));
                }
                Err(RecvTimeoutError::Timeout) if cancelled_at.is_none() => {
                    cancelled_at = Some(Instant::now());
                    let cancel = serde_json::to_vec(&Request {
                        id: 0,
                        op: Op::Cancel { target: id },
                    })
                    .unwrap_or_default();
                    let _ = write_frame(&mut *locked(&self.stdin), &cancel, &[]);
                }
                Err(RecvTimeoutError::Timeout) => {
                    log::warn!("PDF helper: {}: hang", op_name(op));
                    self.kill();
                    return Err(PdfError::Hung);
                }
            }
        }
    }

    fn crashed(&mut self, op: &Op) -> PdfError {
        let ended = self.ended();
        log::warn!("PDF helper: {}: crash, {ended}", op_name(op));
        PdfError::Crashed
    }
}

impl Drop for Helper {
    fn drop(&mut self) {
        self.kill();
    }
}

fn op_name(op: &Op) -> &'static str {
    match op {
        Op::Open { .. } => "open",
        Op::Pages { .. } => "pages",
        Op::Render { .. } => "render",
        Op::Fields => "fields",
        Op::Signatures => "signatures",
        Op::Cancel { .. } => "cancel",
        Op::Ping => "ping",
    }
}

struct State {
    helper: Option<Helper>,
    /// what opening the PDF told, once it was opened
    info: Option<OpenInfo>,
    /// the PDF while a helper has it open; dropped with the helper
    bytes: Option<Arc<[u8]>>,
    failures: u32,
    last_used: Instant,
}

/// the request that runs: its ticket, its id and where to write a cancel
type InFlight = Option<(u64, u64, Arc<Mutex<ChildStdin>>)>;

/// one PDF's helper, started when needed (see the module's comment)
pub struct Supervisor {
    config: HelperConfig,
    source: Source,
    state: Mutex<State>,
    in_flight: Mutex<InFlight>,
}

/// how many failures it takes to give up
const MAX_FAILURES: u32 = 2;

impl Supervisor {
    pub fn new(config: HelperConfig, source: Source) -> Supervisor {
        Supervisor {
            config,
            source,
            state: Mutex::new(State {
                helper: None,
                info: None,
                bytes: None,
                failures: 0,
                last_used: Instant::now(),
            }),
            in_flight: Mutex::new(None),
        }
    }

    /// whether it gave up after the helper failed twice
    pub fn failed(&self) -> bool {
        locked(&self.state).failures >= MAX_FAILURES
    }

    /// whether a helper runs, and since when it was last asked something
    pub fn idle_since(&self) -> Option<Instant> {
        let state = locked(&self.state);
        state.helper.as_ref().map(|_| state.last_used)
    }

    /// stops the helper and drops the PDF, e.g. after a while unused; the
    /// next request starts another. Not a failure
    pub fn stop(&self) {
        let mut state = locked(&self.state);
        state.helper = None;
        state.bytes = None;
    }

    /// asks the helper to stop the request of `ticket` if it runs
    pub fn cancel(&self, ticket: u64) {
        let in_flight = locked(&self.in_flight);
        if let Some((running, id, stdin)) = in_flight.as_ref() {
            if *running == ticket {
                let cancel = serde_json::to_vec(&Request {
                    id: 0,
                    op: Op::Cancel { target: *id },
                })
                .unwrap_or_default();
                let _ = write_frame(&mut *locked(stdin), &cancel, &[]);
            }
        }
    }

    /// starts the helper and opens the PDF, if no helper runs
    pub fn open(&self) -> Result<OpenInfo, PdfError> {
        let mut state = locked(&self.state);
        if state.failures >= MAX_FAILURES {
            return Err(PdfError::Failed);
        }
        state.last_used = Instant::now();
        self.ensure_open(&mut state)
    }

    /// asks `op`, starting the helper and opening the PDF in it first if
    /// none runs; `ticket` lets `cancel` stop it
    pub fn request(&self, op: Op, ticket: Option<u64>) -> Result<(Value, Vec<u8>), PdfError> {
        let mut state = locked(&self.state);
        if state.failures >= MAX_FAILURES {
            return Err(PdfError::Failed);
        }
        state.last_used = Instant::now();
        self.ensure_open(&mut state)?;
        let timeouts = &self.config.timeouts;
        let timeout = match op {
            Op::Open { .. } => timeouts.open,
            Op::Render { .. } => timeouts.render,
            _ => timeouts.read,
        };
        let helper = state.helper.as_mut().ok_or(PdfError::Start)?;
        let result = helper.call(&op, &[], timeout, timeouts.cancel, |id, stdin| {
            if let Some(ticket) = ticket {
                *locked(&self.in_flight) = Some((ticket, id, stdin));
            }
        });
        *locked(&self.in_flight) = None;
        self.settle(&mut state, result)
    }

    /// asks `op` and reads its answer as `T`
    pub fn ask<T: DeserializeOwned>(&self, op: Op) -> Result<T, PdfError> {
        let (value, _) = self.request(op, None)?;
        serde_json::from_value(value).map_err(|_| PdfError::Engine(ErrorKind::Engine))
    }

    /// counts a crash or hang, and forgets the helper it took
    fn settle<T>(&self, state: &mut State, result: Result<T, PdfError>) -> Result<T, PdfError> {
        if let Err(PdfError::Crashed | PdfError::Hung) = result {
            state.helper = None;
            state.failures += 1;
        }
        result
    }

    fn ensure_open(&self, state: &mut State) -> Result<OpenInfo, PdfError> {
        if let (Some(_), Some(info)) = (&state.helper, &state.info) {
            return Ok(info.clone());
        }
        let bytes = match state.bytes.clone() {
            Some(bytes) => bytes,
            None => (self.source)().map_err(|error| {
                log::warn!("PDF helper: read the PDF: {}", error.kind());
                PdfError::Source
            })?,
        };
        let mut helper = Helper::start(&self.config)?;
        let opened = helper.call(
            &Op::Open { password: None },
            &bytes,
            self.config.timeouts.open,
            self.config.timeouts.cancel,
            |_, _| {},
        );
        let (value, _) = self.settle(state, opened)?;
        let info: OpenInfo =
            serde_json::from_value(value).map_err(|_| PdfError::Engine(ErrorKind::Engine))?;
        state.helper = Some(helper);
        state.bytes = Some(bytes);
        state.info = Some(info.clone());
        Ok(info)
    }
}

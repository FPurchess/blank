//! The app's side: starts a helper for a PDF, asks it one request at a time,
//! and watches it. A request that takes too long is cancelled, and the helper
//! is killed when it doesn't stop (a hang). A crash, a hang or the system's
//! memory backstop is a failure: after the first, the next request starts a
//! new helper and opens the PDF again, and the request that failed isn't
//! asked again; after the second, the supervisor gives up (`Failed`), and only
//! a new one (the tab's "Open again") tries again. A helper stopped for being
//! idle isn't a failure. The supervisor keeps the form's fills (`set_fills`),
//! so a new helper gets them again once it has opened the PDF.

use std::collections::VecDeque;
use std::io;
use std::path::PathBuf;
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::mpsc::{self, Receiver, RecvTimeoutError};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::thread;
use std::time::{Duration, Instant};

use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::frame::{read_frame_by, write_frame, MAX_BODY};
use crate::limits::Backstop;
use crate::protocol::{ErrorKind, Hello, Op, OpenInfo, Outcome, Request, Response, PROTOCOL};
use crate::protocol::{Fill, Filled, PageInfo, RenderInfo, MAX_PIXELS, PAGES_PER_REQUEST};

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
            PdfError::Engine(kind) => kind.name(),
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
    /// `setFills`
    pub fill: Duration,
    /// `save`
    pub save: Duration,
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
            fill: Duration::from_secs(10),
            save: Duration::from_secs(30),
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
    backstop: Backstop,
    /// the ops it knows, from its hello
    ops: Vec<String>,
    /// the request asked last and the most the reader takes of its answer's
    /// body: a page's pixels, or for `save` the PDF and a little more; any
    /// other answer gets `MAX_ANSWER`
    limit: Arc<Mutex<AnswerLimit>>,
    /// the field the last answer refused, if it named one (`setFills`)
    refused_field: Option<String>,
}

/// the request whose answer may be bigger than `MAX_ANSWER`, and how big
#[derive(Clone, Copy)]
struct AnswerLimit {
    id: u64,
    max: u64,
}

/// what the reader needs of an answer's header to pick its limit
#[derive(serde::Deserialize)]
struct AnswerId {
    id: u64,
}

/// how many answers the reader holds before it waits for the client: a
/// helper that writes frames unasked can't fill the app's memory
const QUEUED_ANSWERS: usize = 4;
/// the most a helper's answer may hold: a page's pixels
const MAX_ANSWER: u64 = MAX_PIXELS * 4;
/// how long a helper whose stdout closed gets to exit before it's killed
const EXITING: Duration = Duration::from_millis(500);

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
        let (send, answers) = mpsc::sync_channel(QUEUED_ANSWERS);
        let limit = Arc::new(Mutex::new(AnswerLimit {
            id: 0,
            max: MAX_ANSWER,
        }));
        let reader_limit = limit.clone();
        // the limit is the answer's own, picked once its header is read: by
        // then the request it answers was written, with its limit set
        let max_body = move |header: &[u8]| {
            let wanted = *locked(&reader_limit);
            match serde_json::from_slice::<AnswerId>(header) {
                Ok(answer) if answer.id == wanted.id && wanted.id != 0 => wanted.max,
                _ => MAX_ANSWER,
            }
        };
        thread::spawn(move || {
            while let Ok(frame) = read_frame_by(&mut stdout, &max_body) {
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
            backstop,
            ops: vec![],
            limit,
            refused_field: None,
        };
        helper.greet(config.timeouts.start)?;
        Ok(helper)
    }

    /// waits for the hello and checks its protocol
    fn greet(&mut self, timeout: Duration) -> Result<(), PdfError> {
        match self.answers.recv_timeout(timeout) {
            Ok(Incoming::Frame(header, _)) => match serde_json::from_value::<Hello>(header) {
                Ok(hello) if hello.protocol == PROTOCOL => {
                    self.ops = hello.ops;
                    Ok(())
                }
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
        self.backstop.stop();
        let _ = self.child.wait();
    }

    /// how the helper ended, for the log: its exit code or signal. Its
    /// stdout may have closed, or stopped making sense, while it still runs:
    /// it gets `EXITING` to exit, then it is killed, so this never hangs
    fn ended(&mut self) -> String {
        let until = Instant::now() + EXITING;
        let status = loop {
            match self.child.try_wait() {
                Ok(Some(status)) => break Ok(status),
                Ok(None) if Instant::now() < until => thread::sleep(Duration::from_millis(10)),
                Ok(None) => {
                    let _ = self.child.kill();
                    self.backstop.stop();
                    break self.child.wait();
                }
                Err(error) => break Err(error),
            }
        };
        // reaped (or failing to be): the watcher must not touch its PID
        self.backstop.stop();
        match status {
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

    /// asks `op` and waits for its answer at most `timeout`, an answer
    /// whose body holds at most `max_answer` bytes; `sent` learns the
    /// request's id once it's written, so another thread can cancel it
    fn call(
        &mut self,
        op: &Op,
        body: &[u8],
        max_answer: u64,
        timeouts: (Duration, Duration),
        sent: impl FnOnce(u64, Arc<Mutex<ChildStdin>>),
    ) -> Result<(Value, Vec<u8>), PdfError> {
        let (timeout, cancel_timeout) = timeouts;
        self.refused_field = None;
        // an op the helper doesn't know (one newer than it): not asked
        if !self.ops.iter().any(|known| known == op.name()) {
            return Err(PdfError::Engine(ErrorKind::UnknownOp));
        }
        let id = self.next_id;
        self.next_id += 1;
        let header =
            serde_json::to_vec(&Request { id, op: op.clone() }).map_err(|_| PdfError::Start)?;
        *locked(&self.limit) = AnswerLimit {
            id,
            max: max_answer,
        };
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
                        Outcome::Error(failure) => {
                            self.refused_field = failure.field;
                            Err(PdfError::Engine(failure.kind))
                        }
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
                    log::warn!("PDF helper: {}: hang", op.name());
                    self.kill();
                    return Err(PdfError::Hung);
                }
            }
        }
    }

    fn crashed(&mut self, op: &Op) -> PdfError {
        let ended = self.ended();
        log::warn!("PDF helper: {}: crash, {ended}", op.name());
        PdfError::Crashed
    }
}

impl Drop for Helper {
    fn drop(&mut self) {
        self.kill();
    }
}

struct State {
    helper: Option<Helper>,
    /// what opening the PDF told, once it was opened
    info: Option<OpenInfo>,
    /// the PDF while a helper has it open; dropped with the helper
    bytes: Option<Arc<[u8]>>,
    /// the form's fills the helper has, which a new helper gets again
    fills: Vec<Fill>,
    failures: u32,
    last_used: Instant,
}

/// a request that got no answer, and the field it refused, if it named one
/// (`setFills`: the fill that failed)
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Refused {
    pub error: PdfError,
    pub field: Option<String>,
}

impl From<PdfError> for Refused {
    fn from(error: PdfError) -> Self {
        Refused { error, field: None }
    }
}

/// the request that runs: its ticket, its id and where to write a cancel;
/// the tickets cancelled before their request was written (while it waited
/// for the helper to start, or for the request before it), the last
/// `CANCELLED_KEPT` of them; and the last ticket written, since a cancel of
/// one up to it comes after its request finished
#[derive(Default)]
struct InFlight {
    running: Option<(u64, u64, Arc<Mutex<ChildStdin>>)>,
    cancelled: VecDeque<u64>,
    last: u64,
}

/// how many tickets cancelled ahead of their request are remembered: more
/// than the renders a fast scroll queues up
const CANCELLED_KEPT: usize = 64;

/// writes the cancel of the request `id` to `stdin`
fn send_cancel(stdin: &Mutex<ChildStdin>, id: u64) {
    let cancel = serde_json::to_vec(&Request {
        id: 0,
        op: Op::Cancel { target: id },
    })
    .unwrap_or_default();
    let _ = write_frame(&mut *locked(stdin), &cancel, &[]);
}

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
                fills: vec![],
                failures: 0,
                last_used: Instant::now(),
            }),
            in_flight: Mutex::new(InFlight::default()),
        }
    }

    /// whether it gave up after the helper failed twice
    pub fn failed(&self) -> bool {
        locked(&self.state).failures >= MAX_FAILURES
    }

    /// whether a helper runs, and since when it was last asked something;
    /// `None` while a request runs, which it doesn't wait for: it's in use
    pub fn idle_since(&self) -> Option<Instant> {
        let state = self.state.try_lock().ok()?;
        state.helper.as_ref().map(|_| state.last_used)
    }

    /// stops the helper and drops the PDF, e.g. after a while unused; the
    /// next request starts another. Not a failure. Doesn't wait for a
    /// request that runs: a helper in use isn't stopped
    pub fn stop(&self) {
        let Ok(mut state) = self.state.try_lock() else {
            return;
        };
        state.helper = None;
        state.bytes = None;
    }

    /// asks the helper to stop the request of `ticket` if it runs; one that
    /// hasn't been written yet doesn't run once it would be
    pub fn cancel(&self, ticket: u64) {
        let mut in_flight = locked(&self.in_flight);
        match &in_flight.running {
            Some((running, id, stdin)) if *running == ticket => send_cancel(stdin, *id),
            // its request finished already: nothing to stop
            _ if ticket <= in_flight.last => {}
            _ => {
                if in_flight.cancelled.len() == CANCELLED_KEPT {
                    in_flight.cancelled.pop_front();
                }
                in_flight.cancelled.push_back(ticket);
            }
        }
    }

    /// whether `ticket` was cancelled before its request was written, which
    /// it then forgets
    fn cancelled_ahead(&self, ticket: Option<u64>) -> bool {
        let Some(ticket) = ticket else {
            return false;
        };
        let cancelled = &mut locked(&self.in_flight).cancelled;
        let found = cancelled.iter().position(|&each| each == ticket);
        found.map(|at| cancelled.remove(at)).is_some()
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
    /// none runs (and giving it the fills again); `ticket` lets `cancel`
    /// stop it. A `setFills` that succeeds replaces the fills kept
    pub fn request(&self, op: Op, ticket: Option<u64>) -> Result<(Value, Vec<u8>), PdfError> {
        self.request_naming(op, ticket)
            .map_err(|refused| refused.error)
    }

    /// `request`, with the field a refusal named
    fn request_naming(&self, op: Op, ticket: Option<u64>) -> Result<(Value, Vec<u8>), Refused> {
        let mut state = locked(&self.state);
        if state.failures >= MAX_FAILURES {
            return Err(PdfError::Failed.into());
        }
        state.last_used = Instant::now();
        self.ensure_open(&mut state)?;
        if self.cancelled_ahead(ticket) {
            return Err(PdfError::Engine(ErrorKind::Cancelled).into());
        }
        let timeouts = &self.config.timeouts;
        let timeout = match op {
            Op::Open { .. } => timeouts.open,
            Op::Render { .. } => timeouts.render,
            Op::SetFills { .. } => timeouts.fill,
            Op::Save => timeouts.save,
            _ => timeouts.read,
        };
        // a saved PDF is the one opened and the fills' update
        let max_answer = match (&op, &state.bytes) {
            (Op::Save, Some(bytes)) => (bytes.len() as u64 + MAX_ANSWER).min(MAX_BODY),
            _ => MAX_ANSWER,
        };
        let helper = state.helper.as_mut().ok_or(PdfError::Start)?;
        let result = helper.call(
            &op,
            &[],
            max_answer,
            (timeout, timeouts.cancel),
            |id, stdin| {
                if let Some(ticket) = ticket {
                    let mut in_flight = locked(&self.in_flight);
                    // cancelled between the check above and the write
                    if let Some(at) = in_flight.cancelled.iter().position(|&each| each == ticket) {
                        in_flight.cancelled.remove(at);
                        send_cancel(&stdin, id);
                    }
                    in_flight.last = in_flight.last.max(ticket);
                    in_flight.running = Some((ticket, id, stdin));
                }
            },
        );
        let field = helper.refused_field.take();
        locked(&self.in_flight).running = None;
        let result = match (&op, result) {
            (Op::Render { .. }, Ok((value, pixels))) if !drawn(&value, &pixels) => {
                log::warn!("PDF helper: render: pixels don't match their size");
                Err(PdfError::Engine(ErrorKind::Engine))
            }
            (Op::SetFills { fills }, Ok(answer)) => {
                state.fills = fills.clone();
                Ok(answer)
            }
            (_, result) => result,
        };
        self.settle(&mut state, result)
            .map_err(|error| Refused { error, field })
    }

    /// every page's size, asked `PAGES_PER_REQUEST` at a time so that no
    /// answer outgrows a frame's header
    pub fn pages(&self, count: usize) -> Result<Vec<PageInfo>, PdfError> {
        let mut pages = Vec::with_capacity(count.min(1 << 16));
        while pages.len() < count {
            let from = pages.len();
            let to = count.min(from + PAGES_PER_REQUEST);
            let batch: Vec<PageInfo> = self.ask(Op::Pages { from, to })?;
            if batch.is_empty() {
                break;
            }
            pages.extend(batch);
        }
        Ok(pages)
    }

    /// fills the form in with `fills`, the whole set (see `Op::SetFills`),
    /// and keeps them for a new helper; gives the pages to draw again. A
    /// refusal names the field whose fill it refused, when the helper says
    pub fn set_fills(&self, fills: Vec<Fill>) -> Result<Vec<usize>, Refused> {
        let (value, _) = self.request_naming(Op::SetFills { fills }, None)?;
        let filled: Filled =
            serde_json::from_value(value).map_err(|_| PdfError::Engine(ErrorKind::Engine))?;
        Ok(filled.pages)
    }

    /// the fills the helper has
    pub fn fills(&self) -> Vec<Fill> {
        locked(&self.state).fills.clone()
    }

    /// the PDF with the fills as an incremental update (see `Op::Save`)
    pub fn save(&self) -> Result<Vec<u8>, PdfError> {
        self.request(Op::Save, None).map(|(_, bytes)| bytes)
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
        // more than a frame may carry: not the helper's failure
        if bytes.len() as u64 > MAX_BODY {
            return Err(PdfError::Engine(ErrorKind::TooComplex));
        }
        let mut helper = Helper::start(&self.config)?;
        let timeouts = &self.config.timeouts;
        let opened = helper.call(
            &Op::Open { password: None },
            &bytes,
            MAX_ANSWER,
            (timeouts.open, timeouts.cancel),
            |_, _| {},
        );
        let (value, _) = self.settle(state, opened)?;
        let info: OpenInfo =
            serde_json::from_value(value).map_err(|_| PdfError::Engine(ErrorKind::Engine))?;
        if !state.fills.is_empty() {
            let refill = helper.call(
                &Op::SetFills {
                    fills: state.fills.clone(),
                },
                &[],
                MAX_ANSWER,
                (timeouts.fill, timeouts.cancel),
                |_, _| {},
            );
            self.settle(state, refill)?;
        }
        state.helper = Some(helper);
        state.bytes = Some(bytes);
        state.info = Some(info.clone());
        Ok(info)
    }
}

/// whether a render's answer holds the pixels its size says, within the
/// most a page is drawn with
fn drawn(value: &Value, pixels: &[u8]) -> bool {
    let Ok(info) = serde_json::from_value::<RenderInfo>(value.clone()) else {
        return false;
    };
    let count = info.width as u64 * info.height as u64;
    count <= MAX_PIXELS && pixels.len() as u64 == count * 4
}

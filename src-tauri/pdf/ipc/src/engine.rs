//! What a PDF engine does for the helper. Everything MuPDF-specific is behind
//! these traits (the helper's mupdf.rs); another engine, e.g. PDFium, would be
//! a second implementation, and neither the app nor the protocol would change.

use std::sync::{Arc, Mutex, PoisonError};

use crate::protocol::{ErrorKind, Field, Fill, OpenInfo, PageInfo, PageText};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct EngineError {
    pub kind: ErrorKind,
    /// `set_fills`: the index of the fill that failed, when one did
    pub fill: Option<usize>,
}

impl EngineError {
    /// the fill at `index` failed with `kind`
    pub fn of_fill(kind: ErrorKind, index: usize) -> Self {
        EngineError {
            kind,
            fill: Some(index),
        }
    }
}

impl From<ErrorKind> for EngineError {
    fn from(kind: ErrorKind) -> Self {
        EngineError { kind, fill: None }
    }
}

/// a page's pixels: RGBA, opaque, `width * 4` bytes per row
#[derive(Debug)]
pub struct Bitmap {
    pub width: u32,
    pub height: u32,
    pub rgba: Vec<u8>,
}

pub trait PdfEngine {
    type Doc: PdfDoc;
    fn name(&self) -> &'static str;
    fn version(&self) -> String;
    fn open(&self, bytes: Arc<[u8]>, password: Option<&str>) -> Result<Self::Doc, EngineError>;
}

pub trait PdfDoc {
    fn info(&self) -> OpenInfo;
    fn page(&mut self, index: usize) -> Result<PageInfo, EngineError>;
    fn render(
        &mut self,
        index: usize,
        scale: f32,
        cancel: &CancelFlag,
    ) -> Result<Bitmap, EngineError>;
    /// a page's words and thin horizontal lines, in display points
    fn text(&mut self, _index: usize) -> Result<PageText, EngineError> {
        Err(ErrorKind::UnknownOp.into())
    }
    /// every field of the form, with full names and what they inherit
    fn fields(&mut self) -> Result<Vec<Field>, EngineError>;
    /// fills the form in with `fills`, the whole set, on the PDF as it was
    /// opened; what's drawn and saved from then on is the filled PDF. Gives
    /// the pages whose fields changed since the last set. On a failure the
    /// last set stays, and the error says which fill failed when one did
    /// (`EngineError::fill`)
    fn set_fills(&mut self, _fills: &[Fill]) -> Result<Vec<usize>, EngineError> {
        Err(ErrorKind::UnknownOp.into())
    }
    /// the PDF opened, byte for byte, with the fills appended as an
    /// incremental update (none without fills)
    fn save_incremental(&mut self) -> Result<Vec<u8>, EngineError> {
        Err(ErrorKind::UnknownOp.into())
    }
}

type Hook = Box<dyn FnMut() + Send>;

#[derive(Default)]
struct CancelState {
    cancelled: bool,
    hook: Option<Hook>,
}

/// asks the request that runs to stop, from another thread: the engine gets
/// told through the hook it set for as long as it runs (MuPDF's cookie)
#[derive(Clone, Default)]
pub struct CancelFlag(Arc<Mutex<CancelState>>);

impl CancelFlag {
    fn state(&self) -> std::sync::MutexGuard<'_, CancelState> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }

    pub fn cancel(&self) {
        let mut state = self.state();
        state.cancelled = true;
        if let Some(hook) = state.hook.as_mut() {
            hook();
        }
    }

    pub fn is_cancelled(&self) -> bool {
        self.state().cancelled
    }

    /// runs `work` with `hook` called on a cancel meanwhile, or at once if
    /// it was cancelled before; the hook is gone once `work` returns, so it
    /// may point at what only lives that long
    pub fn while_running<T>(
        &self,
        hook: impl FnMut() + Send + 'static,
        work: impl FnOnce() -> T,
    ) -> T {
        {
            let mut state = self.state();
            let mut hook: Hook = Box::new(hook);
            if state.cancelled {
                hook();
            }
            state.hook = Some(hook);
        }
        let result = work();
        self.state().hook = None;
        result
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[test]
    fn tells_the_engine_while_it_runs_only() {
        let flag = CancelFlag::default();
        let calls = Arc::new(AtomicUsize::new(0));
        let counted = calls.clone();
        let other = flag.clone();
        flag.while_running(
            move || {
                counted.fetch_add(1, Ordering::SeqCst);
            },
            || other.cancel(),
        );
        assert_eq!(calls.load(Ordering::SeqCst), 1);
        flag.cancel();
        assert_eq!(calls.load(Ordering::SeqCst), 1, "the hook is gone");
        assert!(flag.is_cancelled());

        // cancelled before it ran
        let counted = calls.clone();
        flag.while_running(
            move || {
                counted.fetch_add(1, Ordering::SeqCst);
            },
            || {},
        );
        assert_eq!(calls.load(Ordering::SeqCst), 2);
    }
}

//! The PDF engine of the helper: MuPDF, through the shim (shim/blank_mupdf.c),
//! which is the only code here that calls MuPDF.

use std::ffi::{c_char, c_int, CString};
use std::rc::Rc;
use std::sync::Arc;

use blank_pdf_ipc::engine::{Bitmap, CancelFlag, EngineError, PdfDoc, PdfEngine};
use blank_pdf_ipc::protocol::{
    ErrorKind, Field, Fill, FillValue, OpenInfo, PageInfo, PageText, MAX_PIXELS,
};
use serde::de::DeserializeOwned;

// the static MuPDF libraries the shim needs are linked through mupdf-sys
use mupdf_sys as _;

#[repr(C)]
struct RawEngine {
    _private: [u8; 0],
}
#[repr(C)]
struct RawDoc {
    _private: [u8; 0],
}
#[repr(C)]
struct RawCookie {
    _private: [u8; 0],
}

/// `blank_fill` of shim/blank_mupdf.h
#[repr(C)]
struct RawFill {
    field: *const c_char,
    text: *const c_char,
    checked: c_int,
}

/// see `blank_font_finder` in shim/blank_mupdf.h
type FontFinder = unsafe extern "C" fn(
    name: *const c_char,
    bold: c_int,
    italic: c_int,
    ordering: c_int,
    path: *mut c_char,
    path_size: usize,
    index: *mut c_int,
) -> c_int;

extern "C" {
    fn blank_engine_new(
        memory_limit: usize,
        store_limit: usize,
        finder: Option<FontFinder>,
    ) -> *mut RawEngine;
    fn blank_engine_drop(engine: *mut RawEngine);
    fn blank_engine_version() -> *const c_char;
    fn blank_open(
        engine: *mut RawEngine,
        data: *const u8,
        len: usize,
        password: *const c_char,
        out: *mut *mut RawDoc,
    ) -> c_int;
    fn blank_doc_drop(doc: *mut RawDoc);
    fn blank_doc_pages(doc: *const RawDoc) -> c_int;
    fn blank_doc_repaired(doc: *const RawDoc) -> c_int;
    fn blank_doc_encrypted(doc: *const RawDoc) -> c_int;
    fn blank_page_info(
        doc: *mut RawDoc,
        page: c_int,
        width: *mut f32,
        height: *mut f32,
        rotation: *mut c_int,
        user_unit: *mut f32,
    ) -> c_int;
    fn blank_render_size(
        doc: *mut RawDoc,
        page: c_int,
        scale: f32,
        width: *mut c_int,
        height: *mut c_int,
    ) -> c_int;
    fn blank_render(
        doc: *mut RawDoc,
        page: c_int,
        scale: f32,
        cookie: *mut RawCookie,
        rgba: *mut u8,
        width: c_int,
        height: c_int,
    ) -> c_int;
    fn blank_cookie_new() -> *mut RawCookie;
    fn blank_cookie_abort(cookie: *mut RawCookie);
    fn blank_cookie_drop(cookie: *mut RawCookie);
    fn blank_form_json(doc: *mut RawDoc, json: *mut *mut c_char, len: *mut usize) -> c_int;
    fn blank_free(json: *mut c_char);
    fn blank_page_text_json(
        doc: *mut RawDoc,
        page: c_int,
        json: *mut *mut c_char,
        len: *mut usize,
    ) -> c_int;
    fn blank_set_fills(
        doc: *mut RawDoc,
        fills: *const RawFill,
        count: c_int,
        out: *mut *mut RawDoc,
        failed: *mut c_int,
    ) -> c_int;
    fn blank_save(doc: *mut RawDoc, data: *mut *mut u8, len: *mut usize) -> c_int;
}

/// a shim status as a result
fn checked(status: c_int) -> Result<(), EngineError> {
    let kind = match status {
        0 => return Ok(()),
        2 => ErrorKind::TooComplex,
        3 => ErrorKind::Cancelled,
        4 => ErrorKind::NeedsPassword,
        5 => ErrorKind::Damaged,
        6 => ErrorKind::BadRequest,
        7 => ErrorKind::MissingGlyphs,
        8 => ErrorKind::Repaired,
        9 => ErrorKind::Encrypted,
        _ => ErrorKind::Engine,
    };
    Err(kind.into())
}

/// the version of MuPDF, e.g. "1.28.5"
pub fn version() -> String {
    let version = unsafe { std::ffi::CStr::from_ptr(blank_engine_version()) };
    version.to_string_lossy().into_owned()
}

struct EngineHandle(*mut RawEngine);

impl Drop for EngineHandle {
    fn drop(&mut self) {
        unsafe { blank_engine_drop(self.0) }
    }
}

/// MuPDF with its allocations capped at `memory_limit` bytes
pub struct Mupdf {
    engine: Rc<EngineHandle>,
}

impl Mupdf {
    pub fn new(memory_limit: usize, store_limit: usize) -> Option<Mupdf> {
        let raw =
            unsafe { blank_engine_new(memory_limit, store_limit, Some(crate::fonts::find_font)) };
        (!raw.is_null()).then(|| Mupdf {
            engine: Rc::new(EngineHandle(raw)),
        })
    }
}

impl PdfEngine for Mupdf {
    type Doc = MupdfDoc;

    fn name(&self) -> &'static str {
        "mupdf"
    }

    fn version(&self) -> String {
        version()
    }

    fn open(&self, bytes: Arc<[u8]>, password: Option<&str>) -> Result<MupdfDoc, EngineError> {
        let password = password
            .map(|password| {
                CString::new(password).map_err(|_| EngineError::from(ErrorKind::BadRequest))
            })
            .transpose()?;
        let mut raw = std::ptr::null_mut();
        checked(unsafe {
            blank_open(
                self.engine.0,
                bytes.as_ptr(),
                bytes.len(),
                password
                    .as_ref()
                    .map_or(std::ptr::null(), |password| password.as_ptr()),
                &mut raw,
            )
        })?;
        let info = unsafe {
            OpenInfo {
                pages: blank_doc_pages(raw).max(0) as usize,
                repaired: blank_doc_repaired(raw) != 0,
                encrypted: blank_doc_encrypted(raw) != 0,
            }
        };
        Ok(MupdfDoc {
            raw,
            info,
            fills: vec![],
            _bytes: bytes,
            _engine: self.engine.clone(),
        })
    }
}

/// an open PDF; MuPDF reads from `_bytes` and allocates in `_engine`, so it
/// is dropped before both
pub struct MupdfDoc {
    raw: *mut RawDoc,
    info: OpenInfo,
    /// the fills `raw` has: it is the PDF opened afresh with them
    fills: Vec<Fill>,
    _bytes: Arc<[u8]>,
    _engine: Rc<EngineHandle>,
}

impl Drop for MupdfDoc {
    fn drop(&mut self) {
        unsafe { blank_doc_drop(self.raw) }
    }
}

/// a cookie for the cancel hook, which another thread calls
struct CookiePtr(*mut RawCookie);
unsafe impl Send for CookiePtr {}

impl CookiePtr {
    fn abort(&self) {
        unsafe { blank_cookie_abort(self.0) }
    }
}

impl MupdfDoc {
    fn index(&self, index: usize) -> Result<c_int, EngineError> {
        if index < self.info.pages {
            Ok(index as c_int)
        } else {
            Err(ErrorKind::BadRequest.into())
        }
    }

    /// the PDF opened afresh with `fills`, their appearances drawn again;
    /// a tab in a value is a space, which the fonts MuPDF draws fields in
    /// have, where a tab has no glyph. A refusal says which fill failed
    fn filled(&self, fills: &[Fill]) -> Result<*mut RawDoc, EngineError> {
        let text = |text: &str| CString::new(text);
        let mut strings = Vec::with_capacity(fills.len());
        for (index, fill) in fills.iter().enumerate() {
            let refused = |_| EngineError::of_fill(ErrorKind::BadRequest, index);
            let value = match &fill.value {
                FillValue::Text(value) => Some(text(&value.replace('\t', " ")).map_err(refused)?),
                FillValue::Checked(_) => None,
            };
            strings.push((text(&fill.field).map_err(refused)?, value));
        }
        let raw: Vec<RawFill> = fills
            .iter()
            .zip(&strings)
            .map(|(fill, (field, value))| RawFill {
                field: field.as_ptr(),
                text: value
                    .as_ref()
                    .map_or(std::ptr::null(), |value| value.as_ptr()),
                checked: matches!(fill.value, FillValue::Checked(true)) as c_int,
            })
            .collect();
        let count = c_int::try_from(raw.len()).map_err(|_| ErrorKind::BadRequest)?;
        let (mut out, mut failed) = (std::ptr::null_mut(), -1);
        let status =
            unsafe { blank_set_fills(self.raw, raw.as_ptr(), count, &mut out, &mut failed) };
        checked(status).map_err(|error| match usize::try_from(failed) {
            Ok(index) if index < fills.len() => EngineError::of_fill(error.kind, index),
            _ => error,
        })?;
        Ok(out)
    }
}

/// reads the JSON a shim function writes, which it allocated
fn read_json<T: DeserializeOwned>(
    write: impl FnOnce(*mut *mut c_char, *mut usize) -> c_int,
) -> Result<T, EngineError> {
    let mut json = std::ptr::null_mut();
    let mut len = 0;
    checked(write(&mut json, &mut len))?;
    let bytes = unsafe { std::slice::from_raw_parts(json as *const u8, len) };
    let parsed = serde_json::from_str(&String::from_utf8_lossy(bytes));
    unsafe { blank_free(json) };
    parsed.map_err(|_| ErrorKind::Engine.into())
}

/// the pages of the fields whose value differs between `before` and `after`
fn changed_pages(before: &[Field], after: &[Field]) -> Vec<usize> {
    let mut pages: Vec<usize> = after
        .iter()
        .filter(|field| {
            before
                .iter()
                .find(|old| old.name == field.name)
                .is_none_or(|old| old.value != field.value)
        })
        .flat_map(|field| field.widgets.iter().map(|widget| widget.page))
        .collect();
    pages.sort_unstable();
    pages.dedup();
    pages
}

impl PdfDoc for MupdfDoc {
    fn info(&self) -> OpenInfo {
        self.info.clone()
    }

    fn page(&mut self, index: usize) -> Result<PageInfo, EngineError> {
        let page = self.index(index)?;
        let (mut width, mut height, mut rotation, mut user_unit) = (0.0, 0.0, 0, 1.0);
        checked(unsafe {
            blank_page_info(
                self.raw,
                page,
                &mut width,
                &mut height,
                &mut rotation,
                &mut user_unit,
            )
        })?;
        Ok(PageInfo {
            width,
            height,
            rotation: rotation as u32,
            user_unit,
        })
    }

    fn render(
        &mut self,
        index: usize,
        scale: f32,
        cancel: &CancelFlag,
    ) -> Result<Bitmap, EngineError> {
        let page = self.index(index)?;
        let (mut width, mut height) = (0, 0);
        checked(unsafe { blank_render_size(self.raw, page, scale, &mut width, &mut height) })?;
        if width <= 0 || height <= 0 {
            return Err(ErrorKind::Engine.into());
        }
        let pixels = width as u64 * height as u64;
        if pixels > MAX_PIXELS {
            return Err(ErrorKind::TooComplex.into());
        }
        let mut rgba = Vec::new();
        rgba.try_reserve_exact(pixels as usize * 4)
            .map_err(|_| EngineError::from(ErrorKind::TooComplex))?;
        rgba.resize(pixels as usize * 4, 0);
        let cookie = unsafe { blank_cookie_new() };
        if cookie.is_null() {
            return Err(ErrorKind::TooComplex.into());
        }
        let abort = CookiePtr(cookie);
        let status = cancel.while_running(
            move || abort.abort(),
            || unsafe {
                blank_render(
                    self.raw,
                    page,
                    scale,
                    cookie,
                    rgba.as_mut_ptr(),
                    width,
                    height,
                )
            },
        );
        unsafe { blank_cookie_drop(cookie) };
        checked(status)?;
        Ok(Bitmap {
            width: width as u32,
            height: height as u32,
            rgba,
        })
    }

    fn text(&mut self, index: usize) -> Result<PageText, EngineError> {
        let (raw, page) = (self.raw, self.index(index)?);
        read_json(|json, len| unsafe { blank_page_text_json(raw, page, json, len) })
    }

    fn fields(&mut self) -> Result<Vec<Field>, EngineError> {
        let raw = self.raw;
        read_json(|json, len| unsafe { blank_form_json(raw, json, len) })
    }

    fn set_fills(&mut self, fills: &[Fill]) -> Result<Vec<usize>, EngineError> {
        let before = self.fields()?;
        let filled = self.filled(fills)?;
        unsafe { blank_doc_drop(self.raw) };
        self.raw = filled;
        self.fills = fills.to_vec();
        Ok(changed_pages(&before, &self.fields()?))
    }

    fn save_incremental(&mut self) -> Result<Vec<u8>, EngineError> {
        // from a document of its own: MuPDF takes what it saved as saved
        let fresh = MupdfDoc {
            raw: self.filled(&self.fills)?,
            info: self.info.clone(),
            fills: self.fills.clone(),
            _bytes: self._bytes.clone(),
            _engine: self._engine.clone(),
        };
        let (mut data, mut len) = (std::ptr::null_mut(), 0);
        checked(unsafe { blank_save(fresh.raw, &mut data, &mut len) })?;
        let saved = unsafe { std::slice::from_raw_parts(data, len) }.to_vec();
        unsafe { blank_free(data as *mut c_char) };
        Ok(saved)
    }
}

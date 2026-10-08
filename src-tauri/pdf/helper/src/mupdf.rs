//! The PDF engine of the helper: MuPDF, through the shim (shim/blank_mupdf.c),
//! which is the only code here that calls MuPDF.

use std::ffi::{c_char, c_int, CString};
use std::rc::Rc;
use std::sync::Arc;

use blank_pdf_ipc::engine::{Bitmap, CancelFlag, EngineError, PdfDoc, PdfEngine};
use blank_pdf_ipc::protocol::{ErrorKind, Field, OpenInfo, PageInfo, SigInfo, MAX_PIXELS};
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
    fn blank_form_json(
        doc: *mut RawDoc,
        signatures: c_int,
        json: *mut *mut c_char,
        len: *mut usize,
    ) -> c_int;
    fn blank_free(json: *mut c_char);
}

/// a shim status as a result
fn checked(status: c_int) -> Result<(), EngineError> {
    let kind = match status {
        0 => return Ok(()),
        2 => ErrorKind::TooComplex,
        3 => ErrorKind::Cancelled,
        4 => ErrorKind::NeedsPassword,
        5 => ErrorKind::Damaged,
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

    fn form<T: DeserializeOwned>(&mut self, signatures: bool) -> Result<T, EngineError> {
        let mut json = std::ptr::null_mut();
        let mut len = 0;
        checked(unsafe { blank_form_json(self.raw, signatures as c_int, &mut json, &mut len) })?;
        let bytes = unsafe { std::slice::from_raw_parts(json as *const u8, len) };
        let parsed = serde_json::from_str(&String::from_utf8_lossy(bytes));
        unsafe { blank_free(json) };
        parsed.map_err(|_| ErrorKind::Engine.into())
    }
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

    fn fields(&mut self) -> Result<Vec<Field>, EngineError> {
        self.form(false)
    }

    fn signatures(&mut self) -> Result<Vec<SigInfo>, EngineError> {
        self.form(true)
    }
}

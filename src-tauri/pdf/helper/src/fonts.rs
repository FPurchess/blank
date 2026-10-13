//! The fonts MuPDF asks for when a PDF names a font it doesn't embed: the
//! system's, found by blank-system-fonts as the app finds them, and only
//! those a PDF may embed. Without one, MuPDF uses its own (the URW base 14
//! fonts), and CJK text would show nothing.

use std::ffi::{c_char, c_int, CStr};
use std::panic::catch_unwind;
use std::sync::LazyLock;

use blank_system_fonts::{family_face, script_face, Face, Fonts};

/// the system's fonts, found when MuPDF first asks: most PDFs embed theirs
static FONTS: LazyLock<Fonts> = LazyLock::new(Fonts::default);

/// the script, language and a character of each of MuPDF's CJK orderings
/// (FZ_ADOBE_CNS, _GB, _JAPAN, _KOREA)
const ORDERINGS: [(&str, &str, char); 4] = [
    ("Hani", "zh-Hant", '中'),
    ("Hani", "zh-Hans", '中'),
    ("Hani", "ja", '中'),
    ("Hang", "ko", '한'),
];

/// the face for a family's `name`, or with none for a CJK `ordering`
pub fn find(name: Option<&str>, bold: bool, italic: bool, ordering: i32) -> Option<Face> {
    match name {
        Some(name) => family_face(&FONTS, name, bold, italic),
        None => {
            let (script, language, sample) = *ORDERINGS.get(usize::try_from(ordering).ok()?)?;
            script_face(&FONTS, script, language, &[sample])
        }
    }
}

/// `blank_font_finder` of shim/blank_mupdf.h
pub unsafe extern "C" fn find_font(
    name: *const c_char,
    bold: c_int,
    italic: c_int,
    ordering: c_int,
    path: *mut c_char,
    path_size: usize,
    index: *mut c_int,
) -> c_int {
    let name = (!name.is_null()).then(|| {
        unsafe { CStr::from_ptr(name) }
            .to_string_lossy()
            .into_owned()
    });
    // a panic mustn't unwind into C
    let Ok(Some(face)) = catch_unwind(|| find(name.as_deref(), bold != 0, italic != 0, ordering))
    else {
        return 0;
    };
    let bytes = face.path.as_bytes();
    if bytes.len() >= path_size || bytes.contains(&0) {
        return 0;
    }
    unsafe {
        std::ptr::copy_nonoverlapping(bytes.as_ptr(), path as *mut u8, bytes.len());
        *path.add(bytes.len()) = 0;
        *index = face.index as c_int;
    }
    1
}

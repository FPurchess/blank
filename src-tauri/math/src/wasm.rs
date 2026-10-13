//! The module's interface to the webview.

use wasm_bindgen::prelude::*;

/// a formula as a drawing's JSON, or what is wrong with it, see `crate::draw`
#[wasm_bindgen]
pub fn draw(latex: &str, display: bool) -> String {
    crate::draw(latex, display)
}

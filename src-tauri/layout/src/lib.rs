//! Blank's layout engine: lays out a document once, and that one layout is
//! both what the page view paints and what the PDF holds.

pub mod bands;
pub mod engine;
pub mod fonts;
pub mod items;
pub mod model;
pub mod pdf;
pub mod style;
pub mod text;

#[cfg(target_arch = "wasm32")]
pub mod wasm;

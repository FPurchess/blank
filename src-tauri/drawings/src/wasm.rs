//! The module's wasm API: the font files the layout engine has, in its
//! order, and diagrams drawn with them.

use wasm_bindgen::prelude::*;

use crate::Drawings;

#[wasm_bindgen]
pub struct DiagramModule {
    drawings: Drawings,
    /// the characters of the last drawing's labels no font has
    missing: String,
}

#[wasm_bindgen]
impl DiagramModule {
    #[wasm_bindgen(constructor)]
    pub fn new() -> DiagramModule {
        DiagramModule {
            drawings: Drawings::default(),
            missing: String::new(),
        }
    }

    /// adds a font file, in the order the layout engine has them: its own,
    /// then its fallbacks
    #[wasm_bindgen(js_name = addFont)]
    pub fn add_font(&mut self, bytes: Vec<u8>) {
        self.drawings.add_font(bytes);
    }

    /// a diagram's SVG as a drawing's JSON; undefined for one it can't read
    pub fn draw(&mut self, svg: &str) -> Option<String> {
        let drawn = self.drawings.draw(svg);
        self.missing = drawn
            .as_ref()
            .map(|drawn| drawn.missing.clone())
            .unwrap_or_default();
        drawn.map(|drawn| drawn.json)
    }

    /// the characters of the last drawing's labels no font has, for the
    /// webview to look up in the system's fonts
    pub fn missing(&self) -> String {
        self.missing.clone()
    }
}

impl Default for DiagramModule {
    fn default() -> Self {
        Self::new()
    }
}

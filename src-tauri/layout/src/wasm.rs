//! The engine for the webview, see src/engine/engine.ts. Everything crosses
//! as JSON strings and plain number arrays.

use std::collections::HashMap;
use std::fmt::Write;

use wasm_bindgen::prelude::*;

use crate::engine::{Changes, Engine, Hit, Op};
use crate::fonts::{split_files, Fonts};
use crate::model::{Item, Settings};
use crate::pdf::{self, ImageData, Info};

#[wasm_bindgen]
pub struct LayoutEngine {
    engine: Engine,
    images: HashMap<String, ImageData>,
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    fn console_error(message: &str);
}

/// writes a panic to the console before the instance traps: with `panic =
/// "abort"` it would trap without a word, and every later call would throw
fn report_panics() {
    static HOOK: std::sync::Once = std::sync::Once::new();
    HOOK.call_once(|| {
        std::panic::set_hook(Box::new(|info| {
            console_error(&format!("the layout engine panicked: {info}"));
        }));
    });
}

fn error(message: impl std::fmt::Display) -> JsError {
    JsError::new(&message.to_string())
}

fn hit(hit: Option<Hit>) -> Vec<f64> {
    match hit {
        Some(Hit::Text(pos)) => vec![0.0, pos as f64],
        Some(Hit::Node(pos)) => vec![1.0, pos as f64],
        None => vec![],
    }
}

/// the pages a change touched: the body's from and to, then the bands'
fn changes(changes: Changes) -> Vec<u32> {
    [
        changes.body.start,
        changes.body.end,
        changes.bands.start,
        changes.bands.end,
    ]
    .into_iter()
    .map(|index| index as u32)
    .collect()
}

/// a page's display list as JSON: rectangles, images, links and glyph runs
fn display(ops: Vec<Op>) -> String {
    let mut rects = String::new();
    let mut images = String::new();
    let mut links = String::new();
    let mut glyphs = String::new();
    let separate = |out: &mut String| {
        if !out.is_empty() {
            out.push(',');
        }
    };
    for op in ops {
        match op {
            Op::Rect { x, y, w, h, role } => {
                separate(&mut rects);
                rects.push('[');
                for value in [x, y, w, h] {
                    number(&mut rects, value);
                    rects.push(',');
                }
                let _ = write!(rects, "{}]", role as u8);
            }
            Op::Image { src, x, y, w, h } => {
                separate(&mut images);
                images.push('[');
                string(&mut images, &src);
                for value in [x, y, w, h] {
                    images.push(',');
                    number(&mut images, value);
                }
                images.push(']');
            }
            Op::Link { href, x, y, w, h } => {
                separate(&mut links);
                links.push('[');
                string(&mut links, &href);
                for value in [x, y, w, h] {
                    links.push(',');
                    number(&mut links, value);
                }
                links.push(']');
            }
            Op::Glyphs { run, role, .. } => {
                separate(&mut glyphs);
                let _ = write!(glyphs, "[{},", run.font);
                number(&mut glyphs, run.size);
                let _ = write!(glyphs, ",{}", role as u8);
                for glyph in &run.glyphs {
                    let _ = write!(glyphs, ",{},", glyph.id);
                    number(&mut glyphs, glyph.x);
                    glyphs.push(',');
                    number(&mut glyphs, glyph.y);
                }
                glyphs.push(']');
            }
        }
    }
    format!("{{\"r\":[{rects}],\"i\":[{images}],\"l\":[{links}],\"g\":[{glyphs}]}}")
}

/// a number with at most three decimals, which is finer than any screen
fn number(out: &mut String, value: f32) {
    let rounded = (value * 1000.0).round() / 1000.0;
    let _ = write!(out, "{rounded}");
}

fn string(out: &mut String, value: &str) {
    out.push_str(&serde_json::to_string(value).unwrap_or_else(|_| "\"\"".into()));
}

#[wasm_bindgen]
impl LayoutEngine {
    /// the fonts' files one after the other, with their lengths; throws if
    /// the lengths reach past the bytes
    #[wasm_bindgen(constructor)]
    pub fn new(bytes: &[u8], lengths: &[u32]) -> Result<LayoutEngine, JsError> {
        report_panics();
        let files = split_files(bytes, lengths).map_err(error)?;
        Ok(LayoutEngine {
            engine: Engine::new(Fonts::new(files)),
            images: HashMap::new(),
        })
    }

    /// sets the page; the pages that changed, as `update` gives them
    #[wasm_bindgen(js_name = setSettings)]
    pub fn set_settings(&mut self, json: &str) -> Result<Vec<u32>, JsError> {
        let settings: Settings = serde_json::from_str(json).map_err(error)?;
        Ok(changes(self.engine.set_settings(settings)))
    }

    /// replaces all items; the pages that changed, as `update` gives them
    #[wasm_bindgen(js_name = setItems)]
    pub fn set_items(&mut self, json: &str) -> Result<Vec<u32>, JsError> {
        let items: Vec<Item> = serde_json::from_str(json).map_err(error)?;
        Ok(changes(self.engine.set_items(items)))
    }

    /// replaces `delete` items from `start` with the items in `json`, and
    /// moves the ones after them by `shift`; the pages that changed: the
    /// body's from and to (exclusive), then the bands', from == to for none
    pub fn update(
        &mut self,
        start: u32,
        delete: u32,
        json: &str,
        shift: i32,
    ) -> Result<Vec<u32>, JsError> {
        let items: Vec<Item> = serde_json::from_str(json).map_err(error)?;
        Ok(changes(self.engine.update(
            start as usize,
            delete as usize,
            items,
            shift as i64,
        )))
    }

    /// several updates at once, `[[start, delete, items, shift], …]` in
    /// document order, each counting the items as the ones before it left
    /// them; the pages that changed, as `update` gives them
    #[wasm_bindgen(js_name = updateMany)]
    pub fn update_many(&mut self, json: &str) -> Result<Vec<u32>, JsError> {
        let entries: Vec<(usize, usize, Vec<Item>, i64)> =
            serde_json::from_str(json).map_err(error)?;
        Ok(changes(self.engine.update_many(entries)))
    }

    #[wasm_bindgen(js_name = pageCount)]
    pub fn page_count(&self) -> u32 {
        self.engine.pages.len() as u32
    }

    /// what each page shows changes with its version
    pub fn versions(&self) -> Vec<u32> {
        self.engine.pages.iter().map(|page| page.version).collect()
    }

    /// each page's body, without its header and footer, changes with its
    /// body version
    #[wasm_bindgen(js_name = bodyVersions)]
    pub fn body_versions(&self) -> Vec<u32> {
        self.engine
            .pages
            .iter()
            .map(|page| page.body_version)
            .collect()
    }

    /// each page's header and footer change with its band version
    #[wasm_bindgen(js_name = bandVersions)]
    pub fn band_versions(&self) -> Vec<u32> {
        self.engine
            .pages
            .iter()
            .map(|page| page.band_version)
            .collect()
    }

    /// where the text of each page ends, from its top edge
    pub fn bottoms(&self) -> Vec<f32> {
        self.engine.pages.iter().map(|page| page.bottom).collect()
    }

    /// the text of a page's header and footer slots: left, center and right
    /// of the header, then of the footer
    pub fn bands(&self, page: u32) -> String {
        self.engine
            .pages
            .get(page as usize)
            .map(|page| serde_json::to_string(&page.bands).unwrap_or_default())
            .unwrap_or_else(|| "[]".into())
    }

    /// what a page shows: rectangles, images, links and glyph runs, of its
    /// body and its header and footer
    pub fn page(&mut self, page: u32) -> String {
        display(self.engine.page_ops(page as usize, true))
    }

    /// what a page shows besides its header and footer, as `page` gives it
    #[wasm_bindgen(js_name = pageBody)]
    pub fn page_body(&self, page: u32) -> String {
        display(self.engine.body_ops(page as usize))
    }

    /// only a page's header and footer, as `page` gives them
    #[wasm_bindgen(js_name = pageBands)]
    pub fn page_bands(&mut self, page: u32) -> String {
        display(self.engine.band_ops(page as usize))
    }

    /// a glyph's outline as an SVG path, in font units with y up
    #[wasm_bindgen(js_name = glyphPath)]
    pub fn glyph_path(&self, font: u32, glyph: u32) -> String {
        self.engine.fonts.glyph_path(font as usize, glyph)
    }

    #[wasm_bindgen(js_name = unitsPerEm)]
    pub fn units_per_em(&self, font: u32) -> f32 {
        self.engine
            .fonts
            .files
            .get(font as usize)
            .map(|file| file.upem)
            .unwrap_or(1000.0)
    }

    /// page, x, y and height of the caret at a position, or nothing
    pub fn caret(&self, pos: u32, after: bool) -> Vec<f32> {
        match self.engine.caret(pos, after) {
            Some((page, x, y, height)) => vec![page as f32, x, y, height],
            None => vec![],
        }
    }

    /// what a point of a page hits: [0, pos] for text, [1, pos] for a node
    pub fn hit(&self, page: u32, x: f32, y: f32) -> Vec<f64> {
        hit(self.engine.hit(page as usize, x, y))
    }

    pub fn word(&self, page: u32, x: f32, y: f32) -> Vec<u32> {
        match self.engine.word(page as usize, x, y) {
            Some((from, to)) => vec![from, to],
            None => vec![],
        }
    }

    pub fn vertical(&self, pos: u32, down: bool, goal: f32) -> Vec<f64> {
        hit(self.engine.vertical(pos, down, goal))
    }

    /// the start or end of the line a position is on, -1 for none
    #[wasm_bindgen(js_name = lineEdge)]
    pub fn line_edge(&self, pos: u32, end: bool) -> f64 {
        self.engine
            .line_edge(pos, end)
            .map(|pos| pos as f64)
            .unwrap_or(-1.0)
    }

    /// the selection's rectangles: page, x, y, width and height each
    pub fn selection(&self, from: u32, to: u32) -> Vec<f32> {
        self.engine
            .selection(from, to)
            .into_iter()
            .flat_map(|(page, x, y, w, h)| [page as f32, x, y, w, h])
            .collect()
    }

    /// the boxes of the blocks from `from` to `to`, one per page: page, x,
    /// y, width and height each
    pub fn boxes(&self, from: u32, to: u32) -> Vec<f32> {
        self.engine
            .boxes(from, to)
            .into_iter()
            .flat_map(|(page, x, y, w, h)| [page as f32, x, y, w, h])
            .collect()
    }

    /// adds a font for what the others lack, e.g. a system font for Chinese,
    /// as the last fallback of `family`, and lays out again
    #[wasm_bindgen(js_name = addFont)]
    pub fn add_font(&mut self, bytes: Vec<u8>, family: &str) {
        self.engine.add_font(bytes, family);
    }

    /// the characters of the document no font has a glyph for
    pub fn missing(&self) -> String {
        self.engine.missing().into_iter().collect()
    }

    /// the positions the blocks on a page start and end at, or nothing
    #[wasm_bindgen(js_name = pageSpan)]
    pub fn page_span(&self, page: u32) -> Vec<u32> {
        match self.engine.page_span(page as usize) {
            Some((from, to)) => vec![from, to],
            None => vec![],
        }
    }

    /// the table at `pos` as laid out: the number of columns' edges, the
    /// edges, then page, row, y, height and repeat (0 or 1) for each row
    /// placed on a page; nothing for no table
    #[wasm_bindgen(js_name = tableGrid)]
    pub fn table_grid(&self, pos: u32) -> Vec<f32> {
        let Some(grid) = self.engine.table_grid(pos) else {
            return vec![];
        };
        let mut out = vec![grid.columns.len() as f32];
        out.extend(&grid.columns);
        for row in grid.rows {
            out.extend([
                row.page as f32,
                row.row as f32,
                row.y,
                row.height,
                if row.repeat { 1.0 } else { 0.0 },
            ]);
        }
        out
    }

    /// how much the last change laid out: items, the page it paginated
    /// from, and the page it settled at (-1 for none)
    pub fn stats(&self) -> Vec<i32> {
        let stats = self.engine.stats;
        vec![
            stats.laid_out as i32,
            stats.paginated_from as i32,
            stats.settled_at.map(|page| page as i32).unwrap_or(-1),
        ]
    }

    /// the words as laid out, for checking the PDF against the layout
    pub fn words(&mut self) -> String {
        let words: Vec<_> = self
            .engine
            .words()
            .into_iter()
            .map(|word| {
                serde_json::json!({
                    "page": word.page,
                    "left": word.left,
                    "right": word.right,
                    "baseline": word.baseline,
                    "size": word.size,
                    "font": word.font,
                    "text": word.text,
                })
            })
            .collect();
        serde_json::to_string(&words).unwrap_or_default()
    }

    #[wasm_bindgen(js_name = addImage)]
    pub fn add_image(&mut self, src: &str, bytes: Vec<u8>, jpeg: bool) {
        self.images
            .insert(src.to_string(), ImageData { bytes, jpeg });
    }

    #[wasm_bindgen(js_name = clearImages)]
    pub fn clear_images(&mut self) {
        self.images.clear();
    }

    /// the document as a PDF
    pub fn pdf(&mut self, title: &str, author: &str) -> Result<Vec<u8>, JsError> {
        let info = Info {
            title: title.to_string(),
            author: author.to_string(),
        };
        pdf::write(&mut self.engine, &self.images, &info).map_err(error)
    }
}

//! The engine for the webview, see src/engine/engine.ts. Everything crosses
//! as JSON strings and plain number arrays.

use std::collections::HashMap;
use std::fmt::Write;

use wasm_bindgen::prelude::*;

use crate::drawing::{Cap, Join};
use crate::engine::{Changes, Engine, Hit, Op};
use crate::fonts::{split_files, Fonts};
use crate::model::{Content, Item, Settings};
use crate::pdf::{self, ImageData, ImageKind, Info, PrintSheet, Warning};

#[wasm_bindgen]
pub struct LayoutEngine {
    engine: Engine,
    images: HashMap<String, ImageData>,
    /// what went wrong in the last PDF, see `pdfWarnings`
    warnings: Vec<Warning>,
}

#[wasm_bindgen]
extern "C" {
    #[wasm_bindgen(js_namespace = console, js_name = error)]
    fn console_error(message: &str);
    #[wasm_bindgen(js_namespace = console, js_name = debug)]
    fn console_debug(message: &str);
}

/// writes a panic to the console before the instance traps: with `panic =
/// "abort"` it would trap without a word, and every later call would throw.
/// console.error goes to Blank's log (src/log.ts), so it gets where the
/// panic happened and only a fixed message: a formatted one, like Rust's
/// own of slicing a string, may quote the document. The whole of it goes to
/// console.debug, which stays in the webview's console.
fn report_panics() {
    static HOOK: std::sync::Once = std::sync::Once::new();
    HOOK.call_once(|| {
        std::panic::set_hook(Box::new(|info| {
            let at = info
                .location()
                .map(|location| format!(" at {}:{}", location.file(), location.line()))
                .unwrap_or_default();
            let message = info
                .payload()
                .downcast_ref::<&str>()
                .map_or("its message is withheld", |message| message);
            console_error(&format!("the layout engine panicked{at}: {message}"));
            console_debug(&format!("the layout engine panicked: {info}"));
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

/// a page's display list as JSON: rectangles, images, links, glyph runs,
/// the paints of drawings' glyph runs, and drawings' paths
fn display(ops: Vec<Op>) -> String {
    let mut rects = String::new();
    let mut images = String::new();
    let mut links = String::new();
    let mut glyphs = String::new();
    let mut paths = String::new();
    let mut glyph_paints = String::new();
    // the glyph runs written so far
    let mut runs = 0;
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
            Op::Image {
                src, x, y, w, h, ..
            } => {
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
            Op::Path {
                x,
                y,
                scale,
                d,
                stroke,
                role,
                paint,
                style,
            } => {
                // [role, stroke width or 0, path data in page points,
                // strength, the author's colour or "" for the ink, and, if
                // it isn't a plain line, its style in page points]
                separate(&mut paths);
                let _ = write!(paths, "[{},", role as u8);
                number(&mut paths, stroke.unwrap_or(0.0));
                paths.push_str(",\"");
                crate::drawing::path_data(&mut paths, &d, x, y, scale);
                paths.push_str("\",");
                number(&mut paths, paint.alpha);
                match paint.color {
                    Some([red, green, blue]) => {
                        let _ = write!(paths, ",\"#{red:02x}{green:02x}{blue:02x}\"");
                    }
                    None => paths.push_str(",\"\""),
                }
                if !style.is_plain() {
                    paths.push_str(",{");
                    if let Some(dash) = &style.dash {
                        paths.push_str("\"dash\":[");
                        for (at, length) in dash.iter().enumerate() {
                            if at > 0 {
                                paths.push(',');
                            }
                            number(&mut paths, length * scale);
                        }
                        paths.push_str("],\"offset\":");
                        number(&mut paths, style.offset * scale);
                        paths.push(',');
                    }
                    let _ = write!(
                        paths,
                        "\"cap\":\"{}\",\"join\":\"{}\",\"evenodd\":{}}}",
                        match style.cap {
                            Cap::Butt => "butt",
                            Cap::Round => "round",
                            Cap::Square => "square",
                        },
                        match style.join {
                            Join::Miter => "miter",
                            Join::Round => "round",
                            Join::Bevel => "bevel",
                        },
                        style.evenodd
                    );
                }
                paths.push(']');
            }
            Op::Glyphs {
                run, role, paint, ..
            } => {
                // a drawing's run: [its index in "g", strength, the author's
                // colour if any]
                if let Some(paint) = paint {
                    separate(&mut glyph_paints);
                    let _ = write!(glyph_paints, "[{runs},");
                    number(&mut glyph_paints, paint.alpha);
                    if let Some([red, green, blue]) = paint.color {
                        let _ = write!(glyph_paints, ",\"#{red:02x}{green:02x}{blue:02x}\"");
                    }
                    glyph_paints.push(']');
                }
                runs += 1;
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
    format!(
        "{{\"r\":[{rects}],\"i\":[{images}],\"l\":[{links}],\"g\":[{glyphs}],\"gp\":[{glyph_paints}],\"p\":[{paths}]}}"
    )
}

/// a number with at most three decimals, which is finer than any screen
fn number(out: &mut String, value: f32) {
    out.push_str(&crate::model::json_number(value));
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
            warnings: vec![],
        })
    }

    /// an engine with the fonts of `other`, fallbacks added with `addFont`
    /// included, without copying their files, e.g. for an export; it has
    /// its own page, items and images
    #[wasm_bindgen(js_name = withFontsOf)]
    pub fn with_fonts_of(other: &LayoutEngine) -> LayoutEngine {
        report_panics();
        LayoutEngine {
            engine: Engine::new(other.engine.fonts.share()),
            images: HashMap::new(),
            warnings: vec![],
        }
    }

    /// how many font files the engine has, each once, in the order they
    /// came: the ones it was made with, then the ones `addFont` added
    #[wasm_bindgen(js_name = fontFileCount)]
    pub fn font_file_count(&self) -> u32 {
        self.engine.fonts.sources().len() as u32
    }

    /// a font file's bytes, e.g. to make the same engine in a worker; empty
    /// for none
    #[wasm_bindgen(js_name = fontFile)]
    pub fn font_file(&self, index: u32) -> Vec<u8> {
        self.engine
            .fonts
            .sources()
            .get(index as usize)
            .map(|(data, _)| data.as_ref().clone())
            .unwrap_or_default()
    }

    /// the family a font file was added for with `addFont`, or "" for the
    /// ones the engine was made with (and for none)
    #[wasm_bindgen(js_name = fontFileFamily)]
    pub fn font_file_family(&self, index: u32) -> String {
        self.engine
            .fonts
            .sources()
            .get(index as usize)
            .map(|(_, family)| family.to_string())
            .unwrap_or_default()
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
            i64::from(shift),
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
    /// body and its header and footer. Deprecated: `pageBody` and
    /// `pageBands` give them apart, with their own versions
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

    /// what a page prints, its body and its header and footer, as `page`
    /// gives them: without the hints only the screen shows, for the print
    /// preview
    #[wasm_bindgen(js_name = printDisplay)]
    pub fn print_display(&mut self, page: u32) -> String {
        display(self.engine.printed_ops(page as usize))
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
            .face(font as usize)
            .map(|(file, _)| file.upem)
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

    /// the position a line up or down from `pos`, nearest to `goal`: [0,
    /// pos] for text, [1, pos] for a node, [] for none; see `verticalAt`,
    /// which also tells how to paint the caret there
    pub fn vertical(&self, pos: u32, down: bool, goal: f32) -> Vec<f64> {
        hit(self
            .engine
            .vertical(pos, false, down, goal)
            .map(|(hit, _)| hit))
    }

    /// the position a line up or down from the caret at `pos`, painted as
    /// `after` says (see `caret`), nearest to `goal`: [0, pos, after] for
    /// text, [1, pos, 0] for a node, [] for none. The `after` it gives is 1
    /// where the caret at the new position is to be painted at the end of
    /// its line, 0 else
    #[wasm_bindgen(js_name = verticalAt)]
    pub fn vertical_at(&self, pos: u32, after: bool, down: bool, goal: f32) -> Vec<f64> {
        match self.engine.vertical(pos, after, down, goal) {
            Some((found, after)) => {
                let mut values = hit(Some(found));
                values.push(if after { 1.0 } else { 0.0 });
                values
            }
            None => vec![],
        }
    }

    /// the start or end of the line a position is on, -1 for none; see
    /// `lineBoundary`, which also tells how to paint the caret there
    #[wasm_bindgen(js_name = lineEdge)]
    pub fn line_edge(&self, pos: u32, end: bool) -> f64 {
        self.engine
            .line_edge(pos, false, end)
            .map(|(pos, _)| pos as f64)
            .unwrap_or(-1.0)
    }

    /// the start or end of the line the caret at `pos` is painted on (as
    /// `after` says): [pos, after], where `after` is 1 if the caret there is
    /// to be painted at the end of its line, e.g. after a word broken where
    /// it is wider than the line; [] for none
    #[wasm_bindgen(js_name = lineBoundary)]
    pub fn line_boundary(&self, pos: u32, after: bool, end: bool) -> Vec<f64> {
        match self.engine.line_edge(pos, after, end) {
            Some((pos, after)) => vec![pos as f64, if after { 1.0 } else { 0.0 }],
            None => vec![],
        }
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

    /// the page numbers of the entries of the table of contents at `pos`,
    /// as JSON (an array of strings, "" for an entry whose heading isn't
    /// there), or "null" for none
    #[wasm_bindgen(js_name = tocNumbers)]
    pub fn toc_numbers(&self, pos: u32) -> String {
        let item = self
            .engine
            .items
            .iter()
            .position(|item| matches!(item.content, Content::Toc { .. }) && item.from() == pos);
        match item.and_then(|item| self.engine.toc_labels(item)) {
            Some(labels) => serde_json::to_string(labels).unwrap_or_else(|_| "null".into()),
            None => "null".into(),
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
    /// from, and the page it settled at (-1 for none); for tests
    #[cfg(feature = "test-hooks")]
    pub fn stats(&self) -> Vec<i32> {
        let stats = self.engine.stats;
        vec![
            stats.laid_out as i32,
            stats.paginated_from as i32,
            stats.settled_at.map(|page| page as i32).unwrap_or(-1),
        ]
    }

    /// the styles text is set in, which the Word styles repeat: for each of
    /// p, h1 to h6, code and caption its size, its line height as a factor of
    /// the font's natural one, weight, slant (1 for italic), tracking and
    /// whether it is monospaced; for tests
    #[cfg(feature = "test-hooks")]
    #[wasm_bindgen(js_name = textStyles)]
    pub fn text_styles(&self) -> Vec<f32> {
        use crate::model::TextKind;
        use crate::style::{text_style, NATURAL};
        [
            TextKind::P,
            TextKind::H1,
            TextKind::H2,
            TextKind::H3,
            TextKind::H4,
            TextKind::H5,
            TextKind::H6,
            TextKind::Code,
            TextKind::Caption,
        ]
        .into_iter()
        .flat_map(|kind| {
            let style = text_style(kind);
            [
                style.size,
                style.line / (style.size * NATURAL),
                style.weight,
                f32::from(u8::from(style.italic)),
                style.tracking,
                f32::from(u8::from(style.mono)),
            ]
        })
        .collect()
    }

    /// the size, distance from the edge and line of the headers and footers,
    /// which the page view repeats; for tests
    #[cfg(feature = "test-hooks")]
    #[wasm_bindgen(js_name = bandMetrics)]
    pub fn band_metrics(&self) -> Vec<f32> {
        use crate::bands::{BAND_DISTANCE, BAND_LINE, BAND_SIZE};
        vec![BAND_SIZE, BAND_DISTANCE, BAND_LINE]
    }

    /// the names of Blank's font files, in the order the webview loads
    /// them; for tests
    #[cfg(feature = "test-hooks")]
    #[wasm_bindgen(js_name = bundledFontFiles)]
    pub fn bundled_font_files(&self) -> Vec<String> {
        crate::fonts::FONT_FILES
            .iter()
            .map(|name| name.to_string())
            .collect()
    }

    /// the colour of a role on paper, as 0xRRGGBB; for tests
    #[cfg(feature = "test-hooks")]
    #[wasm_bindgen(js_name = roleColor)]
    pub fn role_color(&self, role: u8) -> Option<u32> {
        let (red, green, blue) = pdf::paper_rgb(crate::items::Role::from_u8(role)?);
        Some(u32::from(red) << 16 | u32::from(green) << 8 | u32::from(blue))
    }

    /// the words as laid out, for checking the PDF against the layout; for
    /// tests
    #[cfg(feature = "test-hooks")]
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

    /// a drawing of a module's (a diagram's, maths'), by the src of the
    /// image it stands in (see `crate::drawing`); false for one it can't
    /// read, which stays the image
    #[wasm_bindgen(js_name = addDrawing)]
    pub fn add_drawing(&mut self, src: &str, json: &str) -> bool {
        match crate::drawing::Drawing::read(json) {
            Some(drawing) => {
                self.engine.drawings.insert(src.to_string(), drawing);
                true
            }
            None => false,
        }
    }

    /// forgets a drawing, e.g. one no document shows any more
    #[wasm_bindgen(js_name = removeDrawing)]
    pub fn remove_drawing(&mut self, src: &str) {
        self.engine.drawings.remove(src);
    }

    /// an image's file for the PDF, by its src: `kind` 0 for PNG, 1 for
    /// JPEG
    #[wasm_bindgen(js_name = addImage)]
    pub fn add_image(&mut self, src: &str, bytes: Vec<u8>, kind: u8) {
        let kind = ImageKind::from_code(kind);
        self.images
            .insert(src.to_string(), ImageData { bytes, kind });
    }

    /// the document as a PDF/A-2u, in `language` (a BCP 47 tag such as
    /// "de-CH", none if left out or empty), made at `date` (ISO 8601 with
    /// its offset, such as "2026-10-01T09:30:00+02:00"; PDF/A needs it), of
    /// all its pages or of `pages` (their indexes, ascending). An image that
    /// can't be decoded shows its alt text, a font that can't be embedded is
    /// left out, and a document that can't be PDF/A-2u is a normal PDF: see
    /// `pdfWarnings`
    pub fn pdf(
        &mut self,
        title: &str,
        author: &str,
        language: Option<String>,
        date: Option<String>,
        pages: Option<Vec<u32>>,
    ) -> Result<Vec<u8>, JsError> {
        let info = Info {
            title: title.to_string(),
            author: author.to_string(),
            date: date.unwrap_or_default(),
        };
        let language = language.unwrap_or_default();
        self.warnings.clear();
        let written = match pages {
            Some(pages) => {
                let pages: Vec<usize> = pages.into_iter().map(|page| page as usize).collect();
                pdf::write_pages(&mut self.engine, &self.images, &info, &language, &pages)
            }
            None => pdf::write_with(&mut self.engine, &self.images, &info, &language),
        }
        .map_err(error)?;
        self.warnings = written.warnings;
        Ok(written.bytes)
    }

    /// sheets to print as a PDF, titled `title`: `sheets` is JSON, a list of
    /// `{width, height, placements: [{page, x, y, scale}]}` in points, see
    /// PrintSheet. Untagged and without bookmarks or links; what went wrong
    /// is in `pdfWarnings`, as for `pdf`
    #[wasm_bindgen(js_name = printPdf)]
    pub fn print_pdf(&mut self, sheets: &str, title: &str) -> Result<Vec<u8>, JsError> {
        let sheets: Vec<PrintSheet> = serde_json::from_str(sheets).map_err(error)?;
        let info = Info {
            title: title.to_string(),
            ..Info::default()
        };
        self.warnings.clear();
        let written =
            pdf::write_print(&mut self.engine, &self.images, &info, &sheets).map_err(error)?;
        self.warnings = written.warnings;
        Ok(written.bytes)
    }

    /// what went wrong in the last PDF, as JSON: `[{"kind": "image", "src":
    /// …}, {"kind": "font", "font": index, "family": …}, {"kind": "pdfa",
    /// "reason": …}]`, empty for nothing
    #[wasm_bindgen(js_name = pdfWarnings)]
    pub fn pdf_warnings(&self) -> String {
        let warnings: Vec<serde_json::Value> = self
            .warnings
            .iter()
            .map(|warning| match warning {
                Warning::Image(src) => serde_json::json!({ "kind": "image", "src": src }),
                Warning::Font(font) => serde_json::json!({
                    "kind": "font",
                    "font": font,
                    "family": self
                        .engine
                        .fonts
                        .face(*font)
                        .map(|(file, _)| file.family.as_str())
                        .unwrap_or(""),
                }),
                Warning::Pdfa(reason) => serde_json::json!({ "kind": "pdfa", "reason": reason }),
            })
            .collect();
        serde_json::to_string(&warnings).unwrap_or_else(|_| "[]".into())
    }
}

//! The text layer: the lines and words of the document as laid out, for
//! checking the PDF against the layout.

use super::{Engine, Op};

/// a word as laid out, see Engine::words
#[derive(Clone, Debug, PartialEq)]
pub struct Word {
    pub page: usize,
    pub left: f32,
    pub right: f32,
    pub baseline: f32,
    pub size: f32,
    pub font: usize,
    pub text: String,
    start: u32,
}

impl Engine {
    /// the words of the document as laid out: page, left and right edge,
    /// baseline, font size and text
    pub fn words(&mut self) -> Vec<Word> {
        let mut words = vec![];
        for page in 0..self.pages.len() {
            for op in self.page_ops(page, true) {
                let Op::Glyphs { run, text, .. } = op else {
                    continue;
                };
                let mut current: Option<Word> = None;
                for glyph in &run.glyphs {
                    let piece = &text[glyph.start as usize..glyph.end as usize];
                    if piece.trim().is_empty() {
                        words.extend(current.take());
                        continue;
                    }
                    let word = current.get_or_insert_with(|| Word {
                        page,
                        left: glyph.x,
                        right: glyph.x,
                        baseline: run.baseline,
                        size: run.size,
                        font: run.font,
                        text: String::new(),
                        start: glyph.start,
                    });
                    word.right = glyph.x + glyph.advance;
                    // a ligature's glyphs share their cluster
                    if glyph.start >= word.start {
                        word.text = text[word.start as usize..glyph.end as usize].to_string();
                    }
                }
                words.extend(current.take());
            }
        }
        // a word in two runs, e.g. bold then a comma, is one word, unless
        // the size changes, e.g. from inline code to the text, where
        // pdftotext starts a new word too
        let mut merged: Vec<Word> = vec![];
        for word in words {
            if let Some(last) = merged.last_mut() {
                if last.page == word.page
                    && (last.size - word.size).abs() < 0.01
                    && (last.baseline - word.baseline).abs() < 0.01
                    && (last.right - word.left).abs() < 0.01
                {
                    last.right = word.right;
                    last.text.push_str(&word.text);
                    continue;
                }
            }
            merged.push(word);
        }
        merged
    }
}

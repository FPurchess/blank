//! The PDF's structure, for readers that read it aloud or reflow it: each
//! item as a heading, a paragraph, a list item, a quote, a table or a
//! figure, holding the content drawn for it; and the bookmarks of its
//! headings.

use std::collections::HashMap;
use std::num::NonZeroU16;

use krilla::destination::XyzDestination;
use krilla::geom::Point;
use krilla::outline::{Outline, OutlineNode};
use krilla::tagging::{
    Identifier, ListNumbering, Node, TableHeaderScope, Tag, TagGroup, TagKind, TagTree,
};

use crate::engine::{Engine, Part};
use crate::items::{Laid, Marked, TableCell};
use crate::model::Content;

/// the marked content drawn for each part of the document, in the order it
/// was drawn
/// with the order each was drawn in
pub(super) type Ids = HashMap<Part, Vec<(usize, Identifier)>>;

fn leaves(ids: &mut Ids, part: Part) -> Vec<Node> {
    let mut found = ids.remove(&part).unwrap_or_default();
    found.sort_by_key(|(order, _)| *order);
    found.into_iter().map(|(_, id)| Node::Leaf(id)).collect()
}

/// what was drawn of a text box, in the order it was drawn: its text, and
/// each link in it as a Link holding the link's text and its annotations
fn text_nodes(ids: &mut Ids, item: usize, text: usize) -> Vec<Node> {
    let mut drawn: Vec<(usize, Option<usize>, Identifier)> = ids
        .remove(&Part::Text { item, text })
        .unwrap_or_default()
        .into_iter()
        .map(|(order, id)| (order, None, id))
        .collect();
    let links: Vec<usize> = ids
        .keys()
        .filter_map(|part| match *part {
            Part::Linked {
                item: of,
                text: at,
                link,
            } if of == item && at == text => Some(link),
            _ => None,
        })
        .collect();
    for link in &links {
        let runs = ids
            .remove(&Part::Linked {
                item,
                text,
                link: *link,
            })
            .unwrap_or_default();
        drawn.extend(runs.into_iter().map(|(order, id)| (order, Some(*link), id)));
    }
    drawn.sort_by_key(|(order, ..)| *order);
    let mut nodes: Vec<Node> = vec![];
    let mut open: Option<(usize, Vec<Node>)> = None;
    let close = |open: &mut Option<(usize, Vec<Node>)>, nodes: &mut Vec<Node>, ids: &mut Ids| {
        if let Some((link, mut children)) = open.take() {
            children.extend(leaves(ids, Part::Link { item, text, link }));
            nodes.push(group(Tag::Link, children));
        }
    };
    for (_, link, id) in drawn {
        match link {
            None => {
                close(&mut open, &mut nodes, ids);
                nodes.push(Node::Leaf(id));
            }
            Some(link) => {
                if open.as_ref().is_some_and(|(current, _)| *current != link) {
                    close(&mut open, &mut nodes, ids);
                }
                open.get_or_insert_with(|| (link, vec![]))
                    .1
                    .push(Node::Leaf(id));
            }
        }
    }
    close(&mut open, &mut nodes, ids);
    nodes
}

fn group(tag: impl Into<TagKind>, children: Vec<Node>) -> Node {
    TagGroup::with_children(tag, children).into()
}

/// a quote or a list the items go into
enum Open {
    Quote {
        depth: usize,
        children: Vec<Node>,
    },
    List {
        indent: f32,
        numbering: ListNumbering,
        items: Vec<Node>,
        /// the list item being filled: its label and its body
        current: Option<(Vec<Node>, Vec<Node>)>,
    },
}

fn list_item((label, body): (Vec<Node>, Vec<Node>)) -> Node {
    let mut children = vec![];
    if !label.is_empty() {
        children.push(group(Tag::Lbl, label));
    }
    children.push(group(Tag::LBody, body));
    group(Tag::LI, children)
}

/// puts the items into their quotes and lists, which items say by their
/// quote bars, list markers and indents, as flatten.ts gives them
#[derive(Default)]
struct Builder {
    root: Vec<Node>,
    open: Vec<Open>,
}

impl Builder {
    fn push(&mut self, node: Node) {
        match self.open.last_mut() {
            None => self.root.push(node),
            Some(Open::Quote { children, .. }) => children.push(node),
            Some(Open::List { current, .. }) => match current {
                Some((_, body)) => body.push(node),
                None => *current = Some((vec![], vec![node])),
            },
        }
    }

    fn close(&mut self) {
        let node = match self.open.pop() {
            None => return,
            Some(Open::Quote { children, .. }) => group(Tag::BlockQuote, children),
            Some(Open::List {
                numbering,
                mut items,
                current,
                ..
            }) => {
                items.extend(current.map(list_item));
                group(Tag::L(numbering), items)
            }
        };
        self.push(node);
    }

    fn close_all(&mut self) {
        while !self.open.is_empty() {
            self.close();
        }
    }

    /// places an item's node, `depth` quotes deep, at `indent`, with the
    /// label of its list marker if it has one
    fn place(&mut self, depth: usize, indent: f32, marker: Option<(Vec<Node>, bool)>, node: Node) {
        // close the quotes and lists it isn't in
        while let Some(open) = self.open.last() {
            let contains = match open {
                Open::Quote { depth: quote, .. } => depth >= *quote,
                Open::List { indent: list, .. } => indent >= list - 0.01,
            };
            if contains {
                break;
            }
            self.close();
        }
        let quotes = self
            .open
            .iter()
            .filter(|open| matches!(open, Open::Quote { .. }))
            .count();
        for quote in quotes..depth {
            self.open.push(Open::Quote {
                depth: quote + 1,
                children: vec![],
            });
        }
        let Some((label, numbered)) = marker else {
            self.push(node);
            return;
        };
        match self.open.last_mut() {
            Some(Open::List {
                indent: list,
                items,
                current,
                ..
            }) if (*list - indent).abs() < 0.01 => {
                items.extend(current.take().map(list_item));
                *current = Some((label, vec![node]));
            }
            _ => self.open.push(Open::List {
                indent,
                numbering: if numbered {
                    ListNumbering::Decimal
                } else {
                    ListNumbering::Disc
                },
                items: vec![],
                current: Some((label, vec![node])),
            }),
        }
    }
}

/// a heading level for the tags, 1 to 6
fn heading_level(level: u8) -> Option<NonZeroU16> {
    (1..=6)
        .contains(&level)
        .then(|| NonZeroU16::new(level as u16))
        .flatten()
}

/// what an item is in the structure, with what was drawn for it
fn item_node(engine: &Engine, index: usize, ids: &mut Ids) -> Option<Node> {
    let item = &engine.items[index];
    match &item.content {
        Content::Text(text) => {
            let children = text_nodes(ids, index, 0);
            let node = match heading_level(text.level) {
                Some(level) => group(Tag::Hn(level, Some(text.text.clone())), children),
                None if text.style == "code" => group(Tag::P, vec![group(Tag::Code, children)]),
                None => group(Tag::P, children),
            };
            Some(node)
        }
        Content::Image { src, alt, .. } => {
            let mut children = leaves(ids, Part::Image { item: index });
            children.extend(leaves(ids, Part::Label { item: index }));
            let alt = if alt.is_empty() { src } else { alt };
            Some(group(Tag::Figure(Some(alt.clone())), children))
        }
        Content::Table { .. } => Some(table_node(engine, index, ids)),
        Content::Break { .. } | Content::Rule { .. } => None,
    }
}

fn table_node(engine: &Engine, index: usize, ids: &mut Ids) -> Node {
    let laid = &engine.laid[index];
    let mut children = vec![];
    let caption = leaves(ids, Part::Label { item: index });
    if !caption.is_empty() {
        children.push(group(Tag::Caption, caption));
    }
    let rows = laid
        .cells
        .iter()
        .map(|cell| cell.row)
        .max()
        .map_or(0, |last| last + 1);
    for row in 0..rows {
        let mut cells = vec![];
        for cell in laid.cells.iter().filter(|cell| cell.row == row) {
            let content = cell_content(laid, index, cell, ids);
            cells.push(if cell.header {
                group(Tag::TH(TableHeaderScope::Column), content)
            } else {
                group(Tag::TD, content)
            });
        }
        children.push(group(Tag::TR, cells));
    }
    group(Tag::Table, children)
}

/// what a cell holds, in the order it shows it: its paragraphs, with the
/// list markers on their baselines as the labels of list items, its images
/// and its alt texts, from the top down
fn cell_content(laid: &Laid, index: usize, cell: &TableCell, ids: &mut Ids) -> Vec<Node> {
    let left = cell
        .texts
        .clone()
        .map(|text| laid.texts[text].x)
        .chain(cell.images.iter().map(|&image| laid.cell_images[image].x))
        .fold(f32::INFINITY, f32::min);
    let marker_of = |marked: Marked| {
        cell.markers
            .iter()
            .find(|(block, _)| *block == marked)
            .map(|&(_, extra)| extra)
    };
    // the blocks from the top down: (y, x, the marker, the node)
    let mut blocks: Vec<(f32, f32, Option<usize>, Node)> = vec![];
    for text in cell.texts.clone() {
        let boxed = &laid.texts[text];
        let paragraph = group(Tag::P, text_nodes(ids, index, text));
        blocks.push((boxed.y, boxed.x, marker_of(Marked::Text(text)), paragraph));
    }
    for &image in &cell.images {
        let placed = &laid.cell_images[image];
        let alt = (!placed.alt.is_empty()).then(|| placed.alt.clone());
        let figure = group(
            Tag::Figure(alt),
            leaves(ids, Part::CellImage { item: index, image }),
        );
        blocks.push((
            placed.y,
            placed.x,
            marker_of(Marked::Image(placed.pos)),
            figure,
        ));
    }
    // an alt text stands for an image that isn't loaded, with its marker
    for &(pos, extra) in &cell.alts {
        let (boxed, _) = &laid.extras[extra];
        let content = leaves(ids, Part::Extra { item: index, extra });
        let figure = group(Tag::Figure(Some(boxed.text.to_string())), content);
        blocks.push((boxed.y, boxed.x, marker_of(Marked::Image(pos)), figure));
    }
    blocks.sort_by(|a, b| a.0.total_cmp(&b.0));
    let mut builder = Builder::default();
    for (_, x, marker, node) in blocks {
        let marker = marker.map(|extra| {
            let numbered = laid.extras[extra].0.text.trim_end().ends_with('.');
            (leaves(ids, Part::Extra { item: index, extra }), numbered)
        });
        builder.place(0, x - left, marker, node);
    }
    builder.close_all();
    builder.root
}

/// the structure of the document, holding everything drawn for it
pub(super) fn tag_tree(engine: &Engine, ids: &mut Ids, language: &str) -> TagTree {
    let mut builder = Builder::default();
    for index in 0..engine.items.len() {
        let Some(node) = item_node(engine, index, ids) else {
            continue;
        };
        let item = &engine.items[index];
        let marker = item.marker.as_ref().map(|marker| {
            let label = leaves(ids, Part::Marker { item: index });
            (label, marker.trim_end().ends_with('.'))
        });
        builder.place(item.bars.len(), item.indent, marker, node);
    }
    builder.close_all();
    let mut tree = TagTree::new().with_lang((!language.is_empty()).then(|| language.to_string()));
    for node in builder.root {
        tree.push(node);
    }
    // anything drawn that no item holds, so that nothing is lost
    let mut rest: Vec<(Part, Vec<(usize, Identifier)>)> = ids.drain().collect();
    rest.sort_by_key(|(part, _)| format!("{part:?}"));
    let rest: Vec<Node> = rest
        .into_iter()
        .flat_map(|(_, found)| found.into_iter().map(|(_, id)| Node::Leaf(id)))
        .collect();
    if !rest.is_empty() {
        tree.push(group(Tag::Div, rest));
    }
    tree
}

/// the bookmarks of the document: every heading, its level, text, page and
/// where on it it starts
pub fn outline_entries(engine: &Engine) -> Vec<(u8, String, usize, f32)> {
    let mut entries = vec![];
    for (index, item) in engine.items.iter().enumerate() {
        let Content::Text(text) = &item.content else {
            continue;
        };
        if heading_level(text.level).is_none() || !text.top {
            continue;
        }
        let Some(&frag) = engine.first_frag.get(index) else {
            continue;
        };
        let Some(placed) = engine.frags.get(frag) else {
            continue;
        };
        let page = engine
            .pages
            .partition_point(|page| page.end <= frag)
            .min(engine.pages.len().saturating_sub(1));
        entries.push((text.level, text.text.clone(), page, placed.y));
    }
    entries
}

/// the bookmarks, nested by the headings' levels
pub(super) fn outline(engine: &Engine) -> Outline {
    let left = engine.settings.margins.left;
    let mut outline = Outline::new();
    let mut open: Vec<(u8, OutlineNode)> = vec![];
    let attach = |open: &mut Vec<(u8, OutlineNode)>, outline: &mut Outline| {
        if let Some((_, node)) = open.pop() {
            match open.last_mut() {
                Some((_, parent)) => parent.push_child(node),
                None => outline.push_child(node),
            }
        }
    };
    for (level, text, page, y) in outline_entries(engine) {
        while open
            .last()
            .is_some_and(|(open_level, _)| *open_level >= level)
        {
            attach(&mut open, &mut outline);
        }
        let destination = XyzDestination::new(page, Point::from_xy(left, y));
        open.push((level, OutlineNode::new(text, destination)));
    }
    while !open.is_empty() {
        attach(&mut open, &mut outline);
    }
    outline
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::test_support::{engine, heading, paragraph};
    use crate::model::Settings;

    #[test]
    fn bookmarks_the_headings() {
        let settings = Settings {
            new_page_before: vec![1],
            ..Default::default()
        };
        let mut engine = engine(vec![
            heading(1, 1, "One"),
            paragraph(10, "text"),
            heading(20, 2, "One a"),
            heading(30, 3, "One a i"),
            heading(40, 1, "Two"),
            heading(50, 2, "Two a"),
        ]);
        engine.set_settings(settings);
        let entries = outline_entries(&engine);
        let found: Vec<(u8, &str, usize)> = entries
            .iter()
            .map(|(level, text, page, _)| (*level, text.as_str(), *page))
            .collect();
        assert_eq!(
            found,
            [
                (1, "One", 0),
                (2, "One a", 0),
                (3, "One a i", 0),
                (1, "Two", 1),
                (2, "Two a", 1)
            ]
        );
        // each at the top of where its heading starts
        let top = engine.settings.content_top();
        assert!((entries[0].3 - top).abs() < 0.01);
        assert!(entries[1].3 > entries[0].3);
    }

    #[test]
    fn nests_lists_and_quotes() {
        let mut builder = Builder::default();
        let node = |_: &str| group(Tag::P, vec![]);
        // a list of two items, the second with a nested list, then a quote
        builder.place(0, 18.0, Some((vec![], false)), node("a"));
        builder.place(0, 18.0, Some((vec![], false)), node("b"));
        builder.place(0, 36.0, Some((vec![], true)), node("b.1"));
        builder.place(0, 18.0, None, node("b, more"));
        builder.place(1, 12.0, None, node("quoted"));
        builder.place(0, 0.0, None, node("after"));
        builder.close_all();
        let shape = builder.root.iter().map(shape).collect::<Vec<_>>();
        assert_eq!(
            shape,
            [
                "L[LI[LBody[P]] LI[LBody[P L[LI[LBody[P]]] P]]]",
                "BlockQuote[P]",
                "P"
            ]
        );
    }

    /// the tags of a node, with its groups' children in brackets
    fn shape(node: &Node) -> String {
        match node {
            Node::Leaf(_) => "leaf".into(),
            Node::Group(group) => {
                let name = format!("{:?}", group.tag);
                let name = name.split(['(', ' ', '{']).next().unwrap_or("").to_string();
                let children: Vec<String> = group.children.iter().map(shape).collect();
                if children.is_empty() {
                    name
                } else {
                    format!("{name}[{}]", children.join(" "))
                }
            }
        }
    }
}

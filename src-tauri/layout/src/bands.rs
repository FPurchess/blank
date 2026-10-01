//! The headers and footers of a page, as src/layout/bands.ts and tokens.ts
//! define them: which bands a page has, and what their fields stand for.

use crate::model::{Bands, FirstPage, Settings, Slots};

/// the size of a band's text, a step down from the body
pub const BAND_SIZE: f32 = 11.0 / 1.25;
/// from the edge of the page to the header or the footer's line
pub const BAND_DISTANCE: f32 = 36.0;
/// a band's line, at the natural 1.3 em of IBM Plex Sans
pub const BAND_LINE: f32 = BAND_SIZE * 1.3;

/// the number a page shows, `page` counted from 1
pub fn page_number(settings: &Settings, page: usize) -> i64 {
    (page as i64).saturating_add(settings.start_number) - 1
}

/// the header and footer of a page: the first page's own or none, those of
/// even pages (even by the number the page shows, as in Word), or those of
/// every page
pub fn bands_on(settings: &Settings, page: usize) -> Bands {
    if page == 1 {
        match &settings.first_page {
            FirstPage::Named(name) if name == "plain" => return Bands::default(),
            FirstPage::Own(bands) => return bands.clone(),
            _ => {}
        }
    }
    if let Some(even) = &settings.even_pages {
        if page_number(settings, page) % 2 == 0 {
            return even.clone();
        }
    }
    Bands {
        header: settings.header.clone(),
        footer: settings.footer.clone(),
    }
}

const ROMAN: [(i64, &str); 13] = [
    (1000, "m"),
    (900, "cm"),
    (500, "d"),
    (400, "cd"),
    (100, "c"),
    (90, "xc"),
    (50, "l"),
    (40, "xl"),
    (10, "x"),
    (9, "ix"),
    (5, "v"),
    (4, "iv"),
    (1, "i"),
];

/// the largest number roman numerals write without a bar over them
pub const LARGEST_ROMAN: i64 = 3999;

/// writes a page number in a style: 4, iv or IV; roman numerals start at 1
/// and end at LARGEST_ROMAN, and numbers outside are written in arabic
pub fn format_number(number: i64, style: &str) -> String {
    if style == "1" || !(1..=LARGEST_ROMAN).contains(&number) {
        return number.to_string();
    }
    let mut rest = number;
    let mut roman = String::new();
    for (value, letters) in ROMAN {
        while rest >= value {
            roman.push_str(letters);
            rest -= value;
        }
    }
    if style == "I" {
        roman.to_uppercase()
    } else {
        roman
    }
}

/// whether a slot of any band shows `{field}`, e.g. "chapter"
pub fn uses_field(settings: &Settings, field: &str) -> bool {
    let token = format!("{{{field}}}");
    let shows = |slots: &Slots| {
        [&slots.left, &slots.center, &slots.right]
            .iter()
            .any(|slot| slot.contains(&token))
    };
    let own = match &settings.first_page {
        FirstPage::Own(bands) => shows(&bands.header) || shows(&bands.footer),
        FirstPage::Named(_) => false,
    };
    let even = settings
        .even_pages
        .as_ref()
        .is_some_and(|bands| shows(&bands.header) || shows(&bands.footer));
    shows(&settings.header) || shows(&settings.footer) || own || even
}

/// a heading 1 and the page it starts on
#[derive(Clone, Debug, PartialEq)]
pub struct Chapter {
    pub page: usize,
    pub text: String,
}

/// what {chapter} stands for on a page: its first heading 1, or else the
/// last one before it, like Word's STYLEREF
pub fn chapter_on(chapters: &[Chapter], page: usize) -> String {
    let mut text = "";
    for chapter in chapters {
        if chapter.page > page {
            break;
        }
        text = &chapter.text;
        if chapter.page == page {
            break;
        }
    }
    text.to_string()
}

/// what the fields of a page stand for
pub struct Values<'a> {
    pub settings: &'a Settings,
    pub page: usize,
    pub pages: usize,
    pub chapter: String,
}

impl Values<'_> {
    fn get(&self, field: &str) -> Option<String> {
        let fields = &self.settings.fields;
        Some(match field {
            "page" => format_number(
                page_number(self.settings, self.page),
                &self.settings.number_style,
            ),
            "pages" => self.pages.to_string(),
            "title" => fields.title.clone(),
            "author" => fields.author.clone(),
            "chapter" => self.chapter.clone(),
            "date" => fields.date.clone(),
            "file" => fields.file.clone(),
            _ => return None,
        })
    }
}

/// writes the values into the fields of a slot; `{{` writes a `{`, and
/// anything else in braces stays as it is
/// the most characters a slot shows, far more than fit a page's width
pub const MAX_SLOT: usize = 1000;

pub fn expand(text: &str, values: &Values) -> String {
    let mut result = String::new();
    let mut rest = text;
    while let Some(start) = rest.find('{') {
        if result.len() > MAX_SLOT * 4 {
            break;
        }
        result.push_str(&rest[..start]);
        let after = &rest[start + 1..];
        if let Some(stripped) = after.strip_prefix('{') {
            result.push('{');
            rest = stripped;
            continue;
        }
        if let Some(end) = after.find('}') {
            if let Some(value) = values.get(&after[..end]) {
                result.push_str(&value);
                rest = &after[end + 1..];
                continue;
            }
        }
        result.push('{');
        rest = after;
    }
    result.push_str(rest);
    if result.chars().count() > MAX_SLOT {
        result = result.chars().take(MAX_SLOT).collect();
    }
    result
}

/// the text of a band's slots on a page
pub fn expand_slots(slots: &Slots, values: &Values) -> [String; 3] {
    [
        expand(&slots.left, values),
        expand(&slots.center, values),
        expand(&slots.right, values),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::Fields;

    fn settings() -> Settings {
        Settings {
            fields: Fields {
                title: "Essay".into(),
                ..Default::default()
            },
            ..Default::default()
        }
    }

    #[test]
    fn formats_numbers() {
        assert_eq!(format_number(4, "1"), "4");
        assert_eq!(format_number(4, "i"), "iv");
        assert_eq!(format_number(1994, "I"), "MCMXCIV");
        assert_eq!(format_number(0, "i"), "0");
        assert_eq!(format_number(3999, "I"), "MMMCMXCIX");
        assert_eq!(format_number(4000, "i"), "4000");
    }

    #[test]
    fn writes_huge_page_numbers_in_arabic_at_once() {
        // one "m" per thousand took 11.8 s for a page at 200000000
        let started = std::time::Instant::now();
        assert_eq!(format_number(200_000_000, "i"), "200000000");
        assert_eq!(format_number(i64::MAX, "I"), i64::MAX.to_string());
        assert!(started.elapsed().as_millis() < 10);
        let settings = Settings {
            start_number: i64::MAX,
            ..Default::default()
        };
        assert_eq!(page_number(&settings, 5), i64::MAX - 1);
    }

    #[test]
    fn expands_fields() {
        let settings = settings();
        let values = Values {
            settings: &settings,
            page: 2,
            pages: 5,
            chapter: "One".into(),
        };
        assert_eq!(expand("Page {page} of {pages}", &values), "Page 2 of 5");
        assert_eq!(expand("{title}: {chapter}", &values), "Essay: One");
        assert_eq!(expand("{{page} {nope} {", &values), "{page} {nope} {");
    }

    #[test]
    fn caps_what_a_slot_shows() {
        let settings = Settings {
            fields: Fields {
                title: "t".repeat(5000),
                ..Default::default()
            },
            ..Default::default()
        };
        let values = Values {
            settings: &settings,
            page: 1,
            pages: 1,
            chapter: String::new(),
        };
        let slot = "{title}".repeat(1000);
        assert_eq!(expand(&slot, &values).chars().count(), MAX_SLOT);
    }

    #[test]
    fn picks_the_bands_of_a_page() {
        let mut settings = settings();
        settings.footer.center = "{page}".into();
        settings.first_page = FirstPage::Named("plain".into());
        settings.even_pages = Some(Bands {
            header: Slots {
                right: "{chapter}".into(),
                ..Default::default()
            },
            footer: Slots::default(),
        });
        assert!(!bands_on(&settings, 1).footer.has_text());
        assert!(bands_on(&settings, 2).header.has_text());
        assert_eq!(bands_on(&settings, 3).footer.center, "{page}");
    }

    #[test]
    fn finds_chapters() {
        let chapters = vec![
            Chapter {
                page: 1,
                text: "A".into(),
            },
            Chapter {
                page: 3,
                text: "B".into(),
            },
            Chapter {
                page: 3,
                text: "C".into(),
            },
        ];
        assert_eq!(chapter_on(&chapters, 2), "A");
        assert_eq!(chapter_on(&chapters, 3), "B");
        assert_eq!(chapter_on(&chapters, 4), "C");
        assert_eq!(chapter_on(&[], 1), "");
    }
}

//! Parsing Hunspell dictionaries with spellbook.

use std::borrow::Cow;

use spellbook::Dictionary;

enum FlagType {
    // one char per flag, the default and FLAG UTF-8
    Char,
    // two chars per flag
    Long,
    // comma separated numbers
    Num,
}

fn flag_type(aff: &str) -> FlagType {
    let flag = aff
        .lines()
        .find_map(|line| line.trim().strip_prefix("FLAG "))
        .map(str::trim);
    match flag {
        Some("long") => FlagType::Long,
        Some("num") => FlagType::Num,
        _ => FlagType::Char,
    }
}

/// flags returns the flags of a .dic line: the part after the first unescaped
/// "/" up to the first whitespace, which starts the morphological fields
fn flags(line: &str) -> Option<&str> {
    let bytes = line.as_bytes();
    let slash =
        (0..bytes.len()).find(|&i| bytes[i] == b'/' && (i == 0 || bytes[i - 1] != b'\\'))?;
    let rest = &line[slash + 1..];
    Some(rest.split([' ', '\t']).next().unwrap_or(rest))
}

fn valid_flags(flags: &str, flag_type: &FlagType) -> bool {
    match flag_type {
        FlagType::Char => true,
        FlagType::Long => flags.chars().count().is_multiple_of(2),
        FlagType::Num => flags
            .split(',')
            .all(|flag| flag.parse::<u16>().is_ok_and(|flag| flag != 0)),
    }
}

/// sanitize drops the few .dic lines with malformed flags that some published
/// dictionaries contain, e.g. `"A/S"` in the Danish one. Hunspell ignores the
/// broken flags, but spellbook rejects the whole dictionary.
fn sanitize<'a>(aff: &str, dic: &'a str) -> Cow<'a, str> {
    let flag_type = flag_type(aff);
    let broken = |line: &str| flags(line).is_some_and(|flags| !valid_flags(flags, &flag_type));
    // the first line holds the approximate word count
    if !dic.lines().skip(1).any(broken) {
        return Cow::Borrowed(dic);
    }
    let mut lines = dic.lines();
    let mut out = String::with_capacity(dic.len());
    out.extend(lines.next().map(|line| format!("{line}\n")));
    for line in lines.filter(|line| !broken(line)) {
        out.push_str(line);
        out.push('\n');
    }
    Cow::Owned(out)
}

/// parse loads a dictionary from the content of its .aff and .dic files
pub fn parse(aff: &str, dic: &str) -> Result<Dictionary, String> {
    Dictionary::new(aff, &sanitize(aff, dic)).map_err(|error| format!("Parse: {error}"))
}

/// add adds the words of a personal dictionary. `add` reads "/" as the start of
/// flags, so words containing one are left to the frontend.
pub fn add_words(dict: &mut Dictionary, words: &[String]) {
    for word in words.iter().filter(|word| !word.contains('/')) {
        if let Err(error) = dict.add(word) {
            eprintln!("failed to add {word:?} to the dictionary: {error}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::spellcheck::bundled;

    fn load(tag: &str) -> Dictionary {
        let (aff, dic) = bundled::get(tag).unwrap();
        parse(aff, dic).unwrap()
    }

    fn suggest(dict: &Dictionary, word: &str) -> Vec<String> {
        let mut out = vec![];
        dict.suggest(word, &mut out);
        out
    }

    #[test]
    fn checks_and_suggests_english() {
        let dict = load("en");
        assert!(dict.check("house"));
        assert!(dict.check("well-known"));
        assert!(dict.check("don’t"));
        assert!(!dict.check("housse"));
        assert!(suggest(&dict, "housse").contains(&"house".to_string()));
    }

    #[test]
    fn checks_german_compounds() {
        let dict = load("de");
        assert!(dict.check("Haustürschlüssel"));
        assert!(dict.check("Rechtschreibprüfung"));
        assert!(!dict.check("Hausturschlüssel"));
        assert!(suggest(&dict, "Hausturschlüssel").contains(&"Haustürschlüssel".to_string()));
    }

    #[test]
    fn adds_user_words_with_hunspell_case_rules() {
        let mut dict = load("en");
        add_words(
            &mut dict,
            &["blankish".into(), "iPhonez".into(), "Qzx/B".into()],
        );
        assert!(dict.check("blankish"));
        assert!(dict.check("Blankish"));
        assert!(dict.check("BLANKISH"));
        assert!(dict.check("iPhonez"));
        assert!(!dict.check("Iphonez"));
        // left to the frontend instead of being parsed as "Qzx" with flag "B"
        assert!(!dict.check("Qzx"));
        assert!(!dict.check("Qzx/B"));
    }

    #[test]
    fn drops_lines_with_malformed_flags() {
        let aff = "SET UTF-8\nFLAG num\nSFX 1 Y 1\nSFX 1 0 s .\n";
        let dic = "3\nhouse/1\n\"A/S\"\ntree/1 po:noun\n";
        assert_eq!(sanitize(aff, dic), "3\nhouse/1\ntree/1 po:noun\n");
        let dict = parse(aff, dic).unwrap();
        assert!(dict.check("houses"));
        assert!(dict.check("trees"));

        let long = "FLAG long\n";
        assert_eq!(sanitize(long, "2\nfoo/Aa\nbar/m01\n"), "2\nfoo/Aa\n");

        // untouched when nothing is broken, including escaped slashes
        let dic = "2\nand\\/or\nhouse/1\n";
        assert!(matches!(sanitize(aff, dic), Cow::Borrowed(_)));
    }
}

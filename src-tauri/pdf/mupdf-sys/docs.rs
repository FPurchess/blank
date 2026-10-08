use std::{cell::RefCell, collections::HashSet};

use bindgen::callbacks::{EnumVariantValue, ItemInfo, ParseCallbacks};
use regex::{Captures, Regex, RegexBuilder};

#[derive(Debug)]
pub struct DocsCallbacks {
    types: Regex,
    full_names: RefCell<HashSet<String>>,
}

impl Default for DocsCallbacks {
    fn default() -> Self {
        Self {
            types: RegexBuilder::new("fz_[a-z_*]+")
                .case_insensitive(true)
                .build()
                .unwrap(),
            full_names: RefCell::default(),
        }
    }
}

impl ParseCallbacks for DocsCallbacks {
    fn item_name(&self, item_info: ItemInfo<'_>) -> Option<String> {
        self.full_names
            .borrow_mut()
            .insert(item_info.name.to_owned());
        None
    }

    fn enum_variant_name(
        &self,
        _enum_name: Option<&str>,
        original_variant_name: &str,
        _variant_value: EnumVariantValue,
    ) -> Option<String> {
        self.full_names
            .borrow_mut()
            .insert(original_variant_name.to_owned());
        None
    }

    fn process_comment(&self, comment: &str) -> Option<String> {
        let mut output = String::new();
        let mut newlines = 0;
        let mut arguments = false;

        for line in comment.split('\n') {
            let mut line = line.trim();
            if line.is_empty() {
                newlines += 1;
                continue;
            }

            let mut argument = false;
            if let Some(pline) = line.strip_prefix("@param") {
                line = pline;
                argument = true;
            }

            match newlines {
                _ if argument => output.push('\n'),
                0 => {}
                1 => output.push_str("<br>"),
                _ => output.push_str("\n\n"),
            };
            newlines = 0;

            if argument {
                if !arguments {
                    output.push_str("# Arguments\n");
                    arguments = true;
                }
                output.push_str("* ");
            }

            let line = line
                .replace('[', "\\[")
                .replace(']', "\\]")
                .replace('(', "\\(")
                .replace(')', "\\)")
                .replace('<', "\\<")
                .replace('>', "\\>")
                .replace("NULL", "`NULL`");
            let mut line = self.types.replace_all(&line, |c: &Captures| {
                let name = &c[0];
                if name.contains('*') {
                    return format!("`{name}`");
                }

                let full_names = self.full_names.borrow();
                if !full_names.contains(name) {
                    const SUFFIXES: [&str; 3] = ["s", "ed", "ped"];

                    for suffix in SUFFIXES {
                        if let Some(short_name) = name.strip_suffix(suffix) {
                            if !full_names.contains(short_name) {
                                return format!("[`{short_name}`]({short_name}){suffix}");
                            }
                        }
                    }

                    for suffix in SUFFIXES {
                        if let Some(short_name) = name.strip_suffix(suffix) {
                            return format!("[`{short_name}`]({short_name}){suffix}");
                        }
                    }
                }

                format!("[`{name}`]")
            });

            if let Some((first, rest)) = line.split_once(": ") {
                let mut new_line = String::new();

                for arg in first.split(", ") {
                    if arg.contains(|c: char| c.is_whitespace() || c == '`') {
                        new_line.clear();
                        break;
                    }

                    if !new_line.is_empty() {
                        new_line.push_str(", ");
                    }
                    new_line.push('`');
                    new_line.push_str(arg);
                    new_line.push('`');
                }

                if !new_line.is_empty() {
                    new_line.push_str(": ");
                    new_line.push_str(rest);
                    line = new_line.into();
                }
            }

            output.push_str(&line);

            newlines += 1;
        }
        Some(output)
    }
}

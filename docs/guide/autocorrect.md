# Autocorrect

Blank corrects what you type the way Word and LibreOffice do. A correction applies once the word is complete: when you type Space, Tab, Enter or one of `. , ; : ? !` after it. That works anywhere in the text, not only at the end of a line.

- **Undo** (`Mod` `Z`) reverts the last correction and keeps what you typed.
- Nothing is corrected inside code blocks or inline code.
- Every group below can be [turned off](./configuration#autocorrect), and you can add your own replacements.

## What gets corrected

| You type                                      | You get                                             | Group        |
| --------------------------------------------- | --------------------------------------------------- | ------------ |
| `-->` `->` / `<--` `<-` / `<-->` `<->`        | → / ← / ↔                                           | `arrows`     |
| `==>` / `<==` / `<==>`                        | ⇒ / ⇐ / ⇔                                           | `arrows`     |
| `A - B`, `A -- B` / `A--B`                    | A – B (en dash) / A—B (em dash)                     | `dashes`     |
| `(c)` `(r)` `(tm)` `...`                      | © ® ™ …                                             | `symbols`    |
| `1/2` `1/4` `3/4` `+-` `!=` `<=` `>=`         | ½ ¼ ¾ ± ≠ ≤ ≥                                       | `symbols`    |
| `**bold**` `*italic*` `_italic_` `` `code` `` | **bold** _italic_ _italic_ `code`                   | `formatting` |
| `[title](url)` / `![alt](src)`                | a link / an image                                   | `formatting` |
| `https://…`, `www.…`, `name@example.com`      | a link                                              | `links`      |
| `"quotes"` and `'quotes'`                     | typographic quotes of the language, e.g. “…” or „…“ | `quotes`     |
| `hello. this`                                 | Hello. This (sentence starts)                       | `capitalize` |
| `THe`                                         | The                                                 | `capitalize` |

Dashes follow LibreOffice: the dash is set once the word after it is complete, so `--` followed by Space does not become a dash on its own.

The [block shortcuts](./writing#format-as-you-type) at the start of a line, like `#` or `-`, are the group `blocks`.

## Language

Quotes, sentence capitalization and dashes follow the language shown at the bottom right. Blank picks your system language on first start.

<img class="shot" src="/screenshots/language.png" alt="The language chooser at the bottom right of the window" />

To choose another one, press `Mod` `Alt` `L` or click the language. Then use `←` / `→` and `Enter`, or type a two-letter [ISO 639-1](https://en.wikipedia.org/wiki/List_of_ISO_639_language_codes) code such as `de`. `Esc` cancels.

Blank has its own rules for Czech (cs), Danish (da), Dutch (nl), English (en), Finnish (fi), French (fr), German (de), Italian (it), Norwegian (no), Polish (pl), Portuguese (pt), Russian (ru), Spanish (es) and Swedish (sv). Other languages use the English rules and are marked with `*`.

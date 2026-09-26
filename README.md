<p align="center">
  <a href="https://fpurchess.github.io/blank/">
    <img src="docs/public/logo.svg" alt="Blank" width="299">
  </a>
</p>
<p align="center">
  <em>A quiet place to write.</em>
</p>
<p align="center">
  <a href="https://github.com/FPurchess/blank/releases"><img src="https://img.shields.io/github/v/release/FPurchess/blank?label=version" alt="latest version"></a>
  <a href="https://github.com/FPurchess/blank/blob/main/LICENSE"><img src="https://img.shields.io/github/license/FPurchess/blank.svg" alt="License"></a>
  <a href="https://github.com/FPurchess/blank/releases"><img src="https://img.shields.io/github/downloads/FPurchess/blank/total.svg" alt="Downloads"></a>
  <a href="https://github.com/FPurchess/blank/actions/workflows/test.yml"><img src="https://github.com/FPurchess/blank/actions/workflows/test.yml/badge.svg?branch=main" alt="CI"></a>
</p>

<p align="center">
  <img src="docs/public/screenshots/demo.gif" alt="Someone starts writing in Blank: a heading, “A great start”, a few lines about the blank page, the word “uncertain” erased and replaced with “possible”, and a closing line in italics, before the page turns dark" width="800">
</p>

Every piece of writing begins the same way: an empty page, a blinking cursor, and the quiet question of what comes next.

Blank is made for that moment and for everything after it. There are no toolbars, no buttons, no panels asking for your attention. There is the page and the sentence you are writing. Your hands stay on the keyboard, and the formatting follows them: type `#` and a space, and a heading appears, press `Mod` `I` and your words lean into italics.

The small things take care of themselves. Quotes curl, dashes find their length, and a new sentence starts with a capital letter in the language you write in. When you are ready to proofread, spell check underlines what it doesn't know and offers what you meant. Close the window mid-thought and Blank keeps your words for the next time you open it.

Underneath, it's plain markdown, so your writing stays yours, readable by any editor for as long as you keep it. And when a piece is finished, Blank sets it as a PDF that looks as considered as the words in it.

## Download

- **macOS:** [Apple Silicon](https://github.com/FPurchess/blank/releases/download/v2.0.0/blank_2.0.0_aarch64.dmg) · [Intel](https://github.com/FPurchess/blank/releases/download/v2.0.0/blank_2.0.0_x64.dmg)
- **Windows:** [Installer (.msi)](https://github.com/FPurchess/blank/releases/download/v2.0.0/blank_2.0.0_x64_en-US.msi) · [Setup (.exe)](https://github.com/FPurchess/blank/releases/download/v2.0.0/blank_2.0.0_x64-setup.exe)
- **Linux:** [.deb](https://github.com/FPurchess/blank/releases/download/v2.0.0/blank_2.0.0_amd64.deb) · [.rpm](https://github.com/FPurchess/blank/releases/download/v2.0.0/blank-2.0.0-1.x86_64.rpm) · [AppImage](https://github.com/FPurchess/blank/releases/download/v2.0.0/blank_2.0.0_amd64.AppImage)

**macOS** blocks Blank on first open because it isn't notarized by Apple. **Linux** needs glibc 2.35+ and WebKitGTK 4.1 (Ubuntu 22.04+, Debian 12+). See the [install guide](https://fpurchess.github.io/blank/guide/install) for both.

## Keyboard shortcuts

A handful of shortcuts is all it takes to begin. `Mod` is `Cmd` on macOS and `Ctrl` on Windows and Linux.

| Command                     | Shortcut                    |
| --------------------------- | --------------------------- |
| Save / Open / New file      | `Mod S` / `Mod O` / `Mod N` |
| Heading 1 – 6 / Paragraph   | `Mod 1` … `Mod 6` / `Mod 0` |
| Bullet list / Numbered list | `Mod 8` / `Mod 9`           |
| Bold / Italic / Code        | `Mod B` / `Mod I` / `Mod E` |
| Insert link                 | `Mod K`                     |
| Export as PDF / Word        | `Mod Alt P` / `Mod Alt W`   |

All shortcuts, and how to change them, are in the [documentation](https://fpurchess.github.io/blank/guide/shortcuts).

## Documentation

Everything else lives on **[fpurchess.github.io/blank](https://fpurchess.github.io/blank/)**: [writing in Blank](https://fpurchess.github.io/blank/guide/writing), [files and formats: PDF and Word](https://fpurchess.github.io/blank/guide/files), [autocorrect in 14 languages](https://fpurchess.github.io/blank/guide/autocorrect), [spell check](https://fpurchess.github.io/blank/guide/spelling), the [six themes](https://fpurchess.github.io/blank/guide/themes), [your own shortcuts and settings](https://fpurchess.github.io/blank/guide/configuration) and the [FAQ](https://fpurchess.github.io/blank/guide/faq).

## Contributing

Bug reports, ideas and pull requests are welcome. [Open an issue](https://github.com/FPurchess/blank/issues/new/choose), or read [CONTRIBUTING.md](CONTRIBUTING.md) to set up the project.

## License

Distributed under the [**GNU Affero General Public License v3.0 only**](LICENSE).

## Acknowledgments

Blank is built on [Tauri](https://tauri.app/), [ProseMirror](https://github.com/ProseMirror/) (thanks to [@marijnh](https://github.com/marijnh) and [@adrianheine](https://github.com/adrianheine)) and [Vite](https://github.com/vitejs/vite), and set in [IBM Plex Sans](https://github.com/IBM/plex).

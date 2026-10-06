<p align="center">
  <a href="https://blank-writer.xyz/">
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
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/public/screenshots/demo-dark.gif">
    <img src="docs/public/screenshots/demo.gif" alt="Someone starts writing in Blank: a heading, “A great start”, a few lines about the blank page, the word “uncertain” erased and replaced with “possible”, and a closing line in italics; then focus mode lets the bars fade while the last line is typed" width="800">
  </picture>
</p>

Blank is a desktop editor for documents such as letters, reports and longer texts. It saves plain markdown files and shows them on pages that match the PDF it exports.

- **Pages that match the PDF:** Blank lays out your text with its own layout engine, so every line and every page ends on the screen where it ends in the PDF. Headers, footers, page numbers, tables, images and a table of contents are part of the page. [Pages](https://blank-writer.xyz/guide/pages)
- **Formatting as you type:** markdown such as `#` or `**bold**` turns into formatting while you type. A toolbar holds the formats, and every command has a shortcut you can change. Autocorrect sets typographic quotes and dashes in 14 languages, and spell check covers about 80. [Writing in Blank](https://blank-writer.xyz/guide/writing)
- **PDF and Word:** export to PDF or to Word, and open Word documents as markdown. [Files and formats](https://blank-writer.xyz/guide/files)
- **Focus mode:** the tabs, the toolbar and the status bar fade while you type, and come back when you move the mouse.
- **Offline and open source:** no account, and nothing you write leaves your computer. Linux, macOS and Windows.

Blank keeps your open tabs, unsaved changes included, between sessions. That is not a backup: save what you want to keep.

## Download

- **macOS:** [Apple Silicon](https://github.com/FPurchess/blank/releases/download/v3.0.0/blank_3.0.0_aarch64.dmg) · [Intel](https://github.com/FPurchess/blank/releases/download/v3.0.0/blank_3.0.0_x64.dmg)
- **Windows:** [Installer (.msi)](https://github.com/FPurchess/blank/releases/download/v3.0.0/blank_3.0.0_x64_en-US.msi) · [Setup (.exe)](https://github.com/FPurchess/blank/releases/download/v3.0.0/blank_3.0.0_x64-setup.exe)
- **Linux:** [Snap Store](https://snapcraft.io/blank) (`sudo snap install blank`) · [.deb](https://github.com/FPurchess/blank/releases/download/v3.0.0/blank_3.0.0_amd64.deb) · [.rpm](https://github.com/FPurchess/blank/releases/download/v3.0.0/blank-3.0.0-1.x86_64.rpm) · [AppImage](https://github.com/FPurchess/blank/releases/download/v3.0.0/blank_3.0.0_amd64.AppImage)

**macOS** blocks Blank on first open because it isn't notarized by Apple. **Linux** needs glibc 2.35+ and WebKitGTK 4.1 (Ubuntu 22.04+, Debian 12+). See the [install guide](https://blank-writer.xyz/guide/install) for both.

## Documentation

Everything else lives on **[blank-writer.xyz](https://blank-writer.xyz/)**: [writing in Blank](https://blank-writer.xyz/guide/writing), [tables](https://blank-writer.xyz/guide/tables), [files and formats: PDF and Word](https://blank-writer.xyz/guide/files), [autocorrect in 14 languages](https://blank-writer.xyz/guide/autocorrect), [spell check](https://blank-writer.xyz/guide/spelling), the [six themes](https://blank-writer.xyz/guide/themes), [the settings and your own shortcuts](https://blank-writer.xyz/guide/settings) and the [FAQ](https://blank-writer.xyz/guide/faq).

## Contributing

Bug reports, ideas and pull requests are welcome. [Open an issue](https://github.com/FPurchess/blank/issues/new/choose), or read [CONTRIBUTING.md](CONTRIBUTING.md) to set up the project.

## License

Distributed under the [**GNU Affero General Public License v3.0 only**](LICENSE).

## Acknowledgments

Blank is built on [Tauri](https://tauri.app/), [ProseMirror](https://github.com/ProseMirror/) (thanks to [@marijnh](https://github.com/marijnh) and [@adrianheine](https://github.com/adrianheine)) and [Vite](https://github.com/vitejs/vite), and set in [IBM Plex Sans](https://github.com/IBM/plex).

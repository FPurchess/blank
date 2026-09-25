<!-- packages -->

[downloads-shield]: https://img.shields.io/github/downloads/FPurchess/blank/total
[macos-shield]: https://api.iconify.design/logos/macos.svg
[macos-pkg]: https://github.com/FPurchess/blank/releases/download/v1.2.0/blank_1.2.0_aarch64.dmg
[windows-shield]: https://api.iconify.design/logos/microsoft-windows.svg
[windows-pkg]: https://github.com/FPurchess/blank/releases/download/v1.2.0/blank_1.2.0_x64_en-US.msi
[linux-deb-shield]: https://api.iconify.design/logos/linux-tux.svg
[linux-deb-pkg]: https://github.com/FPurchess/blank/releases/download/v1.2.0/blank_1.2.0_amd64.deb

<p align="center">
  <a href="https://github.com/FPurchess/blank">
    <img src="images/logo.svg" alt="Blank Logo" width="299">
  </a>
</p>
<p align="center">
  A minimalist, opinionated markdown editor made for writing
</p>
<p align="center">
  <a href="https://github.com/FPurchess/blank/releases"><img src="https://badge.fury.io/gh/fpurchess%2Fblank.svg" alt="latest version"></a>
  <a href="https://github.com/FPurchess/blank/blob/master/LICENSE"><img src="https://img.shields.io/github/license/FPurchess/blank.svg" alt="License"></a>
  <a href="https://img.shields.io/github/downloads/FPurchess/blank/total"><img src="https://img.shields.io/github/downloads/FPurchess/blank/total.svg" alt="Downloads Total"></a>
  <a href="https://github.com/FPurchess/blank/actions/workflows/test.yml"><img src="https://github.com/FPurchess/blank/actions/workflows/test.yml/badge.svg?branch=main" alt="CI"></a>
</p>

<p align="center">
  <img src="images/screenshot.gif" alt="Blank Logo">
</p>

# Blank :thought_balloon:

> Next Generation Writing Experience

- :keyboard: purely keyboard-based
- :pear: minimalist WYSIWYG for distraction-free writing
- :page_with_curl: Export to PDF
- :waxing_crescent_moon: Themes: Light & Dark-Mode
- available for Linux, macOS and Windows

## Download & Installation

You can download the latest version of Blank here:

<table width="100%">
  <tr>
    <td align="center">
      <img src="https://api.iconify.design/logos/macos.svg" alt="macOS" height="100" width="120" /><br/>
      Download blank.dmg for<br/>
      <a href="https://github.com/FPurchess/blank/releases/download/v1.2.0/blank_1.2.0_aarch64.dmg">Apple Silicon</a> |
      <a href="https://github.com/FPurchess/blank/releases/download/v1.2.0/blank_1.2.0_x64.dmg">Intel</a>
    </td>
    <td align="center">
      <a href="https://github.com/FPurchess/blank/releases/download/v1.2.0/blank_1.2.0_x64_en-US.msi">
        Download blank.msi<br/>
        <img src="https://api.iconify.design/logos/microsoft-windows.svg" alt="Donwloads blank.msi"  height="100" width="120" /><br/>
      </a>
    </td>
    <td align="center">
      <a href="https://github.com/FPurchess/blank/releases/download/v1.2.0/blank_1.2.0_amd64.deb">
        Download blank.deb<br/>
        <img src="https://api.iconify.design/logos/linux-tux.svg" alt="Donwloads blank.deb" height="100" width="120" />
      </a>
    </td>
  </tr>
</table>

On Linux, Blank needs glibc 2.35 or newer and WebKitGTK 4.1 (e.g. Ubuntu 22.04+ or Debian 12+).

### macOS: "Blank cannot be opened because the developer cannot be verified"

Blank is not notarized by Apple, so macOS blocks it the first time you open it. To allow it:

- **macOS 15 (Sequoia) or newer:** try to open Blank once, then go to System Settings → Privacy & Security and click "Open Anyway".
- **macOS 14 or older:** right-click Blank.app in Applications, choose Open, then confirm with Open.
- **Terminal:** run `xattr -dr com.apple.quarantine /Applications/Blank.app`.

## Keyboard Bindings

In order to change the keyboard bindings copy your modified version of the [default configuration file (`blank.json`)](https://github.com/FPurchess/blank/blob/release/blank.json) of this repository into the app config dir (default: `~/.config/com.github.fpurchess.blank/blank.json`). Only the bindings you want to change need to be listed; all others keep their defaults.

`Mod` translates to `Ctrl` under Windows / Linux or `Cmd` on Mac.

| Command                      | Keyboard Binding            |
| ---------------------------- | --------------------------- |
| New File                     | Mod + N                     |
| Save File                    | Mod + S                     |
| Save as                      | Mod + Shift + S             |
| Open File                    | Mod + O                     |
| Export as PDF                | Mod + Alt + P               |
| Cycle through themes         | Mod + Alt + T               |
| Undo                         | Mod + Z                     |
| Redo                         | Mod + Shift + Z             |
| Insert line break            | Mod + Enter / Shift + Enter |
| Paragraph                    | Mod + 0                     |
| Heading Level 1              | Mod + 1                     |
| Heading Level 2              | Mod + 2                     |
| Heading Level 3              | Mod + 3                     |
| Heading Level 4              | Mod + 4                     |
| Heading Level 5              | Mod + 5                     |
| Heading Level 6              | Mod + 6                     |
| Bullet List                  | Mod + 8                     |
| Numbered List                | Mod + 9                     |
| Increase indent of list item | Tab                         |
| Decrease indent of list item | Shift + Tab                 |
| Insert Horizontal Line       | Mod + H                     |
| Blockquote                   | Mod + G                     |
| Toggle code                  | Mod + E                     |
| Toggle bold                  | Mod + B                     |
| Toggle italic                | Mod + I                     |

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag "enhancement".
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development

Run `make` to list the common development and release tasks, e.g. `make dev` to run the app and `make check` to lint and test your changes. The targets wrap the scripts in `package.json`, so `bun run <script>` works just as well, e.g. on Windows without `make`.

### End-to-end tests

The end-to-end tests in [`e2e/`](e2e) drive the real app using [`tauri-driver`](https://tauri.app/develop/tests/webdriver/) and [WebdriverIO](https://webdriver.io/). They are supported on Linux only.

1. Install the prerequisites: `sudo apt install webkit2gtk-driver xvfb` and `cargo install tauri-driver --locked`
2. Install the test dependencies: `cd e2e && bun install`
3. Build the app and run the tests: `bun run test:e2e` (use `xvfb-run -a bun run test:e2e` to run them headless)

Set `E2E_SKIP_BUILD=1` to reuse an existing debug build. Each spec file runs the app with a fresh, temporary profile, so your own documents and settings are left untouched.

### Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)


## License

Distributed under the [**MIT License**](LICENSE).

[![FOSSA Status](https://app.fossa.io/api/projects/git%2Bgithub.com%2FFPurchess%2Fblank.svg?type=large)](https://app.fossa.io/projects/git%2Bgithub.com%2FFPurchess%2Fblank?ref=badge_large)

## Acknowledgments

This project would not exist without the hard work of others, first and foremost the maintainers and contributors of the below mentioned projects:

- [Tauri](https://tauri.app/)
- [ProseMirror](https://github.com/ProseMirror/) - thanks to [@marijnh](https://github.com/marijnh) and [@adrianheine](https://github.com/adrianheine)
- [Vite](https://github.com/vitejs/vite)

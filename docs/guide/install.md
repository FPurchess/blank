# Install

<DownloadButtons />

## macOS

Blank is not notarized by Apple, so macOS blocks it the first time you open it. To allow it:

- **macOS 15 (Sequoia) or newer:** try to open Blank once, then go to **System Settings → Privacy & Security** and click **Open Anyway**.
- **macOS 14 or older:** right-click `blank.app` in Applications, choose **Open**, then confirm with **Open**.
- **Terminal:** run `xattr -dr com.apple.quarantine /Applications/blank.app`.

::: details macOS says "blank is damaged and can't be opened"
Blank v1.2.0 and older is not fully signed, so macOS does not offer **Open Anyway** for these versions. Only the Terminal command above works.
:::

## Windows

Download the `.msi` installer, or the `.exe` if you prefer a setup wizard. Both install the same app.

## Linux

Blank needs glibc 2.35 or newer and WebKitGTK 4.1, e.g. Ubuntu 22.04+ or Debian 12+.

- **Debian, Ubuntu:** `sudo apt install ./blank_*_amd64.deb`
- **Fedora:** `sudo dnf install ./blank-*.x86_64.rpm`
- **openSUSE:** `sudo zypper install ./blank-*.x86_64.rpm`
- **Any distribution:** make the AppImage executable with `chmod +x blank_*.AppImage` and run it. AppImages need FUSE 2, which newer Ubuntu releases don't install by default: `sudo apt install libfuse2t64` (Ubuntu 24.04+) or `libfuse2` (older).

The `.deb` and `.rpm` put Blank in your app menu and in **Open With** for markdown files. Right-click any `.md` file and choose **Open With → Blank**, or set it as the default app for markdown there and open your notes with a double-click.

## Open a file from the terminal

Pass a path to open a markdown file directly:

::: code-group

```sh [Linux]
blank ~/Documents/notes.md
```

```sh [macOS]
/Applications/blank.app/Contents/MacOS/blank ~/Documents/notes.md
```

:::

With a path, `Mod` `S` saves to that file right away.

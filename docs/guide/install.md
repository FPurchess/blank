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

The easiest way is the [Snap Store](https://snapcraft.io/blank-editor), which keeps Blank up to date by itself and works on Ubuntu and most other distributions:

```sh
sudo snap install blank-editor
```

::: details How the Snap differs
Snaps run in a sandbox that only sees part of your computer:

- `Mod` `O`, `Mod` `Shift` `S` and the exports reach every file you pick.
- From the terminal, `blank-editor notes.md` opens files in your home folder, except in hidden folders like `~/.notes`. For USB drives and other disks, run `sudo snap connect blank-editor:removable-media` once.
- Its settings and saved document are separate from a `.deb`, `.rpm` or AppImage install. The config file is `~/snap/blank-editor/current/.config/com.github.fpurchess.blank/blank.json`.
  :::

The packages below need glibc 2.35 or newer and WebKitGTK 4.1, e.g. Ubuntu 22.04+ or Debian 12+.

- **Debian, Ubuntu:** `sudo apt install ./blank_*_amd64.deb`
- **Fedora:** `sudo dnf install ./blank-*.x86_64.rpm`
- **openSUSE:** `sudo zypper install ./blank-*.x86_64.rpm`
- **Any distribution:** make the AppImage executable with `chmod +x blank_*.AppImage` and run it. AppImages need FUSE 2, which newer Ubuntu releases don't install by default: `sudo apt install libfuse2t64` (Ubuntu 24.04+) or `libfuse2` (older).

The `.deb` and `.rpm` put Blank in your app menu and in **Open With** for markdown and Word files. Right-click any `.md` file and choose **Open With → Blank**, or set it as the default app for markdown there and open your notes with a double-click. A `.docx` opens as a new markdown document and the Word file stays as it is, see [Open Word documents](./writing#open-word-documents).

## Open a file from the terminal

Pass a path to open a markdown file directly:

::: code-group

```sh [Linux]
blank ~/Documents/notes.md
```

```sh [Snap]
blank-editor ~/Documents/notes.md
```

```sh [macOS]
/Applications/blank.app/Contents/MacOS/blank ~/Documents/notes.md
```

:::

With a path, `Mod` `S` saves to that file right away.

# Contributing to Blank

Thanks for helping! Bug reports and ideas are best started as an [issue](https://github.com/FPurchess/blank/issues/new/choose). For code, [fork the repository](https://github.com/FPurchess/blank/fork), create a branch and open a pull request against `main`. Commit messages are a single line of the form `<type>: <summary>`, e.g. `fix: …`, `feat: …` or `docs: …`.

## Setup

Blank is a [Tauri 2](https://tauri.app/) app with a TypeScript + [ProseMirror](https://prosemirror.net/) frontend in `src/`. You need [bun](https://bun.sh/), [Rust](https://www.rust-lang.org/tools/install) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) of your system.

The PDF helper, which draws the pages of PDF tabs, is built from [MuPDF](https://mupdf.com/), a git submodule, so clone with `git clone --recurse-submodules`, or run `git submodule update --init --recursive` in a clone you already have. Building it also needs libclang: on Debian and Ubuntu `sudo apt install libclang-dev`, on macOS the Xcode command line tools, on Windows [LLVM](https://releases.llvm.org/) (`winget install LLVM.LLVM`) and MSBuild, which comes with the Visual Studio Build Tools of the Tauri prerequisites. MuPDF brings its own libraries, so nothing else. The first build compiles MuPDF, which takes a few minutes.

```sh
bun install
make dev        # run the app with hot reload
make check      # lint, format check and unit tests, same as the pre-commit hook
```

Run `make` to list all tasks. They wrap the scripts in `package.json`, so `bun run <script>` works just as well, e.g. on Windows without `make`.

## End-to-end tests

The tests in [`e2e/`](https://github.com/FPurchess/blank/tree/main/e2e) drive the real app using [`tauri-driver`](https://tauri.app/develop/tests/webdriver/) and [WebdriverIO](https://webdriver.io/). They run on Linux only.

1. Install the prerequisites: `sudo apt install webkitgtk-webdriver xvfb` (`webkit2gtk-driver` instead of `webkitgtk-webdriver` before Ubuntu 26.04) and `cargo install tauri-driver --locked`
2. Build the app and run the tests: `make test-e2e`, or `make test-e2e-headless` without a display

Set `E2E_SKIP_BUILD=1` to reuse an existing debug build. Set `E2E_PORT` to run on another port than 4444, e.g. next to a second checkout. Each spec file runs the app with a fresh, temporary profile, so your own documents and settings are left untouched.

## Documentation

The website at [blank-writer.xyz](https://blank-writer.xyz/) lives in [`docs/`](https://github.com/FPurchess/blank/tree/main/docs) and is built with [VitePress](https://vitepress.dev/). Preview it with `make docs-dev`. If your change is visible to users, update the matching page in `docs/guide/`. The screenshots and GIFs come from the scripts in [`e2e/shots/`](https://github.com/FPurchess/blank/tree/main/e2e/shots): change those, not the images. CI captures them after the merge and proposes the changed ones in a pull request of their own. `make docs-shot NAME="<title of the shot>"` previews one locally (Linux, same prerequisites as the end-to-end tests).

## Recommended IDE setup

[VS Code](https://code.visualstudio.com/) with the [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) and [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) extensions.

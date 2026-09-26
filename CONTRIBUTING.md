# Contributing to Blank

Thanks for helping! Bug reports and ideas are best started as an [issue](https://github.com/FPurchess/blank/issues/new/choose). For code, fork the repository, create a branch and open a pull request against `main`.

## Setup

Blank is a [Tauri 2](https://tauri.app/) app with a TypeScript + [ProseMirror](https://prosemirror.net/) frontend in `src/`. You need [bun](https://bun.sh/), [Rust](https://www.rust-lang.org/tools/install) and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) of your system.

```sh
bun install
make dev        # run the app with hot reload
make check      # lint, format check and unit tests, same as the pre-commit hook
```

Run `make` to list all tasks. They wrap the scripts in `package.json`, so `bun run <script>` works just as well, e.g. on Windows without `make`.

## End-to-end tests

The tests in [`e2e/`](e2e) drive the real app using [`tauri-driver`](https://tauri.app/develop/tests/webdriver/) and [WebdriverIO](https://webdriver.io/). They run on Linux only.

1. Install the prerequisites: `sudo apt install webkit2gtk-driver xvfb` and `cargo install tauri-driver --locked`
2. Build the app and run the tests: `make test-e2e`, or `make test-e2e-headless` without a display

Set `E2E_SKIP_BUILD=1` to reuse an existing debug build. Each spec file runs the app with a fresh, temporary profile, so your own documents and settings are left untouched.

## Documentation

The website at [fpurchess.github.io/blank](https://fpurchess.github.io/blank/) lives in [`docs/`](docs) and is built with [VitePress](https://vitepress.dev/). Preview it with `make docs-dev`. If your change is visible to users, update the matching page in `docs/guide/`. After UI changes, regenerate the screenshots with `make docs-screenshots` (Linux, same prerequisites as the end-to-end tests).

## Recommended IDE setup

[VS Code](https://code.visualstudio.com/) with the [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) and [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer) extensions.

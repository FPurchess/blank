use std::env::{self, current_dir};
use std::error::Error;
use std::ffi::OsStr;
use std::fs::remove_dir_all;
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use std::process::exit;
use std::{fs, result};

mod docs;
use docs::DocsCallbacks;

mod make;
use make::Make;

mod msbuild;
use msbuild::Msbuild;

pub type Result<T> = result::Result<T, Box<dyn Error>>;

fn main() {
    if let Err(e) = run() {
        eprintln!("\n{e}");
        exit(1);
    }
}

fn run() -> Result<()> {
    if fs::read_dir("mupdf").map_or(true, |d| d.count() == 0) {
        Err(
            "The `mupdf` directory is empty, did you forget to pull the submodules?\n\
            Try `git submodule update --init --recursive`",
        )?
    }

    let target = Target::from_cargo().map_err(|e| {
        format!(
            "Unable to detect target: {e}\n\
            Cargo is required to build mupdf"
        )
    })?;

    let src_dir = current_dir().unwrap().join("mupdf");
    let out_dir =
        PathBuf::from(env::var_os("OUT_DIR").ok_or("Missing OUT_DIR environment variable")?);

    let sysroot = find_clang_sysroot(&target)?;

    let docs = env::var_os("DOCS_RS").is_some();
    if !docs {
        let build_dir = out_dir.join("build");
        let build_dir = build_dir.to_str().ok_or_else(|| {
            format!("Build dir path is required to be valid UTF-8, got {build_dir:?}")
        })?;

        if let Err(e) = remove_dir_all(build_dir) {
            if e.kind() != ErrorKind::NotFound {
                println!("cargo:warning=Unable to clear {build_dir:?}. This may lead to flaky builds that might not incorporate configurations changes: {e}");
            }
        }

        copy_recursive(&src_dir, build_dir.as_ref(), &[".git".as_ref()])?;
        patch_mupdf_sources(build_dir.as_ref())?;

        Build::new(&target).run(&target, build_dir)?;
        build_wrapper().map_err(|e| format!("Unable to compile mupdf wrapper:\n  {e}"))?;
    }

    generate_bindings(&target, &out_dir.join("bindings.rs"), sysroot)
        .map_err(|e| format!("Unable to generate mupdf bindings using bindgen:\n  {e}"))?;

    Ok(())
}

fn copy_recursive(src: &Path, dst: &Path, ignore: &[&OsStr]) -> Result<()> {
    if let Err(e) = fs::create_dir(dst) {
        if e.kind() != ErrorKind::AlreadyExists {
            Err(format!("Unable to create {dst:?}: {e}"))?;
        }
    }

    for entry in fs::read_dir(src)? {
        let entry = entry?;
        if ignore.contains(&&*entry.file_name()) {
            continue;
        }

        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());

        let file_type = entry.file_type()?;

        #[cfg(any(unix, windows))]
        if file_type.is_symlink() {
            let link = fs::read_link(&src_path)
                .map_err(|e| format!("Couldn't read symlink {src_path:?}: {e}"))?;

            #[cfg(unix)]
            let err = std::os::unix::fs::symlink(&link, &dst_path);
            #[cfg(windows)]
            let err = if file_type.is_dir() {
                std::os::windows::fs::symlink_dir(&link, &dst_path)
            } else {
                std::os::windows::fs::symlink_file(&link, &dst_path)
            };

            match err {
                Ok(_) => continue,
                Err(e) => println!(
                    "cargo:warning=Couldn't create symlink {dst_path:?} pointing to {link:?}. This might increase the size of your target folder: {e}"
                ),
            }
        }

        if file_type.is_file() || fs::metadata(&src_path)?.is_file() {
            fs::copy(&src_path, &dst_path)
                .map_err(|e| format!("Couldn't copy {src_path:?} to {dst_path:?}: {e}"))?;
        } else {
            copy_recursive(&src_path, &dst_path, ignore)?;
        }
    }
    Ok(())
}

fn patch_mupdf_sources(build_dir: &Path) -> Result<()> {
    // MuPDF's special math/music/symbol/emoji fallbacks only consult compiled-in
    // Noto resources. When those resources are omitted to keep mupdf-sys small,
    // give the safe crate's runtime bundled-font/system-font hook a chance to
    // provide the same special fallback fonts by name.
    let path = build_dir.join("source/fitz/font.c");
    let mut source =
        fs::read_to_string(&path).map_err(|e| format!("Unable to read {}: {e}", path.display()))?;
    source = source.replace("\r\n", "\n");

    let patches = [
        (
            "Noto Sans Math",
            "\t\tif (data)\n\t\t\tctx->font->math = fz_new_font_from_memory(ctx, NULL, data, size, 0, 0);\n",
            "\t\tif (data)\n\t\t\tctx->font->math = fz_new_font_from_memory(ctx, NULL, data, size, 0, 0);\n\t\telse\n\t\t\tctx->font->math = fz_load_system_font(ctx, \"Noto Sans Math\", 0, 0, 0);\n",
        ),
        (
            "Noto Music",
            "\t\tif (data)\n\t\t\tctx->font->music = fz_new_font_from_memory(ctx, NULL, data, size, 0, 0);\n",
            "\t\tif (data)\n\t\t\tctx->font->music = fz_new_font_from_memory(ctx, NULL, data, size, 0, 0);\n\t\telse\n\t\t\tctx->font->music = fz_load_system_font(ctx, \"Noto Music\", 0, 0, 0);\n",
        ),
        (
            "Noto Sans Symbols",
            "\t\tif (data)\n\t\t\tctx->font->symbol1 = fz_new_font_from_memory(ctx, NULL, data, size, 0, 0);\n",
            "\t\tif (data)\n\t\t\tctx->font->symbol1 = fz_new_font_from_memory(ctx, NULL, data, size, 0, 0);\n\t\telse\n\t\t\tctx->font->symbol1 = fz_load_system_font(ctx, \"Noto Sans Symbols\", 0, 0, 0);\n",
        ),
        (
            "Noto Sans Symbols 2",
            "\t\tif (data)\n\t\t\tctx->font->symbol2 = fz_new_font_from_memory(ctx, NULL, data, size, 0, 0);\n",
            "\t\tif (data)\n\t\t\tctx->font->symbol2 = fz_new_font_from_memory(ctx, NULL, data, size, 0, 0);\n\t\telse\n\t\t\tctx->font->symbol2 = fz_load_system_font(ctx, \"Noto Sans Symbols 2\", 0, 0, 0);\n",
        ),
        (
            "Noto Emoji",
            "\t\tif (data)\n\t\t\tctx->font->emoji = fz_new_font_from_memory(ctx, NULL, data, size, 0, 0);\n",
            "\t\tif (data)\n\t\t\tctx->font->emoji = fz_new_font_from_memory(ctx, NULL, data, size, 0, 0);\n\t\telse\n\t\t\tctx->font->emoji = fz_load_system_font(ctx, \"Noto Emoji\", 0, 0, 0);\n",
        ),
    ];

    for (font_name, old, new) in patches {
        if source.contains(new) {
            continue;
        }
        if !source.contains(old) {
            println!(
                "cargo:warning=Unable to patch {} special fallback in {}; expected MuPDF font fallback snippet was not found",
                font_name,
                path.display()
            );
            continue;
        }
        source = source.replacen(old, new, 1);
    }

    fs::write(&path, source).map_err(|e| format!("Unable to write {}: {e}", path.display()))?;

    // fz_filter_store (used by pdf_empty_store when a document is dropped)
    // releases the values of removed items by decrementing their refcount
    // directly instead of going through fz_drop_key_storable. For key storable
    // values such as fz_image the store therefore never notices that the only
    // remaining references are store key references, so cached decoded pixmaps
    // keyed on those images survive document destruction and accumulate
    // indefinitely in long-running processes
    // (https://github.com/messense/mupdf-rs/issues/90).
    // Flag (or run) a reap pass after filtering so such entries are collected.
    let path = build_dir.join("source/fitz/store.c");
    let mut source =
        fs::read_to_string(&path).map_err(|e| format!("Unable to read {}: {e}", path.display()))?;
    source = source.replace("\r\n", "\n");

    let old = "\tfz_unlock(ctx, FZ_LOCK_ALLOC);\n\n\t/* Now drop the remove chain */\n\tfor (item = remove; item != NULL; item = remove)\n\t{\n\t\tremove = item->next;\n\n\t\t/* Drop a reference to the value (freeing if required) */\n\t\tif (item->prev) /* See above for our abuse of prev here */\n";
    let new = "\t/* The value refs dropped above bypass fz_drop_key_storable, so key\n\t * storables (e.g. fz_image) whose remaining references are all store\n\t * key references would never be reaped. Flag or run a reap pass so\n\t * the store entries keyed on them get collected. */\n\tif (remove != NULL && store->defer_reap_count > 0)\n\t{\n\t\tstore->needs_reaping = 1;\n\t\tfz_unlock(ctx, FZ_LOCK_ALLOC);\n\t}\n\telse if (remove != NULL)\n\t\tdo_reap(ctx); /* Drops FZ_LOCK_ALLOC */\n\telse\n\t\tfz_unlock(ctx, FZ_LOCK_ALLOC);\n\n\t/* Now drop the remove chain */\n\tfor (item = remove; item != NULL; item = remove)\n\t{\n\t\tremove = item->next;\n\n\t\t/* Drop a reference to the value (freeing if required) */\n\t\tif (item->prev) /* See above for our abuse of prev here */\n";
    if !source.contains(new) {
        if source.contains(old) {
            source = source.replacen(old, new, 1);
            fs::write(&path, source)
                .map_err(|e| format!("Unable to write {}: {e}", path.display()))?;
        } else {
            println!(
                "cargo:warning=Unable to patch fz_filter_store reaping in {}; expected MuPDF store snippet was not found",
                path.display()
            );
        }
    }

    Ok(())
}

fn build_wrapper() -> Result<()> {
    let mut build = cc::Build::new();
    for entry in fs::read_dir("wrapper")? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "c") {
            build.file(&path);
        }
    }
    build.include("mupdf/include").include("wrapper");
    build.try_compile("mupdf-wrapper")?;
    Ok(())
}

fn find_clang_sysroot(target: &Target) -> Result<Option<String>> {
    if target.os == "emscripten" {
        let sdk = env::var("EMSDK").map_err(|e| match e {
            env::VarError::NotPresent => {
                "Using emscripten requires the EMSDK environment variable to be set".to_owned()
            }
            _ => {
                format!("Invalid EMSDK environment variable: {e}")
            }
        })?;

        let mut sysroot = PathBuf::from(sdk);
        sysroot.push("upstream/emscripten/cache/sysroot");
        let sysroot = sysroot.into_os_string().into_string().unwrap();
        return Ok(Some(sysroot));
    }

    Ok(None)
}

fn generate_bindings(target: &Target, path: &Path, sysroot: Option<String>) -> Result<()> {
    let mut builder = bindgen::builder();

    if let Some(sysroot) = sysroot {
        builder = builder.clang_arg("--sysroot").clang_arg(sysroot);
    }

    if target.os == "emscripten" {
        builder = builder.clang_arg("-fvisibility=default");
    }

    builder = builder
        .clang_arg("-Imupdf/include")
        .clang_arg("-Iwrapper")
        .header("wrapper/wrapper.h");

    for entry in fs::read_dir("wrapper")? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().is_some_and(|ext| ext == "c") {
            builder = builder.header(path.to_str().unwrap());
        }
    }

    builder = builder
        .allowlist_recursively(false)
        .allowlist_type("wchar_t")
        .allowlist_type("FILE")
        .opaque_type("FILE")
        .allowlist_item("max_align_t")
        .opaque_type("max_align_t");

    builder = builder
        .allowlist_item("fz_.*")
        .allowlist_item("FZ_.*")
        .allowlist_item("pdf_.*")
        .allowlist_item("PDF_.*")
        .allowlist_type("cmap_splay")
        .allowlist_item("ucdn_.*")
        .allowlist_item("UCDN_.*")
        .allowlist_item("Memento_.*")
        .allowlist_item("mupdf_.*");

    // remove va_list functions as for all of these versions using ... exist
    builder = builder
        .blocklist_function("Memento_vasprintf") // Memento_asprintf
        .blocklist_function("fz_vthrow") // fz_throw
        .blocklist_function("fz_vwarn") // fz_warn
        .blocklist_function("fz_vlog_error_printf") // fz_log_error_printf
        .blocklist_function("fz_append_vprintf") // fz_append_printf
        .blocklist_function("fz_write_vprintf") // fz_write_printf
        .blocklist_function("fz_vsnprintf") // fz_snprintf
        .blocklist_function("fz_format_string"); // mupdf_format_string

    // build config
    builder = builder
        .blocklist_var("FZ_VERSION.*")
        .blocklist_var("FZ_ENABLE_.*")
        .blocklist_var("FZ_PLOTTERS_.*");

    // internal implementation details, considered private
    builder = builder
        .blocklist_item("fz_jmp_buf")
        .blocklist_function("fz_var_imp")
        .blocklist_function("fz_push_try")
        .blocklist_function("fz_do_.*")
        .blocklist_var("FZ_JMPBUF_ALIGN")
        .blocklist_type("fz_error_stack_slot")
        .blocklist_type("fz_error_context")
        .blocklist_type("fz_warn_context")
        .blocklist_type("fz_aa_context")
        .blocklist_type("fz_activity_.*")
        .blocklist_function("fz_register_activity_logger")
        .opaque_type("fz_context")
        .blocklist_type("fz_new_context_imp")
        .blocklist_type("fz_lock")
        .blocklist_type("fz_unlock");

    builder = builder
        .parse_callbacks(Box::new(bindgen::CargoCallbacks::new()))
        .parse_callbacks(Box::new(DocsCallbacks::default()));

    #[cfg(feature = "zerocopy")]
    {
        builder = builder.parse_callbacks(Box::new(ZerocopyDeriveCallbacks));
    }

    builder
        .prepend_enum_name(false)
        .use_core()
        .generate()?
        .write_to_file(path)?;

    Ok(())
}

// see https://github.com/ArtifexSoftware/mupdf/blob/master/source/fitz/noto.c
const FONTS: [&str; 6] = [
    "TOFU",
    "TOFU_CJK",
    "TOFU_NOTO",
    "TOFU_SYMBOL",
    "TOFU_EMOJI",
    "TOFU_SIL",
];

const BASE14_FONT_PRUNE_FLAG: &str = "TOFU_BASE14";

enum Build {
    Make(Make),
    Msbuild(Msbuild),
}

impl Build {
    fn new(target: &Target) -> Self {
        if target.env == "msvc" {
            Self::Msbuild(Msbuild::default())
        } else {
            Self::Make(Make::default())
        }
    }

    fn define(&mut self, var: &str, val: &str) {
        match self {
            Self::Make(m) => m.define(var, val),
            Self::Msbuild(m) => m.define(var, val),
        };
    }

    fn define_bool(&mut self, var: &str, val: bool) {
        self.define(var, if val { "1" } else { "0" });
    }

    fn make_bool(&mut self, var: &str, val: bool) {
        if let Self::Make(m) = self {
            m.make_bool(var, val);
        }
    }

    fn fz_enable(&mut self, name: &str, enable: bool) {
        self.define_bool(&format!("FZ_ENABLE_{name}"), enable);
    }

    fn run(mut self, target: &Target, build_dir: &str) -> Result<()> {
        let xps = cfg!(feature = "xps");
        let svg = cfg!(feature = "svg");
        let cbz = cfg!(feature = "cbz");
        let img = cfg!(feature = "img");
        let html = cfg!(feature = "html");
        let epub = cfg!(feature = "epub");
        let js = cfg!(feature = "js");
        let brotli = cfg!(feature = "brotli");
        let docx_output = cfg!(feature = "docx-output");
        let tesseract = cfg!(feature = "tesseract");
        let zxingcpp = cfg!(feature = "zxingcpp");
        let libarchive = cfg!(feature = "libarchive");

        // gates #ifdef
        self.fz_enable("XPS", xps);
        self.fz_enable("SVG", svg);
        self.fz_enable("CBZ", cbz);
        self.fz_enable("IMG", img);
        self.fz_enable("HTML", html);
        self.fz_enable("EPUB", epub);
        self.fz_enable("JS", js);
        self.fz_enable("BROTLI", brotli);
        self.fz_enable("DOCX_OUTPUT", docx_output);

        // gates which features get built
        self.make_bool("xps", xps);
        self.make_bool("svg", svg);
        self.make_bool("mujs", js);
        self.make_bool("html", html || epub);
        self.make_bool("brotli", brotli);
        self.make_bool("extract", docx_output);
        self.make_bool("tesseract", tesseract);
        self.make_bool("barcode", zxingcpp);
        self.make_bool("archive", libarchive);

        if cfg!(feature = "all-fonts") {
            println!(
                "cargo:warning=mupdf-sys/all-fonts is deprecated and no longer compiles large fonts into mupdf-sys; use mupdf's runtime bundled font features instead"
            );
        }

        for font in &FONTS {
            // TOFU flags skip fonts when set to 1. Keep non-URW fonts out of
            // mupdf-sys so the crate remains below crates.io's package limit.
            self.define_bool(font, true);
        }

        if !cfg!(feature = "base14-fonts") {
            // Skip the URW base14 fonts too (warning: makes plain PDFs render
            // without text unless replacement fonts are provided at runtime,
            // e.g. via mupdf's FontLoader hooks).
            self.define_bool(BASE14_FONT_PRUNE_FLAG, true);
        }

        match self {
            Self::Make(m) => m.build(target, build_dir),
            Self::Msbuild(m) => m.build(target, build_dir),
        }
    }
}

struct Target {
    debug: bool,
    opt_level: String,

    arch: String,
    os: String,
    env: String,

    features: Vec<String>,
}

impl Target {
    fn from_cargo() -> Result<Self> {
        Ok(Self {
            debug: env::var_os("DEBUG").is_some_and(|s| s != "0" && s != "false"),
            opt_level: env::var("OPT_LEVEL")?,

            arch: env::var("CARGO_CFG_TARGET_ARCH")?,
            os: env::var("CARGO_CFG_TARGET_OS")?,
            env: env::var("CARGO_CFG_TARGET_ENV")?,

            features: env::var("CARGO_CFG_TARGET_FEATURE")
                .unwrap_or_default()
                .split(',')
                .filter(|feature| !feature.is_empty())
                .map(str::to_owned)
                .collect(),
        })
    }

    fn small_profile(&self) -> bool {
        !self.debug && matches!(&*self.opt_level, "s" | "z")
    }

    fn debug_profile(&self) -> bool {
        self.debug && !matches!(&*self.opt_level, "2" | "3")
    }
}

#[cfg(feature = "zerocopy")]
#[derive(Debug)]
struct ZerocopyDeriveCallbacks;

#[cfg(feature = "zerocopy")]
impl bindgen::callbacks::ParseCallbacks for ZerocopyDeriveCallbacks {
    fn add_derives(&self, info: &bindgen::callbacks::DeriveInfo<'_>) -> Vec<String> {
        const TYPES: [&str; 5] = ["fz_irect", "fz_matrix", "fz_point", "fz_quad", "fz_rect"];

        if TYPES.contains(&info.name) {
            vec![
                "zerocopy::FromBytes".to_owned(),
                "zerocopy::IntoBytes".to_owned(),
                "zerocopy::Immutable".to_owned(),
            ]
        } else {
            vec![]
        }
    }
}

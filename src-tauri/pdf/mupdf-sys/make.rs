use std::{
    env,
    ffi::{OsStr, OsString},
    process::Command,
    thread::available_parallelism,
};

use crate::{Result, Target};

#[derive(Default)]
pub struct Make {
    build: Box<cc::Build>,
    make_flags: Vec<OsString>,
}

#[derive(PartialEq)]
enum SystemLib {
    Always,
    Libs,
    Explicit,
}

impl Make {
    pub fn define(&mut self, var: &str, val: &str) {
        self.build.define(var, val);
    }

    fn make_var(&mut self, var: &str, val: impl AsRef<OsStr>) {
        let mut flag = OsString::from(var);
        flag.push("=");
        flag.push(val);
        self.make_flags.push(flag);
    }

    pub(crate) fn make_bool(&mut self, var: &str, val: bool) {
        self.make_var(var, if val { "yes" } else { "no" });
    }

    fn system_lib(
        &mut self,
        feature: &str,
        feature_reason: SystemLib,
        name: &str,
        pkg_config_names: &[&str],
    ) -> Result<()> {
        let all_enabled = feature_reason == SystemLib::Libs && cfg!(feature = "sys-lib");
        let feature_enabled = env::var_os(format!(
            "CARGO_FEATURE_SYS_LIB_{}",
            feature.to_ascii_uppercase()
        ))
        .is_some();
        let enabled = feature_reason == SystemLib::Always || all_enabled || feature_enabled;

        self.make_bool(&format!("USE_SYSTEM_{name}"), enabled);
        if !enabled {
            return Ok(());
        }

        for pkg_config_name in pkg_config_names {
            let library = pkg_config::probe_library(pkg_config_name).map_err(|e| {
                let first_solution = "Install the package in your distribution. If you already have it installed you might be missing the headers included in a `*-dev` or `*-devel` package.";

                let solutions = if feature_reason == SystemLib::Always {
                    first_solution.to_owned()
                } else {
                    format!(
"You have two ways of solving this problem:
  1. {first_solution}
  2. Disable the `sys-lib-{feature}` {}. This might not be what you what though, as it will statically link {pkg_config_name}.",
                        if all_enabled { "and `sys-lib` features" } else { "feature" },
                    )
                };

                format!("Unable to locate the library `{pkg_config_name}`\n{e}\n{solutions}")
            })?;

            let mut cflags = OsString::new();
            for path in library.include_paths {
                if !cflags.is_empty() {
                    cflags.push(" ");
                }

                cflags.push("-I");
                cflags.push(path);
            }
            self.make_var(&format!("SYS_{name}_CFLAGS"), &cflags);
        }

        Ok(())
    }

    fn libs(&mut self) -> Result<()> {
        self.system_lib("freetype", SystemLib::Libs, "FREETYPE", &["freetype2"])?;
        self.system_lib("gumbo", SystemLib::Libs, "GUMBO", &["gumbo"])?;
        self.system_lib("harfbuzz", SystemLib::Libs, "HARFBUZZ", &["harfbuzz"])?;
        self.system_lib("jbig2dec", SystemLib::Libs, "JBIG2DEC", &["jbig2dec"])?;
        self.system_lib("jpegxr", SystemLib::Explicit, "JPEGXR", &["jpegxr"])?;
        self.system_lib("lcms2", SystemLib::Explicit, "LCMS2", &["lcms2"])?;
        self.system_lib("libjpeg", SystemLib::Libs, "LIBJPEG", &["libjpeg"])?;
        self.system_lib("openjpeg", SystemLib::Libs, "OPENJPEG", &["libopenjp2"])?;
        self.system_lib("zlib", SystemLib::Libs, "ZLIB", &["zlib"])?;

        self.make_bool("USE_TESSERACT", cfg!(feature = "tesseract"));
        #[cfg(feature = "tesseract")]
        {
            self.system_lib("tesseract", SystemLib::Libs, "LEPTONICA", &["lept"])?;
            self.system_lib("tesseract", SystemLib::Libs, "TESSERACT", &["tesseract"])?;
        }

        self.make_bool("USE_ZXINGCPP", cfg!(feature = "zxingcpp"));
        #[cfg(feature = "zxingcpp")]
        // zint is required as well, but it (or distro for that matter,
        // i checked debian, fedora and arch) don't distribute a pkg-config file
        self.system_lib("zxingcpp", SystemLib::Libs, "ZXINGCPP", &["zxing"])?;

        self.make_bool("USE_LIBARCHIVE", cfg!(feature = "libarchive"));
        #[cfg(feature = "libarchive")]
        self.system_lib(
            "libarchive",
            SystemLib::Always,
            "LIBARCHIVE",
            &["libarchive"],
        )?;

        self.system_lib(
            "brotli",
            SystemLib::Libs,
            "BROTLI",
            &["libbrotlidec", "libbrotlienc"],
        )?;

        Ok(())
    }

    fn cpu(
        &mut self,
        target: &Target,
        feature: &str,
        flag: &str,
        make_flag: &str,
        define: Option<&str>,
    ) {
        let contains = target.features.iter().any(|f| f == feature)
            && self.build.is_flag_supported(flag).unwrap_or(true);
        if contains {
            self.build.flag(flag);
            self.make_bool(make_flag, true);
        }

        if let Some(define) = define {
            self.define(define, if contains { "1" } else { "0" });
        }
    }

    fn cpus(&mut self, target: &Target) {
        // x86
        self.cpu(
            target,
            "sse4.1",
            "-msse4.1",
            "HAVE_SSE4_1",
            Some("ARCH_HAS_SSE"),
        );
        self.cpu(target, "avx", "-mavx", "HAVE_AVX", None);
        self.cpu(target, "avx2", "-mavx2", "HAVE_AVX2", None);
        self.cpu(target, "fma", "-mfma", "HAVE_FMA", None);

        // arm
        self.cpu(
            target,
            "neon",
            "-mfpu=neon",
            "HAVE_NEON",
            Some("ARCH_HAS_NEON"),
        );
    }

    pub fn build(mut self, target: &Target, build_dir: &str) -> Result<()> {
        #[cfg(windows)]
        let build_dir = &build_dir.replace('\\', "/");

        self.make_var(
            "build",
            if target.small_profile() {
                "small"
            } else if target.debug_profile() {
                "debug"
            } else {
                "release"
            },
        );

        self.make_var("OUT", build_dir);

        self.make_bool("HAVE_X11", false);
        self.make_bool("HAVE_GLUT", false);
        self.make_bool("HAVE_CURL", false);

        // let cc-rs handle compiler selection, not the Makefile.
        // fill to not be empty and therefore `uname` being used.
        self.make_var("OS", "not empty");

        self.make_bool("HAVE_OBJCOPY", target.os == "linux");

        self.make_bool("verbose", true);

        // harfbuzz sometimes requires this
        if target.os == "windows" {
            self.build.flag("-Wa,-mbig-obj");
        }

        self.libs()?;
        self.cpus(target);

        if let Ok(n) = available_parallelism() {
            self.make_flags.push(format!("-j{n}").into());
        }

        self.build.warnings(false);

        let compiler = self.build.get_compiler();
        self.make_var("CC", compiler.path());
        self.make_var("XCFLAGS", compiler.cflags_env());

        self.build.cpp(true);
        let compiler = self.build.get_compiler();
        self.make_var("CXX", compiler.path());
        self.make_var("XCXXFLAGS", compiler.cflags_env());

        let make = if cfg!(any(
            target_os = "freebsd",
            target_os = "openbsd",
            target_os = "netbsd"
        )) {
            "gmake"
        } else {
            "make"
        };

        let status = Command::new(make)
            .arg("libs")
            .args(&self.make_flags)
            .current_dir(build_dir)
            .status()
            .map_err(|e| format!("Failed to call {make}: {e}"))?;
        if !status.success() {
            Err(match status.code() {
                Some(code) => format!("{make} invocation failed with status {code}"),
                None => format!("{make} invocation failed"),
            })?;
        }

        #[cfg(feature = "tesseract")]
        if target.os == "macos" {
            println!("cargo:rustc-link-lib=c++");
        } else {
            println!("cargo:rustc-link-lib=stdc++");
        }

        println!("cargo:rustc-link-search=native={build_dir}");
        println!("cargo:rustc-link-lib=static=mupdf");
        println!("cargo:rustc-link-lib=static=mupdf-third");

        Ok(())
    }
}

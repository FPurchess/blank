//! Builds the shim over MuPDF (shim/blank_mupdf.c) against the headers of
//! the MuPDF that mupdf-sys builds from the submodule.

fn main() {
    println!("cargo:rerun-if-changed=shim");
    cc::Build::new()
        .file("shim/blank_mupdf.c")
        .include("shim")
        .include("../mupdf-sys/mupdf/include")
        .compile("blank-mupdf");
    // MuPDF 1.28's random.c calls CryptGenRandom, whose library mupdf-sys
    // 0.8.0's glue, written for MuPDF 1.27, doesn't link
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        println!("cargo:rustc-link-lib=advapi32");
    }
}

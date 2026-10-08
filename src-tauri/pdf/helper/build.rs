//! Builds the shim over MuPDF (shim/blank_mupdf.c) against the headers of
//! the MuPDF that mupdf-sys builds from the submodule.

fn main() {
    println!("cargo:rerun-if-changed=shim");
    cc::Build::new()
        .file("shim/blank_mupdf.c")
        .include("shim")
        .include("../mupdf-sys/mupdf/include")
        .compile("blank-mupdf");
}

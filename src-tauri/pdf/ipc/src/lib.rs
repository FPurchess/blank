//! What Blank and its PDF helper (`blank-pdf`) say to each other, and both
//! ends of it: the frames and the protocol, the engine traits the helper
//! implements and the loop it serves them with, and the app's client, which
//! starts the helper, limits it and starts it again after a crash. Neither
//! MuPDF nor Tauri is in here. See .claude/rules/pdf.md.

pub mod client;
pub mod engine;
pub mod frame;
pub mod limits;
pub mod protocol;
pub mod serve;

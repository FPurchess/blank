//! Frames: how the app and the helper send each other a request or an
//! answer over the helper's stdin and stdout. A frame is
//! `"BPF1" | header length (u32 LE) | body length (u64 LE) | header | body`,
//! the header JSON (protocol.rs), the body raw bytes: the PDF to open, the
//! pixels of a page.

use std::io::{self, ErrorKind, Read, Write};

/// the frame's magic; a breaking change of the protocol changes it too
pub const MAGIC: &[u8; 4] = b"BPF1";
/// the most a header may hold
pub const MAX_HEADER: usize = 1 << 20;
/// the most a body may hold: a PDF to open
pub const MAX_BODY: u64 = 512 << 20;

#[derive(Debug, PartialEq)]
pub struct Frame {
    pub header: Vec<u8>,
    pub body: Vec<u8>,
}

#[derive(Debug)]
pub enum FrameError {
    /// the other side closed the stream between two frames
    Eof,
    Io(io::Error),
    /// not a frame: the stream can't be read on from here
    Bad(&'static str),
}

impl From<io::Error> for FrameError {
    fn from(error: io::Error) -> Self {
        match error.kind() {
            ErrorKind::UnexpectedEof => FrameError::Bad("truncated"),
            _ => FrameError::Io(error),
        }
    }
}

/// writes one frame and flushes it; refuses one the other side would refuse
/// (`InvalidInput`, nothing written)
pub fn write_frame(output: &mut impl Write, header: &[u8], body: &[u8]) -> io::Result<()> {
    if header.len() > MAX_HEADER || body.len() as u64 > MAX_BODY {
        return Err(ErrorKind::InvalidInput.into());
    }
    let mut head = Vec::with_capacity(16 + header.len());
    head.extend(MAGIC);
    head.extend((header.len() as u32).to_le_bytes());
    head.extend((body.len() as u64).to_le_bytes());
    head.extend(header);
    output.write_all(&head)?;
    output.write_all(body)?;
    output.flush()
}

/// reads one frame whose body holds at most `max_body` bytes
pub fn read_frame(input: &mut impl Read, max_body: u64) -> Result<Frame, FrameError> {
    read_frame_by(input, |_| max_body)
}

/// reads one frame whose body holds at most what `max_body` says for its
/// header, which is read first: the most an answer may hold depends on
/// the request it answers
pub fn read_frame_by(
    input: &mut impl Read,
    max_body: impl FnOnce(&[u8]) -> u64,
) -> Result<Frame, FrameError> {
    let mut prefix = [0u8; 16];
    loop {
        match input.read(&mut prefix[..1]) {
            Ok(0) => return Err(FrameError::Eof),
            Ok(_) => break,
            Err(error) if error.kind() == ErrorKind::Interrupted => continue,
            Err(error) => return Err(error.into()),
        }
    }
    input.read_exact(&mut prefix[1..])?;
    if &prefix[..4] != MAGIC {
        return Err(FrameError::Bad("magic"));
    }
    let header_len = u32::from_le_bytes(prefix[4..8].try_into().unwrap()) as usize;
    let body_len = u64::from_le_bytes(prefix[8..16].try_into().unwrap());
    if header_len > MAX_HEADER {
        return Err(FrameError::Bad("header too long"));
    }
    if body_len > MAX_BODY {
        return Err(FrameError::Bad("body too long"));
    }
    let mut header = vec![0; header_len];
    input.read_exact(&mut header)?;
    if body_len > max_body(&header).min(MAX_BODY) {
        return Err(FrameError::Bad("body too long"));
    }
    let mut body = vec![0; body_len as usize];
    input.read_exact(&mut body)?;
    Ok(Frame { header, body })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn framed(header: &[u8], body: &[u8]) -> Vec<u8> {
        let mut bytes = vec![];
        write_frame(&mut bytes, header, body).unwrap();
        bytes
    }

    #[test]
    fn reads_what_it_wrote() {
        let mut bytes = framed(br#"{"id":1}"#, &[1, 2, 3]);
        bytes.extend(framed(b"{}", &[]));
        let mut input = bytes.as_slice();
        let first = read_frame(&mut input, MAX_BODY).unwrap();
        assert_eq!(first.header, br#"{"id":1}"#);
        assert_eq!(first.body, [1, 2, 3]);
        assert_eq!(read_frame(&mut input, MAX_BODY).unwrap().header, b"{}");
        assert!(matches!(
            read_frame(&mut input, MAX_BODY),
            Err(FrameError::Eof)
        ));
    }

    #[test]
    fn refuses_what_isnt_a_frame() {
        let bad = |bytes: Vec<u8>, max: u64| match read_frame(&mut bytes.as_slice(), max) {
            Err(FrameError::Bad(why)) => why,
            other => panic!("{other:?}"),
        };
        let mut wrong = framed(b"{}", &[]);
        wrong[0] = b'X';
        assert_eq!(bad(wrong, MAX_BODY), "magic");
        let mut long = framed(b"{}", &[]);
        long[4..8].copy_from_slice(&(MAX_HEADER as u32 + 1).to_le_bytes());
        assert_eq!(bad(long, MAX_BODY), "header too long");
        assert_eq!(bad(framed(b"{}", &[0; 9]), 8), "body too long");
        let mut cut = framed(b"{}", &[1, 2, 3]);
        cut.pop();
        assert_eq!(bad(cut, MAX_BODY), "truncated");
        assert_eq!(bad(b"BPF".to_vec(), MAX_BODY), "truncated");
        let mut huge = framed(b"{}", &[]);
        huge[8..16].copy_from_slice(&u64::MAX.to_le_bytes());
        assert_eq!(bad(huge, MAX_BODY), "body too long");
    }

    #[test]
    fn refuses_to_write_what_the_other_side_would_refuse() {
        let mut written = vec![];
        let error = write_frame(&mut written, &vec![b' '; MAX_HEADER + 1], &[]).unwrap_err();
        assert_eq!(error.kind(), ErrorKind::InvalidInput);
        assert!(written.is_empty());
    }
}

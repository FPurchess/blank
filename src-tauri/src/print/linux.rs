//! The print portal (org.freedesktop.portal.Print), which shows the
//! desktop's print dialog, also from the Snap: PreparePrint asks what to
//! print on, before Blank writes the PDF, and Print sends the PDF to the
//! printer chosen. It never names the printer.
//!
//! The calls go through zbus itself, and of the dialog's answer only what
//! Blank uses is read: the desktop's print settings hold many more values,
//! in forms of their own (ashpd's typed settings fail on some, e.g. GTK's
//! lower-case "pdf" output format, which failed printing as a whole). ashpd
//! only names Blank's window, which the dialog belongs to.

use std::collections::HashMap;
use std::sync::atomic::{AtomicU32, Ordering};

use ashpd::WindowIdentifier;
use futures_util::future::{self, Either};
use futures_util::StreamExt;
use raw_window_handle::{HasDisplayHandle, HasWindowHandle, RawWindowHandle};
use tauri::Manager;
use zbus::zvariant::{Fd, OwnedObjectPath, OwnedValue, Value};

use super::{ErrorKind, Meta, Preset, PrintError, PrintSetup, Sent, Size, TempPdf};

const PORTAL: &str = "org.freedesktop.portal.Desktop";
const PORTAL_PATH: &str = "/org/freedesktop/portal/desktop";
const PRINT: &str = "org.freedesktop.portal.Print";

/// points in a millimeter, the unit of GTK's page setup
const MM: f64 = 72.0 / 25.4;

/// the D-Bus errors that say nothing answers for the print portal
const MISSING: [&str; 3] = [
    "org.freedesktop.DBus.Error.ServiceUnknown",
    "org.freedesktop.DBus.Error.UnknownMethod",
    "org.freedesktop.DBus.Error.UnknownInterface",
];

/// whether `error` says nothing answers for the print portal
fn is_missing(error: &zbus::Error) -> bool {
    use zbus::fdo::Error::{ServiceUnknown, UnknownInterface, UnknownMethod};
    match error {
        zbus::Error::InterfaceNotFound => true,
        zbus::Error::MethodError(name, ..) => MISSING.contains(&name.as_str()),
        zbus::Error::FDO(error) => matches!(
            **error,
            ServiceUnknown(_) | UnknownMethod(_) | UnknownInterface(_)
        ),
        _ => false,
    }
}

/// why the portal didn't print: it isn't there, e.g. on a desktop without
/// xdg-desktop-portal-gtk or -kde, or it failed
fn portal_error(error: zbus::Error) -> PrintError {
    let kind = if is_missing(&error) {
        ErrorKind::NoService
    } else {
        ErrorKind::Failed
    };
    PrintError::new(kind, error)
}

/// the session bus, the print portal's way in; without one there is no
/// print service to ask
async fn session_bus() -> Result<zbus::Connection, PrintError> {
    zbus::Connection::session()
        .await
        .map_err(|error| PrintError::new(ErrorKind::NoService, error))
}

/// how a portal's dialog ended
enum Answer {
    Done(HashMap<String, OwnedValue>),
    Cancelled,
    Failed,
}

/// calls `method` of the print portal with `body`, whose options hold
/// `token` as their `handle_token`, and waits for its dialog's answer, which
/// comes as the Response of the request object the token names
async fn ask<B>(
    connection: &zbus::Connection,
    method: &str,
    token: &str,
    body: &B,
) -> Result<Answer, PrintError>
where
    B: serde::Serialize + zbus::zvariant::DynamicType,
{
    let unique = connection
        .unique_name()
        .ok_or_else(|| PrintError::failed("the session bus gave no name"))?;
    let sender = unique.trim_start_matches(':').replace('.', "_");
    let path = format!("{PORTAL_PATH}/request/{sender}/{token}");
    // listening before the call, so the answer can't come first
    let request = zbus::Proxy::new(
        connection,
        PORTAL,
        path.as_str(),
        "org.freedesktop.portal.Request",
    )
    .await
    .map_err(portal_error)?;
    let mut answers = request
        .receive_signal("Response")
        .await
        .map_err(portal_error)?;
    // the portal going away while its dialog is open, which would leave the
    // answer to wait for forever
    let bus = zbus::fdo::DBusProxy::new(connection)
        .await
        .map_err(portal_error)?;
    let mut gone = bus
        .receive_name_owner_changed_with_args(&[(0, PORTAL)])
        .await
        .map_err(portal_error)?
        .filter(|change| {
            let gone = change.args().is_ok_and(|args| args.new_owner().is_none());
            std::future::ready(gone)
        });
    let portal = zbus::Proxy::new(connection, PORTAL, PORTAL_PATH, PRINT)
        .await
        .map_err(portal_error)?;
    let called: OwnedObjectPath = portal.call(method, body).await.map_err(portal_error)?;
    // a portal older than handle_token answers on an object of its own,
    // where nobody listens
    if called.as_str() != path {
        return Err(PrintError::failed("the print portal is too old"));
    }
    let answer = match future::select(answers.next(), gone.next()).await {
        Either::Left((Some(answer), _)) => answer,
        Either::Left((None, _)) | Either::Right(_) => {
            return Err(PrintError::failed("the print dialog didn't answer"))
        }
    };
    let (response, results): (u32, HashMap<String, OwnedValue>) =
        answer.body().deserialize().map_err(portal_error)?;
    Ok(match response {
        0 => Answer::Done(results),
        1 => Answer::Cancelled,
        _ => Answer::Failed,
    })
}

/// a new handle token, for a request object of this connection's own
fn handle_token() -> String {
    static COUNT: AtomicU32 = AtomicU32::new(0);
    format!("blank_print_{}", COUNT.fetch_add(1, Ordering::Relaxed))
}

/// the window the portal's dialog belongs to, on X11 or Wayland, as the
/// portal names it; none if it can't be told, and the dialog then has no
/// parent. Kept until the dialog closes: on Wayland, the window's handle is
/// exported for as long as it lives.
async fn identifier(window: &tauri::WebviewWindow) -> Option<WindowIdentifier> {
    let handle = window.window_handle().ok()?.as_raw();
    // only Wayland needs the display, and asking for it on X11 opens a new
    // connection to the X server each time
    let display = match handle {
        RawWindowHandle::Wayland(_) => Some(window.display_handle().ok()?.as_raw()),
        _ => None,
    };
    WindowIdentifier::from_raw_handle(&handle, display.as_ref()).await
}

fn parent_of(identifier: &Option<WindowIdentifier>) -> String {
    identifier
        .as_ref()
        .map(ToString::to_string)
        .unwrap_or_default()
}

/// runs the future `work` makes on a thread of its own: the window's
/// handles that the portal's dialog is parented with can't move between
/// threads, as the commands' tasks do, and zbus runs on async-io's executor
/// here (nothing turns on its tokio feature)
async fn on_own_thread<T, F>(work: impl FnOnce() -> F + Send + 'static) -> Result<T, PrintError>
where
    T: Send + 'static,
    F: std::future::Future<Output = Result<T, PrintError>>,
{
    let (send, receive) = tokio::sync::oneshot::channel();
    std::thread::spawn(move || {
        let _ = send.send(async_io::block_on(work()));
    });
    receive
        .await
        .unwrap_or_else(|_| Err(PrintError::failed("the print portal stopped")))
}

/// what the dialog starts with: Blank's copies and paper, so it doesn't
/// start on the printer's own paper, and one page per sheet, since Blank
/// placed the pages itself. All print settings are strings; GTK names
/// paper upright, in millimeters, with its orientation apart.
fn preset_values(
    preset: &Preset,
) -> (
    HashMap<&'static str, Value<'static>>,
    HashMap<&'static str, Value<'static>>,
) {
    let paper = preset.paper;
    let orientation = if paper.is_landscape() {
        "landscape"
    } else {
        "portrait"
    };
    let settings = HashMap::from([
        ("n-copies", Value::from(preset.copies.to_string())),
        ("collate", Value::from(preset.collate.to_string())),
        ("number-up", Value::from("1".to_string())),
        ("orientation", Value::from(orientation.to_string())),
    ]);
    let (width, height) = paper.upright();
    let (width, height) = (width / MM, height / MM);
    let (name, display) = paper_name(width, height);
    // GTK reads a paper only with its name besides its size
    let page_setup = HashMap::from([
        ("Name", Value::from(name)),
        ("DisplayName", Value::from(display)),
        ("Width", Value::from(width)),
        ("Height", Value::from(height)),
        ("Orientation", Value::from(orientation.to_string())),
    ]);
    (settings, page_setup)
}

/// the papers Blank offers, by their PWG name, as GTK names them, and their
/// size in millimeters
const PAPERS: [(&str, &str, f64, f64); 5] = [
    ("iso_a3_297x420mm", "A3", 297.0, 420.0),
    ("iso_a4_210x297mm", "A4", 210.0, 297.0),
    ("iso_a5_148x210mm", "A5", 148.0, 210.0),
    ("na_letter_8.5x11in", "US Letter", 215.9, 279.4),
    ("na_legal_8.5x14in", "US Legal", 215.9, 355.6),
];

/// the PWG name of upright paper `width` × `height` millimeters, and what
/// the dialog shows: a known paper's, or a custom one's, which GTK reads
/// from `custom_<name>_<width>x<height>mm`
fn paper_name(width: f64, height: f64) -> (String, String) {
    let known = PAPERS
        .iter()
        .find(|(_, _, w, h)| (width - w).abs() < 0.5 && (height - h).abs() < 0.5);
    match known {
        Some((name, display, ..)) => (name.to_string(), display.to_string()),
        None => {
            let size = format!("{}x{}mm", width.round(), height.round());
            (format!("custom_blank_{size}"), size.replace('x', " × "))
        }
    }
}

/// the ranges of `print-pages=ranges`, e.g. "0-2,4": from 0, inclusive. A
/// range to the end ("3-", or "3--1" as GTK may write it) ends at the last.
fn parse_ranges(text: &str) -> Vec<(u32, u32)> {
    text.split(',')
        .filter_map(|part| {
            let part = part.trim();
            match part.split_once('-') {
                Some((from, to)) => {
                    let to = to.trim();
                    let to = if to.is_empty() || to.starts_with('-') {
                        u32::MAX
                    } else {
                        to.parse().ok()?
                    };
                    Some((from.trim().parse().ok()?, to))
                }
                None => {
                    let page = part.parse().ok()?;
                    Some((page, page))
                }
            }
        })
        .filter(|(from, to)| from <= to)
        .collect()
}

/// a dictionary of the answer, empty if it isn't there or isn't one
fn dictionary(results: &mut HashMap<String, OwnedValue>, key: &str) -> HashMap<String, OwnedValue> {
    results
        .remove(key)
        .and_then(|value| HashMap::try_from(value).ok())
        .unwrap_or_default()
}

/// a print setting as the text it is, if it is there
fn text(settings: &HashMap<String, OwnedValue>, key: &str) -> Option<String> {
    let value = settings.get(key)?;
    value.downcast_ref::<String>().ok()
}

/// a length of the page setup, in points, if it is there and one
fn length(page_setup: &HashMap<String, OwnedValue>, key: &str) -> Option<f64> {
    let millimeters = page_setup.get(key)?.downcast_ref::<f64>().ok()?;
    (millimeters > 0.0).then_some(millimeters * MM)
}

/// what Blank reads of the dialog's answer: the token, the paper, the
/// sheets to print and the scale
fn setup_of(mut results: HashMap<String, OwnedValue>) -> Result<PrintSetup, PrintError> {
    let token = results
        .get("token")
        .and_then(|token| token.downcast_ref::<u32>().ok())
        .ok_or_else(|| PrintError::failed("the print dialog gave no token"))?;
    let settings = dictionary(&mut results, "settings");
    let page_setup = dictionary(&mut results, "page-setup");
    let paper = match (length(&page_setup, "Width"), length(&page_setup, "Height")) {
        (Some(width), Some(height)) => Some(Size { width, height }),
        _ => None,
    };
    let ranges = match text(&settings, "print-pages").as_deref() {
        Some("ranges") => text(&settings, "page-ranges").map(|ranges| parse_ranges(&ranges)),
        _ => None,
    };
    // GTK may write a scale with decimals
    let scale = text(&settings, "scale")
        .and_then(|scale| scale.trim().parse::<f64>().ok())
        .map(|scale| scale.round() as u32)
        .filter(|&scale| scale > 0 && scale != 100);
    Ok(PrintSetup::Ready {
        token: Some(token),
        paper,
        ranges,
        scale,
    })
}

pub async fn prepare(
    window: &tauri::WebviewWindow,
    title: &str,
    preset: &Preset,
) -> Result<PrintSetup, PrintError> {
    let (window, title, preset) = (window.clone(), title.to_string(), preset.clone());
    on_own_thread(move || async move { prepare_here(&window, &title, &preset).await }).await
}

async fn prepare_here(
    window: &tauri::WebviewWindow,
    title: &str,
    preset: &Preset,
) -> Result<PrintSetup, PrintError> {
    let connection = session_bus().await?;
    let parent = identifier(window).await;
    let (settings, page_setup) = preset_values(preset);
    let token = handle_token();
    let options = HashMap::from([
        ("handle_token", Value::from(token.as_str())),
        ("modal", Value::from(true)),
    ]);
    let body = (parent_of(&parent), title, settings, page_setup, options);
    match ask(&connection, "PreparePrint", &token, &body).await? {
        Answer::Done(results) => setup_of(results),
        Answer::Cancelled => Ok(PrintSetup::Cancelled),
        Answer::Failed => Err(PrintError::failed("the print dialog closed with an error")),
    }
}

pub async fn send(
    window: &tauri::WebviewWindow,
    pdf: &[u8],
    meta: Meta,
) -> Result<Sent, PrintError> {
    // the PDF as a file now, on the command's thread, not copied
    let temp = TempPdf::write(window.app_handle(), pdf)?;
    let window = window.clone();
    on_own_thread(move || async move { send_here(&window, temp, &meta).await }).await
}

async fn send_here(
    window: &tauri::WebviewWindow,
    temp: TempPdf,
    meta: &Meta,
) -> Result<Sent, PrintError> {
    let connection = session_bus().await?;
    // the portal reads the PDF through the file's descriptor, which stays
    // open once the file is gone
    let file = std::fs::File::open(temp.path()).map_err(PrintError::failed)?;
    drop(temp);
    let parent = identifier(window).await;
    let handle = handle_token();
    let mut options = HashMap::from([
        ("handle_token", Value::from(handle.as_str())),
        ("modal", Value::from(true)),
    ]);
    if let Some(token) = meta.token {
        options.insert("token", Value::from(token));
    }
    let body = (
        parent_of(&parent),
        meta.title.as_str(),
        Fd::from(&file),
        options,
    );
    match ask(&connection, "Print", &handle, &body).await {
        Ok(Answer::Done(_)) => Ok(Sent::Sent { printer: None }),
        Ok(Answer::Cancelled) => Ok(Sent::Cancelled),
        // KDE's portal reports an error even after `lpr` printed
        Ok(Answer::Failed) => Err(PrintError::new(
            ErrorKind::Uncertain,
            "the print portal reported an error",
        )),
        Err(error) => Err(error),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_the_paper_as_gtk_reads_it() {
        assert_eq!(
            paper_name(210.0, 297.0),
            ("iso_a4_210x297mm".into(), "A4".into())
        );
        assert_eq!(
            paper_name(215.9, 279.4),
            ("na_letter_8.5x11in".into(), "US Letter".into())
        );
        assert_eq!(
            paper_name(170.0, 240.2),
            ("custom_blank_170x240mm".into(), "170 × 240mm".into())
        );
    }

    #[test]
    fn reads_the_ranges_of_the_portal() {
        assert_eq!(parse_ranges("0-2,4"), vec![(0, 2), (4, 4)]);
        assert_eq!(parse_ranges(" 3 - 5 , 7"), vec![(3, 5), (7, 7)]);
        // to the end
        assert_eq!(parse_ranges("3-,5--1"), vec![(3, u32::MAX), (5, u32::MAX)]);
        // what can't be read is left out
        assert_eq!(parse_ranges("a,2-1,,6"), vec![(6, 6)]);
        assert!(parse_ranges("").is_empty());
    }

    /// an answer as GNOME's print dialog gives it, with more settings than
    /// Blank reads, in GTK's own forms
    fn answer(settings: &[(&str, &str)]) -> HashMap<String, OwnedValue> {
        let settings: HashMap<String, OwnedValue> = settings
            .iter()
            .map(|(key, value)| {
                (
                    key.to_string(),
                    OwnedValue::from(zbus::zvariant::Str::from(*value)),
                )
            })
            .collect();
        let page_setup = HashMap::from([
            ("Width".to_string(), OwnedValue::from(210.0)),
            ("Height".to_string(), OwnedValue::from(297.0)),
            (
                "PPDName".to_string(),
                OwnedValue::from(zbus::zvariant::Str::from("A4")),
            ),
        ]);
        HashMap::from([
            ("token".to_string(), OwnedValue::from(7u32)),
            (
                "settings".to_string(),
                Value::from(settings).try_into().unwrap(),
            ),
            (
                "page-setup".to_string(),
                Value::from(page_setup).try_into().unwrap(),
            ),
        ])
    }

    #[test]
    fn reads_what_it_needs_of_the_dialogs_answer() {
        let setup = setup_of(answer(&[
            ("output-file-format", "pdf"),
            ("printer", "Office"),
            ("duplex", "horizontal"),
            ("scale", "95.000000"),
            ("print-pages", "ranges"),
            ("page-ranges", "0-1,3-"),
        ]))
        .unwrap();
        let PrintSetup::Ready {
            token,
            paper,
            ranges,
            scale,
        } = setup
        else {
            panic!("not ready");
        };
        assert_eq!(token, Some(7));
        let paper = paper.unwrap();
        assert!((paper.width - 595.28).abs() < 0.01 && (paper.height - 841.89).abs() < 0.01);
        assert_eq!(ranges, Some(vec![(0, 1), (3, u32::MAX)]));
        assert_eq!(scale, Some(95));
    }

    #[test]
    fn prints_everything_at_its_size_without_ranges_or_scale() {
        let setup = setup_of(answer(&[("print-pages", "all"), ("scale", "100")])).unwrap();
        let PrintSetup::Ready { ranges, scale, .. } = setup else {
            panic!("not ready");
        };
        assert_eq!(ranges, None);
        assert_eq!(scale, None);
        assert!(setup_of(HashMap::new()).is_err());
    }

    #[test]
    fn tells_a_missing_portal_from_one_that_failed() {
        assert!(is_missing(&zbus::Error::InterfaceNotFound));
        let unknown = zbus::fdo::Error::ServiceUnknown("no portal".into());
        assert!(is_missing(&zbus::Error::FDO(Box::new(unknown))));
        let failed = zbus::fdo::Error::Failed("it broke".into());
        assert!(!is_missing(&zbus::Error::FDO(Box::new(failed))));
        assert_eq!(
            portal_error(zbus::Error::InterfaceNotFound).kind,
            ErrorKind::NoService
        );
    }
}

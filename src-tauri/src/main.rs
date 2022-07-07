#![cfg_attr(
    all(not(debug_assertions), target_os = "windows"),
    windows_subsystem = "windows"
)]

use std::fs;
use std::sync::mpsc::{sync_channel, SyncSender};
use std::thread;
use wkhtmltopdf::*;

struct BlankState(SyncSender<(String, String)>);

#[tauri::command]
fn open_file(path: String) -> String {
    return fs::read_to_string(path).expect("failed to read file");
}

#[tauri::command]
fn save_file(path: String, content: String) {
    fs::write(path, content).expect("failed to write file");
}

#[tauri::command]
fn export_as_pdf(path: String, content: String, state: tauri::State<BlankState>) {
    state
        .0
        .send((path, content))
        .expect("failed to send PDF export")
}

fn init_pdf_application() -> SyncSender<(String, String)> {
    let (sender, receiver) = sync_channel(0);

    thread::spawn(move || {
        let pdf_app = PdfApplication::new().expect("Failed to initialize PDF Application");

        loop {
            let (path, content) = receiver
                .recv()
                .expect("[pdf_thread]: pdf thread could not receive data");

            let path: String = path;
            let content: String = content;

            let mut pdfout = pdf_app
                .builder()
                .page_size(PageSize::A4)
                .orientation(Orientation::Portrait)
                .margin(Size::Millimeters(15))
                .build_from_html(&content)
                .expect("failed to build pdf");

            pdfout.save(path).expect("failed to save PDF");
        }
    });

    sender
}

fn main() {
    let sender = init_pdf_application();

    let context = tauri::generate_context!();
    tauri::Builder::default()
        .manage(BlankState(sender))
        .invoke_handler(tauri::generate_handler![
            open_file,
            save_file,
            export_as_pdf
        ])
        .menu(if cfg!(target_os = "macos") {
            tauri::Menu::os_default(&context.package_info().name)
        } else {
            tauri::Menu::default()
        })
        .run(context)
        .expect("error while running tauri application");
}

mod commands;

use commands::{AppState, invoke_handler};
use std::path::Path;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem, Submenu};
use unitmux_core::tmux::{SystemRunner, TmuxRuntime};

const HIDE_MENU_ID: &str = "unitmux-hide";

fn main() {
    tauri::Builder::default()
        .menu(build_app_menu)
        .on_menu_event(|app, event| {
            if event.id() == HIDE_MENU_ID {
                #[cfg(target_os = "macos")]
                let _ = app.hide();
            }
        })
        .register_uri_scheme_protocol("local-image", |_ctx, request| {
            let path = percent_decode(request.uri().path());
            match std::fs::read(&path) {
                Ok(data) => tauri::http::Response::builder()
                    .header(
                        tauri::http::header::CONTENT_TYPE,
                        mime_for_path(Path::new(&path)),
                    )
                    .body(data)
                    .expect("response should be valid"),
                Err(_) => tauri::http::Response::builder()
                    .status(404)
                    .header(tauri::http::header::CONTENT_TYPE, "text/plain")
                    .body(b"image not found".to_vec())
                    .expect("response should be valid"),
            }
        })
        .manage(AppState::new(TmuxRuntime::new(SystemRunner::default())))
        .invoke_handler(invoke_handler())
        .run(tauri::generate_context!())
        .expect("failed to run unitmux");
}

fn build_app_menu<R: tauri::Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
    Menu::with_items(
        app,
        &[
            &Submenu::with_items(
                app,
                app.package_info().name.clone(),
                true,
                &[
                    &PredefinedMenuItem::about(app, None, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &MenuItem::with_id(app, HIDE_MENU_ID, "Hide", true, None::<&str>)?,
                    &PredefinedMenuItem::hide_others(app, None)?,
                    &PredefinedMenuItem::show_all(app, Some("Unhide"))?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::quit(app, None)?,
                ],
            )?,
            &Submenu::with_items(
                app,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(app, None)?,
                    &PredefinedMenuItem::redo(app, None)?,
                    &PredefinedMenuItem::separator(app)?,
                    &PredefinedMenuItem::cut(app, None)?,
                    &PredefinedMenuItem::copy(app, None)?,
                    &PredefinedMenuItem::paste(app, None)?,
                    &PredefinedMenuItem::select_all(app, None)?,
                ],
            )?,
        ],
    )
}

fn percent_decode(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            if let (Some(high), Some(low)) =
                (hex_value(bytes[index + 1]), hex_value(bytes[index + 2]))
            {
                output.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        output.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&output).to_string()
}

fn hex_value(byte: u8) -> Option<u8> {
    match byte {
        b'0'..=b'9' => Some(byte - b'0'),
        b'a'..=b'f' => Some(byte - b'a' + 10),
        b'A'..=b'F' => Some(byte - b'A' + 10),
        _ => None,
    }
}

fn mime_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|extension| extension.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("png") => "image/png",
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("svg") => "image/svg+xml",
        Some("bmp") => "image/bmp",
        _ => "application/octet-stream",
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn percent_decode_matches_local_image_url_paths() {
        assert_eq!(
            percent_decode("/Users/yugo/Pictures/a%20b%23c.png"),
            "/Users/yugo/Pictures/a b#c.png"
        );
        assert_eq!(
            percent_decode("/tmp/not%2Gencoded.png"),
            "/tmp/not%2Gencoded.png"
        );
    }

    #[test]
    fn mime_for_path_matches_old_local_image_protocol() {
        assert_eq!(mime_for_path(Path::new("/tmp/image.PNG")), "image/png");
        assert_eq!(mime_for_path(Path::new("/tmp/photo.jpeg")), "image/jpeg");
        assert_eq!(mime_for_path(Path::new("/tmp/anim.gif")), "image/gif");
        assert_eq!(mime_for_path(Path::new("/tmp/image.webp")), "image/webp");
        assert_eq!(mime_for_path(Path::new("/tmp/vector.svg")), "image/svg+xml");
        assert_eq!(mime_for_path(Path::new("/tmp/bitmap.bmp")), "image/bmp");
        assert_eq!(
            mime_for_path(Path::new("/tmp/archive.zip")),
            "application/octet-stream"
        );
    }
}

//! Desktop shell for Glassnote. The whole app is glassnote.html (copied to dist/index.html).
//! Rust only adds what a browser can't do inside a desktop window:
//!   * save_file        – native "Save as…" dialog for exports
//!   * open_web_window  – pop-out web windows
//!   * web_sync / web_reload / web_close – real embedded WebView2 child panes for side-panel web tabs
//!     (loads Google, YouTube, Claude, etc. without iframe X-Frame-Options / CSP blocks)

use base64::{engine::general_purpose::STANDARD, Engine};
use tauri::{LogicalPosition, LogicalSize, Manager};
use tauri_plugin_dialog::DialogExt;

/// Called from glassnote.html's download() when running inside the app.
/// `data` is base64 file content. Returns false if the user cancelled the dialog.
#[tauri::command]
async fn save_file(app: tauri::AppHandle, name: String, data: String) -> Result<bool, String> {
    let bytes = STANDARD.decode(data).map_err(|e| e.to_string())?;
    let ext = std::path::Path::new(&name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_string();
    let mut dialog = app.dialog().file().set_file_name(name.clone());
    if !ext.is_empty() {
        dialog = dialog.add_filter(ext.to_uppercase(), &[ext.as_str()]);
    }
    match dialog.blocking_save_file() {
        Some(path) => {
            let path = path.into_path().map_err(|e| e.to_string())?;
            std::fs::write(path, bytes).map_err(|e| e.to_string())?;
            Ok(true)
        }
        None => Ok(false),
    }
}

/// Opens a web page in its own app window (used by the side panel's ↗ button).
#[tauri::command]
async fn open_web_window(app: tauri::AppHandle, url: String, x: f64, y: f64, w: f64, h: f64) -> Result<(), String> {
    let parsed = url.parse::<tauri::Url>().map_err(|e| e.to_string())?;
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    tauri::WebviewWindowBuilder::new(&app, format!("web{stamp}"), tauri::WebviewUrl::External(parsed))
        .title("Glassnote · Web")
        .inner_size(w.max(320.0), h.max(320.0))
        .position(x, y)
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

/// Keeps a real child WebView2 aligned with the side panel's #pbody rect.
/// Only the active web tab is shown; all other side-panel webviews are hidden.
#[tauri::command]
async fn web_sync(
    app: tauri::AppHandle,
    id: String,
    url: String,
    x: f64,
    y: f64,
    w: f64,
    h: f64,
    visible: bool,
    navigate: bool,
) -> Result<(), String> {
    let target = format!("pweb_{id}");
    for (label, wv) in app.webviews() {
        if label.starts_with("pweb_") && (!visible || label != target) {
            let _ = wv.hide();
        }
    }
    if !visible || url.trim().is_empty() || w < 40.0 || h < 40.0 {
        return Ok(());
    }
    let pos = LogicalPosition::new(x, y);
    let size = LogicalSize::new(w.max(100.0), h.max(100.0));
    if let Some(wv) = app.get_webview(&target) {
        let _ = wv.set_position(pos);
        let _ = wv.set_size(size);
        if navigate {
            if let Ok(parsed) = url.parse::<tauri::Url>() {
                let _ = wv.navigate(parsed);
            }
        }
        let _ = wv.show();
        return Ok(());
    }
    let parsed = url.parse::<tauri::Url>().map_err(|e| e.to_string())?;
    let main = app.get_webview_window("main").ok_or("main window missing")?;
    let win = main.as_ref().window();
    win.add_child(
        tauri::webview::WebviewBuilder::new(target, tauri::WebviewUrl::External(parsed)),
        pos,
        size,
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn web_reload(app: tauri::AppHandle, id: String) {
    if let Some(wv) = app.get_webview(&format!("pweb_{id}")) {
        let _ = wv.eval("location.reload()");
    }
}

#[tauri::command]
fn web_close(app: tauri::AppHandle, id: String) {
    if let Some(wv) = app.get_webview(&format!("pweb_{id}")) {
        let _ = wv.close();
    }
}

/// Runs Google OAuth 2.0 implicit flow in the system browser using a temporary local
/// loopback listener on http://127.0.0.1:43821/cb (works cleanly with Google's redirect rules).
#[tauri::command]
async fn gdrive_oauth(url: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        use std::io::{Read, Write};
        use std::net::TcpListener;
        use std::time::{Duration, Instant};

        let listener = TcpListener::bind("127.0.0.1:43821")
            .map_err(|e| format!("Could not bind local OAuth port 43821: {e}"))?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;

        #[cfg(windows)]
        {
            let _ = std::process::Command::new("rundll32")
                .args(["url.dll,FileProtocolHandler", &url])
                .spawn();
        }

        let deadline = Instant::now() + Duration::from_secs(180);
        let cb_html = concat!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nConnection: close\r\n\r\n",
            "<!doctype html><html><body style='font-family:system-ui;display:grid;place-items:center;height:90vh;color:#222'>",
            "<div id='m'>Finishing sign-in…</div><script>",
            "const h = location.hash.slice(1);",
            "fetch('/done?' + h).then(() => { document.getElementById('m').textContent = 'Signed in to Glassnote! You can close this tab.'; setTimeout(() => window.close(), 600); });",
            "</script></body></html>"
        );
        let ok_resp = "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nConnection: close\r\n\r\nOK";

        while Instant::now() < deadline {
            match listener.accept() {
                Ok((mut stream, _)) => {
                    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
                    let mut buf = [0u8; 4096];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]);
                    let first = req.lines().next().unwrap_or("");
                    if let Some(rest) = first.strip_prefix("GET /done?") {
                        let query = rest.split_whitespace().next().unwrap_or("").to_string();
                        let _ = stream.write_all(ok_resp.as_bytes());
                        let _ = stream.flush();
                        return Ok(query);
                    } else {
                        let _ = stream.write_all(cb_html.as_bytes());
                        let _ = stream.flush();
                    }
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    std::thread::sleep(Duration::from_millis(60));
                }
                Err(e) => return Err(e.to_string()),
            }
        }
        Err("Sign-in timed out".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![save_file, open_web_window, web_sync, web_reload, web_close, gdrive_oauth])
        .run(tauri::generate_context!())
        .expect("error while running Glassnote");
}

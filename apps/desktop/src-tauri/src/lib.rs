mod runtime;

use runtime::Runtime;
use serde_json::Value;
use std::time::Duration;
use tauri::{
    AppHandle, Manager, RunEvent, State, Url, WebviewUrl, WebviewWindowBuilder, WindowEvent,
};

/// Long enough for the slowest command (loading the sample restaurant).
const COMMAND_TIMEOUT: Duration = Duration::from_secs(300);

#[tauri::command]
fn runtime_state(runtime: State<'_, Runtime>) -> Option<Value> {
    runtime.last_state()
}

#[tauri::command]
async fn runtime_call(runtime: State<'_, Runtime>, command: Value) -> Result<Value, String> {
    let runtime = runtime.inner().clone();
    tauri::async_runtime::spawn_blocking(move || runtime.call(command, COMMAND_TIMEOUT))
        .await
        .map_err(|error| error.to_string())?
}

/// Opens (or focuses) a workspace window. Each window label gets its own
/// browser profile so, for example, the cashier and the kitchen can stay
/// signed in side by side on one computer.
///
/// This must stay `async`: on Windows, building a webview window inside a
/// synchronous command (which runs on the main thread) deadlocks and leaves
/// a blank window.
#[tauri::command]
async fn open_workspace(
    app: AppHandle,
    workspace: String,
    url: String,
    separate: bool,
) -> Result<(), String> {
    let title = match workspace.as_str() {
        "staff" => "Floor & kitchen",
        "admin" => "Back office",
        "guest" => "Guest menu",
        _ => return Err("Unknown workspace.".into()),
    };
    let target: Url = url.parse().map_err(|_| "Invalid workspace address.")?;
    if target.scheme() != "http" || target.host_str() != Some("127.0.0.1") {
        return Err("Workspaces only open MISE's own local addresses.".into());
    }

    let label = if separate {
        (2..100)
            .map(|index| format!("{workspace}-{index}"))
            .find(|label| app.get_webview_window(label).is_none())
            .ok_or("Too many windows are open.")?
    } else {
        workspace.clone()
    };

    if let Some(window) = app.get_webview_window(&label) {
        let current = window.url().map_err(|error| error.to_string())?;
        if target.path() != "/" && current != target {
            window.navigate(target).map_err(|error| error.to_string())?;
        }
        let _ = window.unminimize();
        return window.set_focus().map_err(|error| error.to_string());
    }

    let profile = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("webviews")
        .join(&label);
    let window_title = if separate {
        format!("{title} ({}) — MISE", label.rsplit('-').next().unwrap_or(""))
    } else {
        format!("{title} — MISE")
    };
    let (width, height) = if workspace == "guest" { (440.0, 860.0) } else { (1360.0, 880.0) };
    WebviewWindowBuilder::new(&app, &label, WebviewUrl::External(target))
        .title(window_title)
        .inner_size(width, height)
        .min_inner_size(360.0, 560.0)
        .data_directory(profile)
        .build()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[tauri::command]
fn open_data_folder(runtime: State<'_, Runtime>) -> Result<(), String> {
    let folder = runtime
        .last_state()
        .and_then(|state| state.get("dataDirectory").and_then(Value::as_str).map(String::from))
        .ok_or("The data folder is not known yet.")?;
    #[cfg(windows)]
    let opener = "explorer";
    #[cfg(target_os = "macos")]
    let opener = "open";
    #[cfg(all(unix, not(target_os = "macos")))]
    let opener = "xdg-open";
    std::process::Command::new(opener)
        .arg(folder)
        .spawn()
        .map(|_| ())
        .map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .manage(Runtime::default())
        .setup(|app| {
            let handle = app.handle().clone();
            let runtime = app.state::<Runtime>();
            let data = app.path().app_data_dir()?;
            let resources = app.path().resource_dir()?.join("runtime");
            if let Err(detail) = runtime.start(&handle, resources, data.clone()) {
                runtime.fail(&handle, detail, &data);
            }
            Ok(())
        })
        .on_window_event(|window, event| {
            // Closing the launcher quits MISE, including workspace windows.
            // The close is held until the runtime has stopped the services
            // and PostgreSQL, so nothing keeps running in the background.
            if window.label() != "main" {
                return;
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle().clone();
                let runtime = app.state::<Runtime>().inner().clone();
                if runtime.is_stopped() {
                    app.exit(0);
                    return;
                }
                api.prevent_close();
                for open in app.webview_windows().values() {
                    let _ = open.hide();
                }
                std::thread::spawn(move || {
                    runtime.shutdown();
                    app.exit(0);
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            runtime_state,
            runtime_call,
            open_workspace,
            open_data_folder
        ])
        .build(tauri::generate_context!())
        .expect("error while building MISE");

    app.run(|app, event| match event {
        RunEvent::ExitRequested { api, .. } => {
            let runtime = app.state::<Runtime>();
            if !runtime.is_stopped() {
                api.prevent_exit();
                for window in app.webview_windows().values() {
                    let _ = window.hide();
                }
                let runtime = runtime.inner().clone();
                let handle = app.clone();
                std::thread::spawn(move || {
                    runtime.shutdown();
                    handle.exit(0);
                });
            }
        }
        // Last resort if an exit got past the handlers above: stop the
        // runtime synchronously before the process ends.
        RunEvent::Exit => app.state::<Runtime>().shutdown(),
        _ => {}
    });
}

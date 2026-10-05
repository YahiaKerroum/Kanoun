//! Supervises the Node runtime host (`runtime/host.mjs`) that runs the MISE
//! API, background worker, web apps, and — in local mode — PostgreSQL.
//!
//! The host speaks line-delimited JSON over stdio: commands go in on stdin,
//! responses (`{"id": .., "ok": ..}`) and state events (`{"event": "state"}`)
//! come out on stdout. Shutdown is always requested over stdin rather than by
//! killing the process, because on Windows a kill cannot run the host's
//! cleanup and would leave PostgreSQL running.

use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::{self, OpenOptions};
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{self, Sender};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

#[cfg(windows)]
use std::os::windows::process::CommandExt;

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

type Reply = Result<Value, String>;

#[derive(Default)]
struct Inner {
    stdin: Mutex<Option<ChildStdin>>,
    child: Mutex<Option<Child>>,
    pending: Mutex<HashMap<u64, Sender<Reply>>>,
    last_state: Mutex<Option<Value>>,
    next_id: AtomicU64,
    stopped: AtomicBool,
}

#[derive(Clone, Default)]
pub struct Runtime {
    inner: Arc<Inner>,
}

/// `\\?\C:\...` paths confuse PostgreSQL's tools; use the plain form.
fn plain_path(path: PathBuf) -> PathBuf {
    let text = path.to_string_lossy();
    match text.strip_prefix(r"\\?\") {
        Some(rest) if rest.chars().nth(1) == Some(':') => PathBuf::from(rest),
        _ => path,
    }
}

fn sidecar_path() -> Result<PathBuf, String> {
    let executable = std::env::current_exe().map_err(|error| error.to_string())?;
    let directory = executable
        .parent()
        .ok_or("The MISE install folder could not be found.")?;
    let name = if cfg!(windows) { "mise-node.exe" } else { "mise-node" };
    Ok(plain_path(directory.join(name)))
}

impl Runtime {
    pub fn start(&self, app: &AppHandle, resources: PathBuf, data: PathBuf) -> Result<(), String> {
        let resources = plain_path(resources);
        let data = plain_path(data);
        let node = sidecar_path()?;
        let host = resources.join("host.mjs");
        if !node.exists() || !host.exists() {
            return Err("This MISE installation is incomplete. Reinstall MISE.".into());
        }
        fs::create_dir_all(data.join("logs")).map_err(|error| error.to_string())?;
        let stderr_log = OpenOptions::new()
            .create(true)
            .append(true)
            .open(data.join("logs").join("host-errors.log"))
            .map_err(|error| error.to_string())?;

        let mut command = Command::new(&node);
        command
            .arg(&host)
            .current_dir(&resources)
            .env("MISE_DATA_DIR", &data)
            .env("MISE_RESOURCES_DIR", &resources)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::from(stderr_log));
        #[cfg(windows)]
        command.creation_flags(CREATE_NO_WINDOW);

        let mut child = command
            .spawn()
            .map_err(|error| format!("The MISE runtime could not start: {error}"))?;
        let stdout = child.stdout.take().ok_or("The runtime has no output stream.")?;
        *self.inner.stdin.lock().unwrap() = child.stdin.take();
        *self.inner.child.lock().unwrap() = Some(child);

        let inner = Arc::clone(&self.inner);
        let app = app.clone();
        std::thread::spawn(move || read_output(stdout, &inner, &app));
        Ok(())
    }

    /// Publishes a state for the launcher when the host cannot be started.
    pub fn fail(&self, app: &AppHandle, detail: String, data: &Path) {
        let state = json!({
            "phase": "error",
            "error": { "title": "MISE could not start", "detail": detail },
            "dataDirectory": plain_path(data.to_path_buf()),
        });
        *self.inner.last_state.lock().unwrap() = Some(state.clone());
        let _ = app.emit("runtime-state", state);
    }

    pub fn last_state(&self) -> Option<Value> {
        self.inner.last_state.lock().unwrap().clone()
    }

    /// Sends one command and blocks until the host answers or `timeout`.
    pub fn call(&self, mut command: Value, timeout: Duration) -> Reply {
        let id = self.inner.next_id.fetch_add(1, Ordering::Relaxed) + 1;
        command
            .as_object_mut()
            .ok_or("Commands must be JSON objects.")?
            .insert("id".into(), json!(id));
        let (sender, receiver) = mpsc::channel();
        self.inner.pending.lock().unwrap().insert(id, sender);
        if let Err(error) = self.write_line(&command) {
            self.inner.pending.lock().unwrap().remove(&id);
            return Err(error);
        }
        let reply = receiver.recv_timeout(timeout).unwrap_or_else(|_| {
            Err("MISE did not answer in time. Check the runtime log.".into())
        });
        self.inner.pending.lock().unwrap().remove(&id);
        reply
    }

    fn write_line(&self, value: &Value) -> Result<(), String> {
        let mut guard = self.inner.stdin.lock().unwrap();
        let stdin = guard.as_mut().ok_or("The MISE runtime is not running.")?;
        writeln!(stdin, "{value}")
            .and_then(|_| stdin.flush())
            .map_err(|_| "The MISE runtime is not running.".to_string())
    }

    pub fn is_stopped(&self) -> bool {
        self.inner.stopped.load(Ordering::SeqCst) || self.inner.child.lock().unwrap().is_none()
    }

    /// Asks the host to stop everything (services, then PostgreSQL) and waits
    /// for it to exit. Kills it only as a last resort.
    pub fn shutdown(&self) {
        if self.inner.stopped.swap(true, Ordering::SeqCst) {
            return;
        }
        let _ = self.call(json!({ "type": "shutdown" }), Duration::from_secs(30));
        // Closing stdin is the host's second shutdown trigger.
        self.inner.stdin.lock().unwrap().take();
        let deadline = Instant::now() + Duration::from_secs(10);
        let mut guard = self.inner.child.lock().unwrap();
        if let Some(child) = guard.as_mut() {
            while Instant::now() < deadline {
                if let Ok(Some(_)) = child.try_wait() {
                    break;
                }
                std::thread::sleep(Duration::from_millis(100));
            }
            if let Ok(None) = child.try_wait() {
                let _ = child.kill();
                let _ = child.wait();
            }
        }
        guard.take();
    }
}

fn read_output(stdout: std::process::ChildStdout, inner: &Arc<Inner>, app: &AppHandle) {
    for line in BufReader::new(stdout).lines() {
        let Ok(line) = line else { break };
        let Ok(message) = serde_json::from_str::<Value>(&line) else {
            continue;
        };
        if message.get("event").and_then(Value::as_str) == Some("state") {
            let state = message.get("state").cloned().unwrap_or(Value::Null);
            *inner.last_state.lock().unwrap() = Some(state.clone());
            let _ = app.emit("runtime-state", state);
        } else if let Some(id) = message.get("id").and_then(Value::as_u64) {
            if let Some(sender) = inner.pending.lock().unwrap().remove(&id) {
                let reply = if message.get("ok").and_then(Value::as_bool) == Some(true) {
                    Ok(message.get("result").cloned().unwrap_or(Value::Null))
                } else {
                    Err(message
                        .pointer("/error/message")
                        .and_then(Value::as_str)
                        .unwrap_or("Something went wrong.")
                        .to_string())
                };
                let _ = sender.send(reply);
            }
        }
    }
    // The host exited. Fail every waiting call and tell the launcher, unless
    // this is the expected end of a shutdown.
    for (_, sender) in inner.pending.lock().unwrap().drain() {
        let _ = sender.send(Err("The MISE runtime stopped.".into()));
    }
    if !inner.stopped.load(Ordering::SeqCst) {
        let state = json!({
            "phase": "error",
            "error": {
                "title": "The MISE runtime stopped",
                "detail": "Restart MISE. If this keeps happening, send the logs folder from the data directory to support."
            },
            "dataDirectory": inner.last_state.lock().unwrap()
                .as_ref()
                .and_then(|state| state.get("dataDirectory").cloned())
                .unwrap_or(Value::Null),
        });
        *inner.last_state.lock().unwrap() = Some(state.clone());
        let _ = app.emit("runtime-state", state);
    }
}

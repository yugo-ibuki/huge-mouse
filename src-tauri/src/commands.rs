#[cfg(any(target_os = "macos", target_os = "linux", target_os = "windows"))]
use std::process::Command;
use std::sync::{
    Arc, Mutex,
    atomic::{AtomicBool, Ordering},
    mpsc,
};
use std::thread;
use std::time::Duration;
#[cfg(target_os = "macos")]
use std::{ffi::c_void, mem};

use tauri::{Emitter, PhysicalPosition, PhysicalSize, State, WebviewWindow};
use unitmux_core::skills::{SkillEntry, list_skills_from_dir};
use unitmux_core::tmux::{
    PaneDetail, SendResult, ShellPaneResult, SystemRunner, TmuxPane, TmuxRuntime,
};
use unitmux_core::token_usage::{TokenUsage, TokenUsageSummary, get_token_usage_summary_from_home};

#[cfg(test)]
const COMMAND_NAMES: &[&str] = &[
    "list_sessions",
    "send_input",
    "capture_pane",
    "get_pane_detail",
    "get_token_usage",
    "get_token_usage_summary",
    "list_skills",
    "list_tmux_sessions",
    "create_session",
    "create_new_session",
    "kill_pane",
    "find_shell_pane",
    "ensure_shell_pane",
    "set_always_on_top",
    "get_always_on_top",
    "set_opacity",
    "get_opacity",
    "set_focus_shortcut",
    "toggle_compact",
    "focus_textarea",
    "start_stream",
    "stop_stream",
    "select_images",
    "git_add",
    "git_add_files",
    "git_commit",
    "git_push",
    "git_diff",
];

pub struct AppState {
    runtime: Mutex<TmuxRuntime<SystemRunner>>,
    window: Arc<Mutex<WindowState>>,
    stream: Mutex<StreamState>,
}

struct WindowState {
    compact: bool,
    opacity: f64,
    saved_bounds: Option<WindowBounds>,
}

impl Default for WindowState {
    fn default() -> Self {
        Self {
            compact: false,
            opacity: 1.0,
            saved_bounds: None,
        }
    }
}

#[derive(Clone, Copy)]
struct WindowBounds {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
}

#[derive(Default)]
struct StreamState {
    stop: Option<Arc<AtomicBool>>,
}

#[cfg(target_os = "macos")]
static HOTKEY_SENDER: Mutex<Option<mpsc::Sender<()>>> = Mutex::new(None);
#[cfg(target_os = "macos")]
static HOTKEY_REF: Mutex<Option<usize>> = Mutex::new(None);
#[cfg(target_os = "macos")]
static HOTKEY_HANDLER_INSTALLED: AtomicBool = AtomicBool::new(false);

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SkillLists {
    user: Vec<SkillEntry>,
    project: Vec<SkillEntry>,
}

impl AppState {
    pub fn new(runtime: TmuxRuntime<SystemRunner>) -> Self {
        Self {
            runtime: Mutex::new(runtime),
            window: Arc::new(Mutex::new(WindowState::default())),
            stream: Mutex::new(StreamState::default()),
        }
    }

    fn with_runtime<T>(
        &self,
        f: impl FnOnce(&TmuxRuntime<SystemRunner>) -> T,
    ) -> Result<T, String> {
        let runtime = self.runtime.lock().map_err(|error| error.to_string())?;
        Ok(f(&runtime))
    }

    fn with_window_state<T>(&self, f: impl FnOnce(&mut WindowState) -> T) -> Result<T, String> {
        let mut window = self.window.lock().map_err(|error| error.to_string())?;
        Ok(f(&mut window))
    }

    fn stop_stream(&self) -> Result<(), String> {
        if let Some(stop) = self
            .stream
            .lock()
            .map_err(|error| error.to_string())?
            .stop
            .take()
        {
            stop.store(true, Ordering::Relaxed);
        }
        Ok(())
    }
}

#[tauri::command]
fn list_sessions(state: State<'_, AppState>) -> Result<Vec<TmuxPane>, String> {
    state
        .with_runtime(|runtime| runtime.list_panes())
        .unwrap_or_else(|_| Ok(Vec::new()))
}

#[tauri::command]
fn send_input(
    state: State<'_, AppState>,
    target: String,
    text: String,
    vim_mode: Option<bool>,
    images: Option<Vec<String>>,
) -> Result<SendResult, String> {
    state.with_runtime(|runtime| {
        runtime.send_input(
            &target,
            &text,
            vim_mode.unwrap_or(false),
            &images.unwrap_or_default(),
        )
    })
}

#[tauri::command]
fn capture_pane(state: State<'_, AppState>, target: String) -> Result<String, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    state.with_runtime(|runtime| runtime.capture_pane_with_history(&target, &home))?
}

#[tauri::command]
fn get_pane_detail(
    state: State<'_, AppState>,
    target: String,
) -> Result<Option<PaneDetail>, String> {
    state.with_runtime(|runtime| runtime.get_pane_detail(&target))?
}

#[tauri::command]
fn list_skills(cwd: String) -> SkillLists {
    let user = std::env::var("HOME")
        .map(list_skills_from_dir)
        .unwrap_or_default();
    let project = if cwd.is_empty() {
        Vec::new()
    } else {
        list_skills_from_dir(cwd)
    };
    SkillLists { user, project }
}

#[tauri::command]
fn get_token_usage(state: State<'_, AppState>, target: String) -> Result<TokenUsage, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    state.with_runtime(|runtime| runtime.get_pane_token_usage(&target, &home))?
}

#[tauri::command]
fn get_token_usage_summary(_force: Option<bool>) -> TokenUsageSummary {
    std::env::var("HOME")
        .map(get_token_usage_summary_from_home)
        .unwrap_or_else(|_| get_token_usage_summary_from_home(""))
}

#[tauri::command]
fn list_tmux_sessions(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state
        .with_runtime(|runtime| runtime.list_tmux_sessions())
        .unwrap_or_else(|_| Ok(Vec::new()))
}

#[tauri::command]
fn create_session(
    state: State<'_, AppState>,
    session_name: String,
    command: String,
    cwd: Option<String>,
) -> Result<SendResult, String> {
    state.with_runtime(|runtime| runtime.create_session(&session_name, &command, cwd.as_deref()))
}

#[tauri::command]
fn create_new_session(
    state: State<'_, AppState>,
    session_name: String,
    command: String,
    cwd: Option<String>,
) -> Result<SendResult, String> {
    state
        .with_runtime(|runtime| runtime.create_new_session(&session_name, &command, cwd.as_deref()))
}

#[tauri::command]
fn kill_pane(state: State<'_, AppState>, target: String) -> Result<SendResult, String> {
    state.with_runtime(|runtime| runtime.kill_pane(&target))
}

#[tauri::command]
fn find_shell_pane(state: State<'_, AppState>, session: String) -> Result<Option<String>, String> {
    state.with_runtime(|runtime| runtime.find_shell_pane(&session))?
}

#[tauri::command]
fn ensure_shell_pane(
    state: State<'_, AppState>,
    session: String,
    cwd: String,
) -> Result<ShellPaneResult, String> {
    state.with_runtime(|runtime| runtime.ensure_shell_pane(&session, &cwd))
}

#[tauri::command]
fn set_always_on_top<R: tauri::Runtime>(
    window: WebviewWindow<R>,
    value: bool,
) -> Result<bool, String> {
    window
        .set_always_on_top(value)
        .map_err(|error| error.to_string())?;
    Ok(value)
}

#[tauri::command]
fn get_always_on_top<R: tauri::Runtime>(window: WebviewWindow<R>) -> Result<bool, String> {
    window.is_always_on_top().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_opacity<R: tauri::Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, AppState>,
    value: f64,
) -> Result<f64, String> {
    let value = value.clamp(0.2, 1.0);
    set_window_opacity(&window, value)?;
    state.with_window_state(|window_state| window_state.opacity = value)?;
    Ok(value)
}

#[tauri::command]
fn get_opacity<R: tauri::Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, AppState>,
) -> Result<f64, String> {
    get_window_opacity(&window)
        .or_else(|_| state.with_window_state(|window_state| window_state.opacity))
}

#[cfg(target_os = "macos")]
fn set_window_opacity<R: tauri::Runtime>(
    window: &WebviewWindow<R>,
    value: f64,
) -> Result<(), String> {
    unsafe {
        let ns_window = window.ns_window().map_err(|error| error.to_string())?;
        let selector = sel_register_name(c"setAlphaValue:".as_ptr());
        let msg_send: unsafe extern "C" fn(*mut c_void, *const c_void, f64) =
            mem::transmute(objc_msg_send as *const ());
        msg_send(ns_window, selector, value);
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn get_window_opacity<R: tauri::Runtime>(window: &WebviewWindow<R>) -> Result<f64, String> {
    unsafe {
        let ns_window = window.ns_window().map_err(|error| error.to_string())?;
        let selector = sel_register_name(c"alphaValue".as_ptr());
        let msg_send: unsafe extern "C" fn(*mut c_void, *const c_void) -> f64 =
            mem::transmute(objc_msg_send as *const ());
        Ok(msg_send(ns_window, selector))
    }
}

#[cfg(not(target_os = "macos"))]
fn set_window_opacity<R: tauri::Runtime>(
    _window: &WebviewWindow<R>,
    _value: f64,
) -> Result<(), String> {
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn get_window_opacity<R: tauri::Runtime>(_window: &WebviewWindow<R>) -> Result<f64, String> {
    Err("window opacity is not available on this platform".to_string())
}

#[cfg(target_os = "macos")]
fn blur_window<R: tauri::Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    unsafe {
        let ns_window = window.ns_window().map_err(|error| error.to_string())?;
        let selector = sel_register_name(c"orderBack:".as_ptr());
        let msg_send: unsafe extern "C" fn(*mut c_void, *const c_void, *mut c_void) =
            mem::transmute(objc_msg_send as *const ());
        msg_send(ns_window, selector, std::ptr::null_mut());
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
fn blur_window<R: tauri::Runtime>(window: &WebviewWindow<R>) -> Result<(), String> {
    window.hide().map_err(|error| error.to_string())
}

#[tauri::command]
fn set_focus_shortcut<R: tauri::Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, AppState>,
    key: String,
) -> Result<bool, String> {
    register_focus_shortcut(window, Arc::clone(&state.window), &key)
}

#[cfg(target_os = "macos")]
fn register_focus_shortcut<R: tauri::Runtime>(
    window: WebviewWindow<R>,
    window_state: Arc<Mutex<WindowState>>,
    key: &str,
) -> Result<bool, String> {
    let Some(key_code) = macos_key_code(key) else {
        return Ok(false);
    };
    install_hotkey_handler()?;

    if let Some(existing_ref) = HOTKEY_REF.lock().map_err(|error| error.to_string())?.take() {
        unsafe {
            let _ = unregister_event_hotkey(existing_ref as *mut c_void);
        }
    }

    let (sender, receiver) = mpsc::channel::<()>();
    *HOTKEY_SENDER.lock().map_err(|error| error.to_string())? = Some(sender);
    thread::spawn(move || {
        for () in receiver {
            let focused = window.is_focused().unwrap_or(false);
            if focused {
                let _ = blur_window(&window);
            } else {
                let _ = window.show();
                let _ = window.set_focus();
                if window_state
                    .lock()
                    .map(|state| state.compact)
                    .unwrap_or(false)
                {
                    let _ = toggle_compact_with_state(&window, &window_state);
                }
                let _ = window.emit("focus-textarea", ());
            }
        }
    });

    let mut hotkey_ref: *mut c_void = std::ptr::null_mut();
    let hotkey_id = EventHotKeyId {
        signature: u32::from_be_bytes(*b"UNMX"),
        id: 1,
    };
    let status = unsafe {
        register_event_hotkey(
            key_code,
            CMD_KEY | SHIFT_KEY,
            hotkey_id,
            get_application_event_target(),
            0,
            &mut hotkey_ref,
        )
    };
    if status != 0 {
        return Ok(false);
    }
    *HOTKEY_REF.lock().map_err(|error| error.to_string())? = Some(hotkey_ref as usize);
    Ok(true)
}

#[cfg(not(target_os = "macos"))]
fn register_focus_shortcut<R: tauri::Runtime>(
    _window: WebviewWindow<R>,
    _window_state: Arc<Mutex<WindowState>>,
    _key: &str,
) -> Result<bool, String> {
    Ok(false)
}

#[cfg(target_os = "macos")]
fn install_hotkey_handler() -> Result<(), String> {
    if HOTKEY_HANDLER_INSTALLED.swap(true, Ordering::Relaxed) {
        return Ok(());
    }
    let event_type = EventTypeSpec {
        event_class: K_EVENT_CLASS_KEYBOARD,
        event_kind: K_EVENT_HOT_KEY_PRESSED,
    };
    let status = unsafe {
        install_event_handler(
            get_application_event_target(),
            hotkey_handler,
            1,
            &event_type,
            std::ptr::null_mut(),
            std::ptr::null_mut(),
        )
    };
    if status == 0 {
        Ok(())
    } else {
        HOTKEY_HANDLER_INSTALLED.store(false, Ordering::Relaxed);
        Err(format!("failed to install hotkey handler: {status}"))
    }
}

#[cfg(target_os = "macos")]
extern "C" fn hotkey_handler(
    _next_handler: *mut c_void,
    _event: *mut c_void,
    _user_data: *mut c_void,
) -> i32 {
    if let Ok(sender) = HOTKEY_SENDER.lock() {
        if let Some(sender) = sender.as_ref() {
            let _ = sender.send(());
        }
    }
    0
}

#[cfg(target_os = "macos")]
fn macos_key_code(key: &str) -> Option<u32> {
    match key.to_ascii_lowercase().as_str() {
        "a" => Some(0),
        "s" => Some(1),
        "d" => Some(2),
        "f" => Some(3),
        "h" => Some(4),
        "g" => Some(5),
        "z" => Some(6),
        "x" => Some(7),
        "c" => Some(8),
        "v" => Some(9),
        "b" => Some(11),
        "q" => Some(12),
        "w" => Some(13),
        "e" => Some(14),
        "r" => Some(15),
        "y" => Some(16),
        "t" => Some(17),
        "o" => Some(31),
        "u" => Some(32),
        "i" => Some(34),
        "p" => Some(35),
        "l" => Some(37),
        "j" => Some(38),
        "k" => Some(40),
        "n" => Some(45),
        "m" => Some(46),
        _ => None,
    }
}

#[cfg(target_os = "macos")]
const K_EVENT_CLASS_KEYBOARD: u32 = u32::from_be_bytes(*b"keyb");
#[cfg(target_os = "macos")]
const K_EVENT_HOT_KEY_PRESSED: u32 = 6;
#[cfg(target_os = "macos")]
const CMD_KEY: u32 = 1 << 8;
#[cfg(target_os = "macos")]
const SHIFT_KEY: u32 = 1 << 9;

#[cfg(target_os = "macos")]
#[repr(C)]
#[derive(Clone, Copy)]
struct EventHotKeyId {
    signature: u32,
    id: u32,
}

#[cfg(target_os = "macos")]
#[repr(C)]
struct EventTypeSpec {
    event_class: u32,
    event_kind: u32,
}

#[cfg(target_os = "macos")]
#[link(name = "Carbon", kind = "framework")]
unsafe extern "C" {
    #[link_name = "RegisterEventHotKey"]
    fn register_event_hotkey(
        hotkey_code: u32,
        hotkey_modifiers: u32,
        hotkey_id: EventHotKeyId,
        target: *mut c_void,
        options: u32,
        out_ref: *mut *mut c_void,
    ) -> i32;
    #[link_name = "UnregisterEventHotKey"]
    fn unregister_event_hotkey(hotkey_ref: *mut c_void) -> i32;
    #[link_name = "InstallEventHandler"]
    fn install_event_handler(
        target: *mut c_void,
        handler: extern "C" fn(*mut c_void, *mut c_void, *mut c_void) -> i32,
        event_type_count: u32,
        event_types: *const EventTypeSpec,
        user_data: *mut c_void,
        out_handler_ref: *mut *mut c_void,
    ) -> i32;
    #[link_name = "GetApplicationEventTarget"]
    fn get_application_event_target() -> *mut c_void;
}

#[cfg(target_os = "macos")]
#[link(name = "objc")]
unsafe extern "C" {
    #[link_name = "objc_msgSend"]
    fn objc_msg_send();
    #[link_name = "sel_registerName"]
    fn sel_register_name(name: *const i8) -> *const c_void;
}

#[tauri::command]
fn toggle_compact<R: tauri::Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, AppState>,
) -> Result<bool, String> {
    toggle_compact_with_state(&window, &state.window)
}

fn toggle_compact_with_state<R: tauri::Runtime>(
    window: &WebviewWindow<R>,
    window_state: &Arc<Mutex<WindowState>>,
) -> Result<bool, String> {
    let compact = {
        let mut window_state = window_state.lock().map_err(|error| error.to_string())?;
        if window_state.compact {
            let bounds = window_state.saved_bounds.take();
            window_state.compact = false;
            (false, bounds)
        } else {
            let bounds = match (window.outer_position(), window.outer_size()) {
                (Ok(position), Ok(size)) => Some(WindowBounds { position, size }),
                _ => None,
            };
            window_state.saved_bounds = bounds;
            window_state.compact = true;
            (true, bounds)
        }
    };

    let (is_compact, saved_bounds) = compact;
    if is_compact {
        let width = saved_bounds
            .map(|bounds| bounds.size.width)
            .unwrap_or_else(|| window.outer_size().map(|size| size.width).unwrap_or(700));
        window
            .set_size(PhysicalSize::new(width, 70))
            .map_err(|error| error.to_string())?;
    } else if let Some(bounds) = saved_bounds {
        window
            .set_position(bounds.position)
            .map_err(|error| error.to_string())?;
        window
            .set_size(bounds.size)
            .map_err(|error| error.to_string())?;
    }

    window
        .emit("compact-changed", is_compact)
        .map_err(|error| error.to_string())?;
    Ok(is_compact)
}

#[tauri::command]
fn focus_textarea<R: tauri::Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let was_compact = state.with_window_state(|window_state| window_state.compact)?;
    window.set_focus().map_err(|error| error.to_string())?;
    window
        .emit("focus-textarea", ())
        .map_err(|error| error.to_string())?;
    if was_compact {
        let _ = toggle_compact_with_state(&window, &state.window)?;
    }
    Ok(())
}

#[tauri::command]
fn start_stream<R: tauri::Runtime>(
    window: WebviewWindow<R>,
    state: State<'_, AppState>,
    target: String,
) -> Result<bool, String> {
    state.stop_stream()?;
    let stop = Arc::new(AtomicBool::new(false));
    state.stream.lock().map_err(|error| error.to_string())?.stop = Some(Arc::clone(&stop));

    let home = std::env::var("HOME").unwrap_or_default();
    thread::spawn(move || {
        let runtime = TmuxRuntime::new(SystemRunner::default());
        let mut last_content = String::new();
        while !stop.load(Ordering::Relaxed) {
            if let Ok(content) = runtime.capture_pane_with_history(&target, &home) {
                if content != last_content {
                    if !last_content.is_empty()
                        && content.len() < last_content.len().saturating_mul(8) / 10
                    {
                        thread::sleep(Duration::from_millis(500));
                        continue;
                    }
                    last_content = content.clone();
                    let _ = window.emit("tmux:stream-data", content);
                }
            }
            thread::sleep(Duration::from_millis(500));
        }
    });

    Ok(true)
}

#[tauri::command]
fn stop_stream(state: State<'_, AppState>) -> Result<bool, String> {
    state.stop_stream()?;
    Ok(true)
}

#[tauri::command]
fn select_images<R: tauri::Runtime>(window: WebviewWindow<R>) -> Result<Vec<String>, String> {
    let was_on_top = window.is_always_on_top().unwrap_or(false);
    if was_on_top {
        window
            .set_always_on_top(false)
            .map_err(|error| error.to_string())?;
    }
    let result = select_images_platform();
    if was_on_top {
        let _ = window.set_always_on_top(true);
    }
    result
}

#[cfg(target_os = "macos")]
fn select_images_platform() -> Result<Vec<String>, String> {
    let output = Command::new("osascript")
        .args([
            "-e",
            r#"set imageFiles to choose file with prompt "Select images" of type {"public.image"} with multiple selections allowed"#,
            "-e",
            r#"set output to """#,
            "-e",
            r#"repeat with imageFile in imageFiles"#,
            "-e",
            r#"set output to output & POSIX path of imageFile & linefeed"#,
            "-e",
            r#"end repeat"#,
            "-e",
            "return output",
        ])
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    Ok(String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect())
}

#[cfg(target_os = "linux")]
fn select_images_platform() -> Result<Vec<String>, String> {
    let output = match Command::new("zenity")
        .args([
            "--file-selection",
            "--multiple",
            "--separator=\n",
            "--file-filter=Images | *.png *.jpg *.jpeg *.gif *.webp *.svg *.bmp",
        ])
        .output()
    {
        Ok(output) => output,
        // Some Linux desktops do not ship zenity by default; cancel cleanly
        // instead of surfacing a command-not-found error in the renderer.
        Err(_) => return Ok(Vec::new()),
    };
    if !output.status.success() {
        return Ok(Vec::new());
    }
    Ok(parse_selected_image_paths(&output.stdout))
}

#[cfg(target_os = "windows")]
fn select_images_platform() -> Result<Vec<String>, String> {
    let output = Command::new("powershell.exe")
        .args([
            "-NoProfile",
            "-STA",
            "-Command",
            r#"Add-Type -AssemblyName System.Windows.Forms; $dialog = New-Object System.Windows.Forms.OpenFileDialog; $dialog.Multiselect = $true; $dialog.Filter = 'Images (*.png;*.jpg;*.jpeg;*.gif;*.webp;*.svg;*.bmp)|*.png;*.jpg;*.jpeg;*.gif;*.webp;*.svg;*.bmp'; if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $dialog.FileNames -join "`n" }"#,
        ])
        .output()
        .map_err(|error| error.to_string())?;
    if !output.status.success() {
        return Ok(Vec::new());
    }
    Ok(parse_selected_image_paths(&output.stdout))
}

#[cfg(any(target_os = "linux", target_os = "windows"))]
fn parse_selected_image_paths(output: &[u8]) -> Vec<String> {
    String::from_utf8_lossy(output)
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_string)
        .collect()
}

#[tauri::command]
fn git_add(state: State<'_, AppState>, cwd: String) -> Result<SendResult, String> {
    state.with_runtime(|runtime| runtime.git_add(&cwd))
}

#[tauri::command]
fn git_add_files(
    state: State<'_, AppState>,
    cwd: String,
    files: Vec<String>,
) -> Result<SendResult, String> {
    state.with_runtime(|runtime| runtime.git_add_files(&cwd, &files))
}

#[tauri::command]
fn git_commit(
    state: State<'_, AppState>,
    cwd: String,
    message: String,
) -> Result<SendResult, String> {
    state.with_runtime(|runtime| runtime.git_commit(&cwd, &message))
}

#[tauri::command]
fn git_push(state: State<'_, AppState>, cwd: String) -> Result<SendResult, String> {
    state.with_runtime(|runtime| runtime.git_push(&cwd))
}

#[tauri::command]
fn git_diff(
    state: State<'_, AppState>,
    cwd: String,
    staged: Option<bool>,
) -> Result<String, String> {
    state.with_runtime(|runtime| runtime.git_diff(&cwd, staged.unwrap_or(false)))?
}

pub fn invoke_handler<R: tauri::Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool {
    tauri::generate_handler![
        list_sessions,
        send_input,
        capture_pane,
        get_pane_detail,
        get_token_usage,
        get_token_usage_summary,
        list_skills,
        list_tmux_sessions,
        create_session,
        create_new_session,
        kill_pane,
        find_shell_pane,
        ensure_shell_pane,
        set_always_on_top,
        get_always_on_top,
        set_opacity,
        get_opacity,
        set_focus_shortcut,
        toggle_compact,
        focus_textarea,
        start_stream,
        stop_stream,
        select_images,
        git_add,
        git_add_files,
        git_commit,
        git_push,
        git_diff,
    ]
}

#[cfg(test)]
mod tests {
    use super::COMMAND_NAMES;

    #[test]
    fn command_names_cover_existing_tmux_and_git_api_surface() {
        let expected = [
            "list_sessions",
            "send_input",
            "capture_pane",
            "get_pane_detail",
            "get_token_usage",
            "get_token_usage_summary",
            "list_skills",
            "list_tmux_sessions",
            "create_session",
            "create_new_session",
            "kill_pane",
            "find_shell_pane",
            "ensure_shell_pane",
            "set_always_on_top",
            "get_always_on_top",
            "set_opacity",
            "get_opacity",
            "set_focus_shortcut",
            "toggle_compact",
            "focus_textarea",
            "start_stream",
            "stop_stream",
            "select_images",
            "git_add",
            "git_add_files",
            "git_commit",
            "git_push",
            "git_diff",
        ];

        assert_eq!(COMMAND_NAMES, expected);
    }
}

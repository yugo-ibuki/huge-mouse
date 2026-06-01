use std::env;
use std::fs;
use std::io::Read;
#[cfg(unix)]
use std::os::unix::process::CommandExt;
use std::path::Path;
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

use crate::token_usage::{
    TokenUsage, TokenUsageSource, create_empty_token_usage, find_codex_session_jsonl,
    get_token_usage_for_claude_jsonl, get_token_usage_for_codex_jsonl,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct TmuxChoice {
    pub number: String,
    pub label: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PaneStatus {
    Idle,
    Busy,
    Waiting,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatusDetection {
    pub status: PaneStatus,
    pub choices: Vec<TmuxChoice>,
    pub prompt: String,
    pub activity_line: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CodexChoiceKey {
    Escape,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedCodexChoice {
    pub text: String,
    pub submit: bool,
    pub key: Option<CodexChoiceKey>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TmuxPane {
    pub target: String,
    pub pid: String,
    pub command: String,
    pub title: String,
    pub status: PaneStatus,
    pub choices: Vec<TmuxChoice>,
    pub prompt: String,
    pub activity_line: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaneDetail {
    pub target: String,
    pub pid: String,
    pub command: String,
    pub title: String,
    pub width: String,
    pub height: String,
    pub started_at: String,
    pub cwd: String,
    pub tty: String,
    pub git_branch: String,
    pub git_status: String,
    pub model: String,
    pub session_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SendResult {
    pub success: bool,
    pub error: Option<String>,
}

impl SendResult {
    pub fn ok() -> Self {
        Self {
            success: true,
            error: None,
        }
    }

    fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            error: Some(message.into()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ShellPaneResult {
    pub success: bool,
    pub target: Option<String>,
    pub error: Option<String>,
}

impl ShellPaneResult {
    fn ok(target: impl Into<String>) -> Self {
        Self {
            success: true,
            target: Some(target.into()),
            error: None,
        }
    }

    fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            target: None,
            error: Some(message.into()),
        }
    }
}

pub trait CommandRunner {
    fn run_tmux(&self, args: &[String]) -> Result<String, String>;
    fn run_git(&self, args: &[String]) -> Result<String, String>;
    fn tmux_program_for_run_shell(&self) -> &str {
        "tmux"
    }
}

pub struct SystemRunner {
    tmux_bin: String,
    git_bin: String,
}

impl Default for SystemRunner {
    fn default() -> Self {
        Self {
            tmux_bin: find_bin(
                &[
                    "/opt/homebrew/bin/tmux",
                    "/usr/local/bin/tmux",
                    "/usr/bin/tmux",
                ],
                "tmux",
            ),
            git_bin: find_bin(
                &[
                    "/opt/homebrew/bin/git",
                    "/usr/local/bin/git",
                    "/usr/bin/git",
                ],
                "git",
            ),
        }
    }
}

impl CommandRunner for SystemRunner {
    fn run_tmux(&self, args: &[String]) -> Result<String, String> {
        let full_args = get_tmux_socket_path()
            .map(|socket| {
                let mut with_socket = vec!["-S".to_string(), socket];
                with_socket.extend(args.iter().cloned());
                with_socket
            })
            .unwrap_or_else(|| args.to_vec());
        run_command_with_timeout(&self.tmux_bin, &full_args, Duration::from_secs(5))
    }

    fn run_git(&self, args: &[String]) -> Result<String, String> {
        run_command_with_timeout(&self.git_bin, args, Duration::from_secs(30))
    }

    fn tmux_program_for_run_shell(&self) -> &str {
        &self.tmux_bin
    }
}

fn find_bin(candidates: &[&str], fallback: &str) -> String {
    candidates
        .iter()
        .find(|candidate| Path::new(candidate).exists())
        .copied()
        .unwrap_or(fallback)
        .to_string()
}

fn get_tmux_socket_path() -> Option<String> {
    env::var("TMUX")
        .ok()
        .and_then(|value| value.split(',').next().map(str::to_string))
        .filter(|path| Path::new(path).exists())
        .or_else(|| {
            let candidate = format!("/private/tmp/tmux-{}/default", unsafe { libc_getuid() });
            Path::new(&candidate).exists().then_some(candidate)
        })
}

#[cfg(unix)]
unsafe fn libc_getuid() -> u32 {
    unsafe extern "C" {
        fn getuid() -> u32;
    }
    unsafe { getuid() }
}

#[cfg(not(unix))]
unsafe fn libc_getuid() -> u32 {
    0
}

fn run_command_with_timeout(
    program: &str,
    args: &[String],
    timeout: Duration,
) -> Result<String, String> {
    let mut command = Command::new(program);
    command
        .args(args)
        .env("LANG", "en_US.UTF-8")
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(unix)]
    unsafe {
        command.pre_exec(|| {
            // Put external CLI calls in their own process group so timeout
            // cleanup also stops shell children that keep output pipes open.
            if setpgid(0, 0) == 0 {
                Ok(())
            } else {
                Err(std::io::Error::last_os_error())
            }
        });
    }

    let mut child = command.spawn().map_err(|error| error.to_string())?;

    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "failed to capture stdout".to_string())?;
    let mut stderr = child
        .stderr
        .take()
        .ok_or_else(|| "failed to capture stderr".to_string())?;
    let stdout_reader = std::thread::spawn(move || {
        let mut output = Vec::new();
        let _ = stdout.read_to_end(&mut output);
        output
    });
    let stderr_reader = std::thread::spawn(move || {
        let mut output = Vec::new();
        let _ = stderr.read_to_end(&mut output);
        output
    });

    let started = Instant::now();
    let status = loop {
        if let Some(status) = child.try_wait().map_err(|error| error.to_string())? {
            break status;
        }
        if started.elapsed() >= timeout {
            kill_process_group_or_child(&mut child);
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err(format!(
                "{program} timed out after {}ms",
                timeout.as_millis()
            ));
        }
        std::thread::sleep(Duration::from_millis(10));
    };

    let stdout = stdout_reader
        .join()
        .map_err(|_| "failed to join stdout reader".to_string())?;
    let stderr = stderr_reader
        .join()
        .map_err(|_| "failed to join stderr reader".to_string())?;
    if status.success() {
        Ok(String::from_utf8_lossy(&stdout).to_string())
    } else {
        Err(String::from_utf8_lossy(&stderr).to_string())
    }
}

fn kill_process_group_or_child(child: &mut std::process::Child) {
    #[cfg(unix)]
    unsafe {
        let process_group = -(child.id() as i32);
        if kill(process_group, SIGKILL) == 0 {
            return;
        }
    }
    let _ = child.kill();
}

#[cfg(unix)]
const SIGKILL: i32 = 9;

#[cfg(unix)]
unsafe extern "C" {
    fn setpgid(pid: i32, pgid: i32) -> i32;
    fn kill(pid: i32, sig: i32) -> i32;
}

pub struct TmuxRuntime<R> {
    runner: R,
}

impl<R> TmuxRuntime<R> {
    pub fn new(runner: R) -> Self {
        Self { runner }
    }

    pub fn runner(&self) -> &R {
        &self.runner
    }
}

impl<R: CommandRunner> TmuxRuntime<R> {
    pub fn list_panes(&self) -> Result<Vec<TmuxPane>, String> {
        let format = "#{session_name}:#{window_index}.#{pane_index}|#{pane_pid}|#{pane_current_command}|#{pane_title}";
        let stdout = self.run_tmux(&["list-panes", "-a", "-F", format])?;
        let mut panes = stdout
            .lines()
            .filter_map(parse_pane_line)
            .filter_map(normalize_supported_pane)
            .collect::<Vec<_>>();

        for pane in &mut panes {
            let content = self.capture_pane_content(&pane.target).unwrap_or_default();
            let result = detect_status(&pane.title, &content, &pane.command);
            pane.status = result.status;
            pane.choices = result.choices;
            pane.prompt = result.prompt;
            pane.activity_line = result.activity_line;
        }

        Ok(panes)
    }

    pub fn get_pane_detail(&self, target: &str) -> Result<Option<PaneDetail>, String> {
        if !is_valid_target(target) {
            return Ok(None);
        }

        let format = [
            "#{session_name}:#{window_index}.#{pane_index}",
            "#{pane_pid}",
            "#{pane_current_command}",
            "#{pane_title}",
            "#{pane_width}",
            "#{pane_height}",
            "#{pane_start_command}",
            "#{pane_current_path}",
            "#{pane_tty}",
        ]
        .join("|");
        // Preserve the previous IPC contract: pane-detail failures resolve
        // as null instead of rejecting the renderer promise when a pane closes.
        let Ok(stdout) = self.run_tmux(&["display-message", "-t", target, "-p", &format]) else {
            return Ok(None);
        };
        let parts = stdout.trim().split('|').collect::<Vec<_>>();
        if parts.len() < 9 {
            return Ok(None);
        }

        let cwd = parts[7];
        let git_branch = self
            .run_git(&["-C", cwd, "branch", "--show-current"])
            .unwrap_or_default()
            .trim()
            .to_string();
        let git_status = self
            .run_git(&["-C", cwd, "status", "--short"])
            .unwrap_or_default()
            .trim_end()
            .to_string();
        let content = self.capture_pane_content(target).unwrap_or_default();

        Ok(Some(PaneDetail {
            target: parts[0].to_string(),
            pid: parts[1].to_string(),
            command: parts[2].to_string(),
            title: parts[3].to_string(),
            width: parts[4].to_string(),
            height: parts[5].to_string(),
            started_at: parts[6].to_string(),
            cwd: cwd.to_string(),
            tty: parts[8].to_string(),
            git_branch,
            git_status,
            model: parse_model(&content),
            session_id: parse_session_id(&content),
        }))
    }

    pub fn get_pane_token_usage(
        &self,
        target: &str,
        home_dir: impl AsRef<Path>,
    ) -> Result<TokenUsage, String> {
        if !is_valid_target(target) {
            return Ok(create_empty_token_usage(TokenUsageSource::None));
        }

        // Preserve the previous IPC contract: token usage failures resolve
        // to an empty usage object when tmux metadata is unavailable.
        let Ok(meta) = self.run_tmux(&[
            "display-message",
            "-t",
            target,
            "-p",
            "#{pane_current_command}|#{pane_title}|#{pane_current_path}",
        ]) else {
            return Ok(create_empty_token_usage(TokenUsageSource::None));
        };
        let parts = meta.trim().split('|').collect::<Vec<_>>();
        if parts.len() < 3 {
            return Ok(create_empty_token_usage(TokenUsageSource::None));
        }
        let content = self.capture_pane_content(target).unwrap_or_default();

        if is_codex_pane(parts[0], parts[1]) {
            let session_id = parse_session_id(&content);
            if let Some(path) = find_codex_session_jsonl(home_dir, &session_id, Some(parts[2])) {
                return Ok(get_token_usage_for_codex_jsonl(path));
            }
        } else if let Some(path) = self.find_claude_session_jsonl(target, home_dir.as_ref())? {
            return Ok(get_token_usage_for_claude_jsonl(path));
        }

        Ok(create_empty_token_usage(TokenUsageSource::None))
    }

    pub fn send_input(
        &self,
        target: &str,
        text: &str,
        vim_mode: bool,
        images: &[String],
    ) -> SendResult {
        if !is_valid_target(target) {
            return SendResult::error("Invalid target format");
        }

        let result = (|| -> Result<(), String> {
            let content = self.capture_pane_content(target).unwrap_or_default();
            let title_and_cmd = self.run_tmux(&[
                "display-message",
                "-t",
                target,
                "-p",
                "#{pane_title}|#{pane_current_command}",
            ])?;
            let (title, command) = title_and_cmd.trim().split_once('|').unwrap_or(("", ""));
            let status = detect_status(title, &content, command);
            let is_choice_response = status.status == PaneStatus::Waiting
                && text.len() == 1
                && text.chars().all(|c| c.is_ascii_digit() && c != '0');

            if !is_choice_response && vim_mode {
                self.run_tmux(&["send-keys", "-t", target, "Escape"])?;
                std::thread::sleep(Duration::from_millis(50));
                self.run_tmux(&["send-keys", "-t", target, "i"])?;
                std::thread::sleep(Duration::from_millis(100));
            }

            if !images.is_empty() {
                self.run_tmux(&["send-keys", "-t", target, "\u{1b}[200~"])?;
                self.run_tmux_owned(vec![
                    "send-keys".to_string(),
                    "-t".to_string(),
                    target.to_string(),
                    "-l".to_string(),
                    images.join(" "),
                ])?;
                self.run_tmux(&["send-keys", "-t", target, "\u{1b}[201~"])?;
                std::thread::sleep(Duration::from_millis(500));
            }

            let is_codex = is_codex_command(command);
            let has_newlines = text.contains('\n');
            if is_codex {
                let resolved = if is_choice_response {
                    resolve_codex_choice_input(text, &status.choices)
                } else {
                    ResolvedCodexChoice {
                        text: text.to_string(),
                        submit: true,
                        key: None,
                    }
                };
                match resolved.key {
                    Some(CodexChoiceKey::Escape) => {
                        self.run_tmux(&["send-keys", "-t", target, "Escape"])?;
                    }
                    None if !resolved.text.is_empty() => {
                        self.run_tmux_owned(vec![
                            "send-keys".to_string(),
                            "-t".to_string(),
                            target.to_string(),
                            "-l".to_string(),
                            resolved.text,
                        ])?;
                    }
                    None => {}
                }
                if resolved.submit {
                    self.run_tmux_owned(vec![
                        "run-shell".to_string(),
                        format!(
                            "{} send-keys -t {target} Enter",
                            self.runner.tmux_program_for_run_shell()
                        ),
                    ])?;
                }
            } else if has_newlines {
                let trimmed = text.trim_end_matches('\n');
                self.run_tmux(&["send-keys", "-t", target, "\u{1b}[200~"])?;
                self.run_tmux_owned(vec![
                    "send-keys".to_string(),
                    "-t".to_string(),
                    target.to_string(),
                    "-l".to_string(),
                    trimmed.to_string(),
                ])?;
                self.run_tmux(&["send-keys", "-t", target, "\u{1b}[201~"])?;
                std::thread::sleep(Duration::from_millis(300));
                self.run_tmux(&["send-keys", "-t", target, "", "Enter"])?;
            } else if !text.is_empty() {
                self.run_tmux(&["send-keys", "-t", target, "-l", text])?;
                self.run_tmux(&["send-keys", "-t", target, "Enter"])?;
            } else {
                self.run_tmux(&["send-keys", "-t", target, "Enter"])?;
            }

            Ok(())
        })();

        match result {
            Ok(()) => SendResult::ok(),
            Err(error) => SendResult::error(error),
        }
    }

    pub fn git_add_files(&self, cwd: &str, files: &[String]) -> SendResult {
        let mut args = vec![
            "-C".to_string(),
            cwd.to_string(),
            "add".to_string(),
            "--".to_string(),
        ];
        args.extend(files.iter().cloned());
        self.runner
            .run_git(&args)
            .map(|_| SendResult::ok())
            .unwrap_or_else(SendResult::error)
    }

    pub fn git_add(&self, cwd: &str) -> SendResult {
        self.run_git(&["-C", cwd, "add", "-A"])
            .map(|_| SendResult::ok())
            .unwrap_or_else(SendResult::error)
    }

    pub fn git_commit(&self, cwd: &str, message: &str) -> SendResult {
        self.run_git(&["-C", cwd, "commit", "-m", message])
            .map(|_| SendResult::ok())
            .unwrap_or_else(SendResult::error)
    }

    pub fn git_push(&self, cwd: &str) -> SendResult {
        self.run_git(&["-C", cwd, "push"])
            .map(|_| SendResult::ok())
            .unwrap_or_else(SendResult::error)
    }

    pub fn git_diff(&self, cwd: &str, staged: bool) -> Result<String, String> {
        let mut args = vec!["-C".to_string(), cwd.to_string(), "diff".to_string()];
        if staged {
            args.push("--staged".to_string());
        }
        // The previous desktop shell returned an empty diff on git failure so diff overlay
        // refreshes do not reject while files or repos are changing.
        Ok(self.runner.run_git(&args).unwrap_or_default())
    }

    pub fn capture_pane(&self, target: &str) -> Result<String, String> {
        if !is_valid_target(target) {
            return Ok(String::new());
        }
        // The previous desktop shell returned an empty capture on tmux failure so preview and
        // stream polling survive panes closing between selection and capture.
        let output = self
            .run_tmux(&["capture-pane", "-t", target, "-p", "-S", "-500"])
            .unwrap_or_default();
        Ok(trim_cli_footer(&strip_ansi(&output)))
    }

    pub fn capture_pane_with_history(
        &self,
        target: &str,
        home_dir: impl AsRef<Path>,
    ) -> Result<String, String> {
        let capture = self.capture_pane(target)?;
        let history = self
            .get_conversation_text(target, home_dir)
            .unwrap_or_default();
        Ok(combine_history_and_capture(&history, &capture))
    }

    pub fn get_conversation_text(
        &self,
        target: &str,
        home_dir: impl AsRef<Path>,
    ) -> Result<String, String> {
        let Some(jsonl_path) = self.find_claude_session_jsonl(target, home_dir.as_ref())? else {
            return Ok(String::new());
        };
        Ok(read_claude_conversation_jsonl(&jsonl_path))
    }

    pub fn list_tmux_sessions(&self) -> Result<Vec<String>, String> {
        let stdout = self.run_tmux(&["list-sessions", "-F", "#{session_name}"])?;
        Ok(stdout
            .lines()
            .filter(|line| !line.is_empty())
            .map(str::to_string)
            .collect())
    }

    pub fn create_session(
        &self,
        session_name: &str,
        command: &str,
        cwd: Option<&str>,
    ) -> SendResult {
        let mut args = vec![
            "new-window".to_string(),
            "-a".to_string(),
            "-t".to_string(),
            session_name.to_string(),
        ];
        if let Some(cwd) = cwd {
            args.extend(["-c".to_string(), cwd.to_string()]);
        }
        args.push(command.to_string());
        self.runner
            .run_tmux(&args)
            .map(|_| SendResult::ok())
            .unwrap_or_else(SendResult::error)
    }

    pub fn create_new_session(
        &self,
        session_name: &str,
        command: &str,
        cwd: Option<&str>,
    ) -> SendResult {
        let mut args = vec![
            "new-session".to_string(),
            "-d".to_string(),
            "-s".to_string(),
            session_name.to_string(),
        ];
        if let Some(cwd) = cwd {
            args.extend(["-c".to_string(), cwd.to_string()]);
        }
        args.push(command.to_string());
        self.runner
            .run_tmux(&args)
            .map(|_| SendResult::ok())
            .unwrap_or_else(SendResult::error)
    }

    pub fn kill_pane(&self, target: &str) -> SendResult {
        if !is_valid_target(target) {
            return SendResult::error("Invalid target format");
        }
        self.run_tmux(&["kill-pane", "-t", target])
            .map(|_| SendResult::ok())
            .unwrap_or_else(SendResult::error)
    }

    pub fn find_shell_pane(&self, session: &str) -> Result<Option<String>, String> {
        let format = "#{session_name}:#{window_index}.#{pane_index}|#{window_name}";
        let stdout = self.run_tmux(&["list-panes", "-a", "-F", format])?;
        for line in stdout.lines() {
            let Some((target, window_name)) = line.split_once('|') else {
                continue;
            };
            if target.starts_with(&format!("{session}:")) && window_name == "unitmux-shell" {
                return Ok(Some(target.to_string()));
            }
        }
        Ok(None)
    }

    pub fn ensure_shell_pane(&self, session: &str, cwd: &str) -> ShellPaneResult {
        let result = (|| -> Result<String, String> {
            if let Some(existing) = self.find_shell_pane(session)? {
                return Ok(existing);
            }

            let current_window = self
                .run_tmux(&["display-message", "-t", session, "-p", "#{window_index}"])?
                .trim()
                .to_string();

            let mut args = vec![
                "new-window".to_string(),
                "-t".to_string(),
                session.to_string(),
                "-n".to_string(),
                "unitmux-shell".to_string(),
            ];
            if !cwd.is_empty() {
                args.extend(["-c".to_string(), cwd.to_string()]);
            }
            self.runner.run_tmux(&args)?;
            self.run_tmux(&[
                "select-window",
                "-t",
                &format!("{session}:{current_window}"),
            ])?;

            self.find_shell_pane(session)?
                .ok_or_else(|| "Shell pane created but not found".to_string())
        })();

        result
            .map(ShellPaneResult::ok)
            .unwrap_or_else(ShellPaneResult::error)
    }

    fn capture_pane_content(&self, target: &str) -> Result<String, String> {
        self.run_tmux(&["capture-pane", "-t", target, "-p"])
            .map(|output| strip_ansi(&output))
    }

    fn find_claude_session_jsonl(
        &self,
        target: &str,
        home_dir: &Path,
    ) -> Result<Option<std::path::PathBuf>, String> {
        if !is_valid_target(target) {
            return Ok(None);
        }
        let info = self.run_tmux(&[
            "display-message",
            "-t",
            target,
            "-p",
            "#{pane_pid}|#{pane_current_path}",
        ])?;
        let Some((pid, cwd)) = info.trim().split_once('|') else {
            return Ok(None);
        };

        let claude_dir = home_dir.join(".claude");
        let sessions_dir = claude_dir.join("sessions");
        let resolve_by_pid = |pid: &str| -> Option<std::path::PathBuf> {
            let session_json = fs::read_to_string(sessions_dir.join(format!("{pid}.json"))).ok()?;
            let data = serde_json::from_str::<Value>(&session_json).ok()?;
            let cwd = data.get("cwd")?.as_str()?;
            let session_id = data.get("sessionId")?.as_str()?;
            Some(
                claude_dir
                    .join("projects")
                    .join(encode_cwd(cwd))
                    .join(format!("{session_id}.jsonl")),
            )
        };

        if let Some(path) = resolve_by_pid(pid) {
            return Ok(Some(path));
        }

        for child_pid in find_descendant_pids(pid, 3) {
            if let Some(path) = resolve_by_pid(&child_pid) {
                return Ok(Some(path));
            }
        }

        let mut best: Option<(std::path::PathBuf, i64)> = None;
        for entry in fs::read_dir(&sessions_dir).into_iter().flatten().flatten() {
            let path = entry.path();
            if path.extension().and_then(|ext| ext.to_str()) != Some("json") {
                continue;
            }
            let Ok(session_json) = fs::read_to_string(&path) else {
                continue;
            };
            let Ok(data) = serde_json::from_str::<Value>(&session_json) else {
                continue;
            };
            if data.get("cwd").and_then(Value::as_str) != Some(cwd) {
                continue;
            }
            let Some(session_id) = data.get("sessionId").and_then(Value::as_str) else {
                continue;
            };
            let started_at = data
                .get("startedAt")
                .and_then(Value::as_i64)
                .unwrap_or_default();
            let jsonl_path = claude_dir
                .join("projects")
                .join(encode_cwd(cwd))
                .join(format!("{session_id}.jsonl"));
            if jsonl_path.exists()
                && best
                    .as_ref()
                    .is_none_or(|(_, best_started_at)| started_at > *best_started_at)
            {
                best = Some((jsonl_path, started_at));
            }
        }

        Ok(best.map(|(path, _)| path))
    }

    fn run_tmux(&self, args: &[&str]) -> Result<String, String> {
        self.runner
            .run_tmux(&args.iter().map(|arg| arg.to_string()).collect::<Vec<_>>())
    }

    fn run_tmux_owned(&self, args: Vec<String>) -> Result<String, String> {
        self.runner.run_tmux(&args)
    }

    fn run_git(&self, args: &[&str]) -> Result<String, String> {
        self.runner
            .run_git(&args.iter().map(|arg| arg.to_string()).collect::<Vec<_>>())
    }
}

fn parse_pane_line(line: &str) -> Option<TmuxPane> {
    let mut parts = line.split('|');
    Some(TmuxPane {
        target: parts.next()?.to_string(),
        pid: parts.next()?.to_string(),
        command: parts.next()?.to_string(),
        title: parts.next()?.to_string(),
        status: PaneStatus::Busy,
        choices: Vec::new(),
        prompt: String::new(),
        activity_line: String::new(),
    })
}

fn normalize_supported_pane(mut pane: TmuxPane) -> Option<TmuxPane> {
    if is_codex_command(&pane.command) {
        pane.command = "codex".to_string();
        return Some(pane);
    }
    if is_claude_command(&pane.command) {
        pane.command = "claude".to_string();
        return Some(pane);
    }
    if pane.command.to_ascii_lowercase().starts_with("ai")
        && pane
            .command
            .get(2..)
            .is_some_and(|suffix| suffix.is_empty() || suffix.starts_with('-'))
    {
        return Some(pane);
    }
    if pane.title.starts_with('✳')
        || pane
            .title
            .chars()
            .next()
            .is_some_and(|c| ('\u{2800}'..='\u{28ff}').contains(&c))
    {
        pane.command = "claude".to_string();
        return Some(pane);
    }
    let title_lower = pane.title.to_ascii_lowercase();
    if title_lower.contains("codex") {
        pane.command = "codex".to_string();
        return Some(pane);
    }
    if title_lower.contains("claude") {
        pane.command = "claude".to_string();
        return Some(pane);
    }
    None
}

fn is_valid_target(target: &str) -> bool {
    let Some((session, rest)) = target.split_once(':') else {
        return false;
    };
    if session.is_empty()
        || !session
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || matches!(c, '_' | '-'))
    {
        return false;
    }
    let Some((window, pane)) = rest.split_once('.') else {
        return false;
    };
    !window.is_empty()
        && !pane.is_empty()
        && window.chars().all(|c| c.is_ascii_digit())
        && pane.chars().all(|c| c.is_ascii_digit())
}

fn encode_cwd(cwd: &str) -> String {
    cwd.replace(['/', '.'], "-")
}

fn find_descendant_pids(pid: &str, max_depth: usize) -> Vec<String> {
    let mut result = Vec::new();
    let mut queue = vec![(pid.to_string(), 0usize)];
    while let Some((current_pid, depth)) = queue.pop() {
        if depth >= max_depth {
            continue;
        }
        let Ok(output) = Command::new("pgrep").arg("-P").arg(&current_pid).output() else {
            continue;
        };
        if !output.status.success() {
            continue;
        }
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let child_pid = line.trim();
            if child_pid.is_empty() {
                continue;
            }
            result.push(child_pid.to_string());
            queue.push((child_pid.to_string(), depth + 1));
        }
    }
    result
}

pub fn strip_ansi(text: &str) -> String {
    let mut output = String::with_capacity(text.len());
    let mut chars = text.chars().peekable();
    while let Some(ch) = chars.next() {
        if ch != '\u{1b}' {
            output.push(ch);
            continue;
        }

        match chars.next() {
            Some('[') => {
                for next in chars.by_ref() {
                    if next.is_ascii_alphabetic() {
                        break;
                    }
                }
            }
            Some(']') => {
                while let Some(next) = chars.next() {
                    if next == '\u{7}' {
                        break;
                    }
                    if next == '\u{1b}' && chars.peek() == Some(&'\\') {
                        chars.next();
                        break;
                    }
                }
            }
            Some('(' | ')') => {
                chars.next();
            }
            Some('>' | '=') => {}
            Some(_) | None => {}
        }
    }
    output
}

fn combine_history_and_capture(history: &str, capture: &str) -> String {
    match (history.is_empty(), capture.is_empty()) {
        (true, true) => String::new(),
        (true, false) => capture.to_string(),
        (false, true) => history.to_string(),
        (false, false) => format!("{history}\n\n── live ──────────────────────\n\n{capture}"),
    }
}

fn read_claude_conversation_jsonl(path: &Path) -> String {
    let Ok(raw) = fs::read_to_string(path) else {
        return String::new();
    };
    let mut parts = Vec::new();
    for line in raw.lines().filter(|line| !line.trim().is_empty()) {
        let Ok(record) = serde_json::from_str::<Value>(line) else {
            continue;
        };
        match (
            record.get("type").and_then(Value::as_str),
            record
                .get("message")
                .and_then(|message| message.get("role"))
                .and_then(Value::as_str),
        ) {
            (Some("user"), Some("user")) => {
                let text = record
                    .get("message")
                    .and_then(|message| message.get("content"))
                    .and_then(Value::as_str)
                    .map(str::trim)
                    .unwrap_or_default();
                if !text.is_empty() {
                    parts.push(format!("> {text}"));
                }
            }
            (Some("assistant"), Some("assistant")) => {
                let Some(blocks) = record
                    .get("message")
                    .and_then(|message| message.get("content"))
                    .and_then(Value::as_array)
                else {
                    continue;
                };
                for block in blocks {
                    if block.get("type").and_then(Value::as_str) != Some("text") {
                        continue;
                    }
                    let text = block
                        .get("text")
                        .and_then(Value::as_str)
                        .map(str::trim)
                        .unwrap_or_default();
                    if !text.is_empty() {
                        parts.push(text.to_string());
                    }
                }
            }
            _ => {}
        }
    }
    parts.join("\n\n")
}

fn is_codex_command(command: &str) -> bool {
    command.eq_ignore_ascii_case("codex")
        || command
            .to_ascii_lowercase()
            .strip_prefix("codex")
            .is_some_and(|suffix| suffix.starts_with('-'))
}

fn is_claude_command(command: &str) -> bool {
    command.eq_ignore_ascii_case("claude")
        || command
            .to_ascii_lowercase()
            .strip_prefix("claude")
            .is_some_and(|suffix| suffix.starts_with('-'))
}

fn is_codex_pane(command: &str, title: &str) -> bool {
    is_codex_command(command) || title.to_ascii_lowercase().contains("codex")
}

fn parse_model(content: &str) -> String {
    for line in content.lines() {
        for marker in [
            "claude-opus",
            "claude-sonnet",
            "claude-haiku",
            "claude-",
            "gpt-",
            "codex-",
        ] {
            if let Some(index) = line.to_ascii_lowercase().find(marker) {
                return line[index..]
                    .split_whitespace()
                    .next()
                    .unwrap_or_default()
                    .trim_matches(',')
                    .to_string();
            }
        }
        let lower = line.to_ascii_lowercase();
        if let Some(index) = lower.find("model:") {
            return line[index + "model:".len()..]
                .trim()
                .split([',', ' '])
                .next()
                .unwrap_or_default()
                .to_string();
        }
        for family in ["opus", "sonnet", "haiku"] {
            if let Some(index) = lower.find(family) {
                let rest = &line[index..];
                let mut words = rest.split_whitespace();
                if let (Some(name), Some(version)) = (words.next(), words.next()) {
                    if version.chars().next().is_some_and(|c| c.is_ascii_digit()) {
                        return format!("{name} {version}");
                    }
                }
            }
        }
    }
    String::new()
}

fn parse_session_id(content: &str) -> String {
    for line in content.lines() {
        let lower = line.to_ascii_lowercase();
        if let Some(index) = lower.find("session id:").or_else(|| lower.find("session:")) {
            let value_start = line[index..].find(':').map(|colon| index + colon + 1);
            if let Some(value_start) = value_start {
                if let Some(value) = line[value_start..]
                    .split_whitespace()
                    .find(|part| looks_like_session_id(part))
                {
                    return clean_session_id(value);
                }
            }
        }
        if let Some(value) = line.split_whitespace().find(|part| looks_like_uuid(part)) {
            return clean_session_id(value);
        }
    }
    String::new()
}

fn looks_like_session_id(value: &str) -> bool {
    let cleaned = clean_session_id(value);
    cleaned.len() >= 8 && cleaned.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

fn looks_like_uuid(value: &str) -> bool {
    let cleaned = clean_session_id(value);
    let parts = cleaned.split('-').map(str::len).collect::<Vec<_>>();
    parts == [8, 4, 4, 4, 12] && cleaned.chars().all(|c| c.is_ascii_hexdigit() || c == '-')
}

fn clean_session_id(value: &str) -> String {
    value
        .trim_matches(|c: char| !(c.is_ascii_hexdigit() || c == '-'))
        .to_string()
}

fn is_marker(c: char) -> bool {
    matches!(c, '❯' | '›' | '>' | '☞' | '●')
}

fn parse_numbered_choice_line(line: &str) -> Option<TmuxChoice> {
    let trimmed = line.trim_start();
    let trimmed = trimmed
        .chars()
        .next()
        .filter(|c| is_marker(*c))
        .map(|c| trimmed[c.len_utf8()..].trim_start())
        .unwrap_or(trimmed);

    let digit_len = trimmed
        .chars()
        .take_while(|c| c.is_ascii_digit())
        .map(char::len_utf8)
        .sum::<usize>();
    if digit_len == 0 {
        return None;
    }
    let rest = trimmed[digit_len..].trim_start();
    let separator = rest.chars().next()?;
    if !matches!(separator, '.' | ':' | ')') {
        return None;
    }
    let label = rest[separator.len_utf8()..].trim_start();
    if label.is_empty() {
        return None;
    }
    Some(TmuxChoice {
        number: trimmed[..digit_len].to_string(),
        label: label.to_string(),
    })
}

fn parse_inline_choices(line: &str) -> Vec<TmuxChoice> {
    let mut choices = Vec::new();
    let bytes = line.as_bytes();
    let mut index = 0;

    while index < bytes.len() {
        while index < bytes.len() && !bytes[index].is_ascii_digit() {
            index += 1;
        }
        let number_start = index;
        while index < bytes.len() && bytes[index].is_ascii_digit() {
            index += 1;
        }
        if number_start == index {
            break;
        }
        if index >= bytes.len() || !matches!(bytes[index], b'.' | b':' | b')') {
            continue;
        }
        index += 1;
        while index < bytes.len() && bytes[index].is_ascii_whitespace() {
            index += 1;
        }
        let label_start = index;
        while index < bytes.len() {
            let next = &line[index..];
            if next.starts_with("  ")
                && next
                    .trim_start()
                    .chars()
                    .next()
                    .is_some_and(|c| c.is_ascii_digit())
            {
                break;
            }
            index += line[index..]
                .chars()
                .next()
                .map(char::len_utf8)
                .unwrap_or(1);
        }
        let label = line[label_start..index].trim();
        if !label.is_empty() {
            choices.push(TmuxChoice {
                number: line[number_start
                    ..number_start
                        + (line[number_start..]
                            .chars()
                            .take_while(|c| c.is_ascii_digit())
                            .map(char::len_utf8)
                            .sum::<usize>())]
                    .to_string(),
                label: label.to_string(),
            });
        }
    }

    if choices.len() >= 2 {
        choices
    } else {
        Vec::new()
    }
}

fn is_survey_choices(choices: &[TmuxChoice]) -> bool {
    !choices.is_empty()
        && choices.iter().all(|choice| {
            matches!(
                choice.label.to_ascii_lowercase().as_str(),
                "bad" | "fine" | "good" | "great" | "dismiss" | "skip"
            )
        })
}

fn has_optional_context(lines: &[&str], center_index: usize) -> bool {
    let start = center_index.saturating_sub(3);
    let end = (center_index + 1).min(lines.len().saturating_sub(1));
    lines[start..=end]
        .iter()
        .any(|line| line.to_ascii_lowercase().contains("(optional)"))
}

fn strip_choice_footer(lines: &mut Vec<&str>) {
    while lines.last().is_some_and(|line| line.trim().is_empty()) {
        lines.pop();
    }

    loop {
        let Some(last) = lines.last() else {
            break;
        };
        let trimmed = last.trim();
        if is_cli_footer_line(trimmed) {
            lines.pop();
            while lines.last().is_some_and(|line| line.trim().is_empty()) {
                lines.pop();
            }
        } else {
            break;
        }
    }
}

pub fn parse_choices(content: &str) -> Vec<TmuxChoice> {
    let mut all_lines = content.lines().collect::<Vec<_>>();
    strip_choice_footer(&mut all_lines);
    let start = all_lines.len().saturating_sub(50);
    let lines = &all_lines[start..];

    let mut choices = Vec::new();
    let mut in_choice_block = false;
    for (index, line) in lines.iter().enumerate() {
        let inline = parse_inline_choices(line);
        if inline.len() >= 2 {
            let prev_line = index
                .checked_sub(1)
                .and_then(|i| lines.get(i))
                .copied()
                .unwrap_or("");
            if prev_line
                .to_ascii_lowercase()
                .contains("how is claude doing")
                || is_survey_choices(&inline)
                || has_optional_context(lines, index)
            {
                continue;
            }
            in_choice_block = true;
            choices.extend(inline);
            continue;
        }

        if let Some(choice) = parse_numbered_choice_line(line) {
            in_choice_block = true;
            choices.push(choice);
            continue;
        }

        if in_choice_block {
            if line.trim().is_empty() || line.starts_with(char::is_whitespace) {
                continue;
            }
            in_choice_block = false;
        }
    }

    if is_survey_choices(&choices) {
        Vec::new()
    } else {
        choices
    }
}

fn parse_activity_line(content: &str) -> String {
    let lines = content.lines().collect::<Vec<_>>();
    let start = lines.len().saturating_sub(20);
    lines[start..]
        .iter()
        .rev()
        .map(|line| line.trim())
        .find(|line| {
            line.chars()
                .next()
                .is_some_and(|c| c == '✻' || c == '⏺' || ('\u{2800}'..='\u{28ff}').contains(&c))
                && line.contains('…')
        })
        .unwrap_or("")
        .to_string()
}

fn parse_prompt(content: &str) -> String {
    let mut prompt_lines = Vec::new();
    let mut past_choices = false;
    for line in content.lines().rev() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            if past_choices {
                break;
            }
            continue;
        }
        if parse_numbered_choice_line(trimmed).is_some() || trimmed.starts_with("Esc to cancel") {
            past_choices = true;
            continue;
        }
        if past_choices {
            if trimmed.chars().all(|c| c == '─') {
                break;
            }
            prompt_lines.push(trimmed.to_string());
        }
    }
    prompt_lines.reverse();
    prompt_lines.join("\n").trim().to_string()
}

pub fn detect_status_claude(title: &str, content: &str) -> StatusDetection {
    let choices = parse_choices(content);
    if !choices.is_empty() {
        return StatusDetection {
            status: PaneStatus::Waiting,
            choices,
            prompt: parse_prompt(content),
            activity_line: String::new(),
        };
    }

    if !title.contains('✳') {
        return StatusDetection {
            status: PaneStatus::Busy,
            choices: Vec::new(),
            prompt: String::new(),
            activity_line: parse_activity_line(content),
        };
    }

    let tail = content
        .lines()
        .rev()
        .take(10)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>()
        .join("\n");
    let tail_lower = tail.to_ascii_lowercase();
    if tail.contains("Yes / No")
        || tail_lower.contains("(y/n)")
        || tail_lower.contains("(yes/no)")
        || tail.contains("Allow for this session")
        || tail.contains("Do you want to")
    {
        return StatusDetection {
            status: PaneStatus::Waiting,
            choices: Vec::new(),
            prompt: parse_prompt(content),
            activity_line: String::new(),
        };
    }

    StatusDetection {
        status: PaneStatus::Idle,
        choices: Vec::new(),
        prompt: String::new(),
        activity_line: String::new(),
    }
}

fn has_codex_choice_context(content: &str) -> bool {
    let lower = content.to_ascii_lowercase();
    lower.contains("would you like")
        || lower.contains("which")
        || lower.contains("choose")
        || lower.contains("select")
        || content.contains("どれ")
        || content.contains("どちら")
        || content.contains("選択")
        || content.contains("選ん")
        || content.contains("選び")
        || content.contains("おすすめ")
        || content.contains("推奨")
        || content.contains("進めてよければ")
        || content.contains("よければ実装")
}

fn parse_codex_letter_choice(line: &str) -> Option<TmuxChoice> {
    let trimmed = line.trim_start();
    let trimmed = trimmed.strip_prefix('-')?.trim_start();
    let mut chars = trimmed.char_indices();
    let (_, key) = chars.next()?;
    if !key.is_ascii_uppercase() {
        return None;
    }
    let (after_key, next) = chars.next()?;
    if !matches!(next, '.' | ':' | ')' | ' ') {
        return None;
    }
    let label = trimmed[after_key + next.len_utf8()..].trim_start();
    if label.is_empty() {
        return None;
    }
    Some(TmuxChoice {
        number: key.to_string(),
        label: label.to_string(),
    })
}

fn parse_codex_explicit_choices(content: &str) -> Vec<TmuxChoice> {
    let all_lines = content.lines().collect::<Vec<_>>();
    let lines = &all_lines[all_lines.len().saturating_sub(50)..];
    let mut choices = Vec::new();
    let mut expected_letter = b'A';
    let mut expected_number = 1;
    let mut has_selected_marker = false;

    for line in lines {
        let letter = parse_codex_letter_choice(line);
        let number = parse_numbered_choice_line(line);
        let (candidate, is_letter) = match (letter, number) {
            (Some(choice), _) => (Some(choice), true),
            (None, Some(choice)) => (Some(choice), false),
            (None, None) => (None, false),
        };

        let Some(choice) = candidate else {
            if !choices.is_empty()
                && (line.trim().is_empty() || line.starts_with(char::is_whitespace))
            {
                continue;
            }
            if choices.len() >= 2 {
                break;
            }
            choices.clear();
            expected_letter = b'A';
            expected_number = 1;
            has_selected_marker = false;
            continue;
        };

        let expected = if is_letter {
            (expected_letter as char).to_string()
        } else {
            expected_number.to_string()
        };
        if choice.number != expected {
            choices.clear();
            expected_letter = b'A';
            expected_number = 1;
            has_selected_marker = false;
            let reset_expected = if is_letter {
                "A".to_string()
            } else {
                "1".to_string()
            };
            if choice.number != reset_expected {
                continue;
            }
        }

        if !is_letter && line.trim_start().chars().next().is_some_and(is_marker) {
            has_selected_marker = true;
        }
        choices.push(choice);
        if is_letter {
            expected_letter += 1;
        } else {
            expected_number += 1;
        }
    }

    if choices.len() < 2 {
        Vec::new()
    } else if has_selected_marker || has_codex_choice_context(content) {
        choices
    } else {
        Vec::new()
    }
}

pub fn detect_status_codex(content: &str) -> StatusDetection {
    let lines = content
        .lines()
        .rev()
        .take(15)
        .collect::<Vec<_>>()
        .into_iter()
        .rev()
        .collect::<Vec<_>>();
    let tail = lines.join("\n");
    let tail_lower = tail.to_ascii_lowercase();

    if [
        "working",
        "thinking",
        "reconnecting",
        "connecting",
        "executing",
    ]
    .iter()
    .any(|word| tail_lower.contains(word))
        || tail_lower.contains("esc to interrupt")
    {
        return StatusDetection {
            status: PaneStatus::Busy,
            choices: Vec::new(),
            prompt: String::new(),
            activity_line: parse_activity_line(content),
        };
    }

    let choices = parse_codex_explicit_choices(content);
    if !choices.is_empty() {
        return StatusDetection {
            status: PaneStatus::Waiting,
            choices,
            prompt: String::new(),
            activity_line: String::new(),
        };
    }

    if tail_lower.contains("enter to send")
        || (tail_lower.contains("send")
            && tail_lower.contains("newline")
            && tail_lower.contains("quit"))
    {
        let has_question = lines.iter().any(|line| {
            let trimmed = line.trim_start();
            trimmed.starts_with("- ") && trimmed.ends_with('?')
        });
        return StatusDetection {
            status: if has_question {
                PaneStatus::Waiting
            } else {
                PaneStatus::Idle
            },
            choices: Vec::new(),
            prompt: String::new(),
            activity_line: String::new(),
        };
    }

    StatusDetection {
        status: PaneStatus::Idle,
        choices: Vec::new(),
        prompt: String::new(),
        activity_line: String::new(),
    }
}

pub fn detect_status(title: &str, content: &str, command: &str) -> StatusDetection {
    if command.to_ascii_lowercase().starts_with("codex") {
        detect_status_codex(content)
    } else {
        detect_status_claude(title, content)
    }
}

pub fn resolve_codex_choice_input(text: &str, choices: &[TmuxChoice]) -> ResolvedCodexChoice {
    if let Some(choice) = choices.iter().find(|choice| choice.number == text) {
        let label = choice.label.trim_end();
        let shortcut = label.strip_suffix(')').and_then(|value| {
            value
                .rsplit_once('(')
                .map(|(_, suffix)| suffix.to_ascii_lowercase())
        });
        match shortcut.as_deref() {
            Some("esc") => {
                return ResolvedCodexChoice {
                    text: String::new(),
                    submit: false,
                    key: Some(CodexChoiceKey::Escape),
                };
            }
            Some("y" | "p") => {
                return ResolvedCodexChoice {
                    text: shortcut.unwrap(),
                    submit: false,
                    key: None,
                };
            }
            _ => {}
        }
    }

    ResolvedCodexChoice {
        text: text.to_string(),
        submit: true,
        key: None,
    }
}

fn is_cli_footer_line(trimmed: &str) -> bool {
    trimmed.chars().all(|c| c == '─')
        || trimmed.starts_with("Session")
        || trimmed.starts_with("Model")
        || trimmed == "❯"
        || trimmed.contains("plan mode")
        || trimmed.contains("compact mode")
        || trimmed.to_ascii_lowercase().contains("tokens")
        || trimmed.to_ascii_lowercase().contains(" cost")
        || trimmed.to_ascii_lowercase().contains(" spent")
        || (trimmed.starts_with("Ctrl")
            || trimmed.starts_with("Esc")
            || trimmed.starts_with("Enter"))
            && ["send", "cancel", "submit", "menu"]
                .iter()
                .any(|word| trimmed.to_ascii_lowercase().contains(word))
        || trimmed == ">"
}

pub fn trim_cli_footer(output: &str) -> String {
    let mut lines = output.lines().collect::<Vec<_>>();
    while lines.last().is_some_and(|line| line.trim().is_empty()) {
        lines.pop();
    }

    loop {
        let Some(last) = lines.last() else {
            break;
        };
        if is_cli_footer_line(last.trim()) {
            lines.pop();
            while lines.last().is_some_and(|line| line.trim().is_empty()) {
                lines.pop();
            }
        } else {
            break;
        }
    }

    lines.join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;
    use std::collections::HashMap;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn choice(number: &str, label: &str) -> TmuxChoice {
        TmuxChoice {
            number: number.to_string(),
            label: label.to_string(),
        }
    }

    fn args(values: &[&str]) -> Vec<String> {
        values.iter().map(|value| value.to_string()).collect()
    }

    #[derive(Default)]
    struct FakeRunner {
        tmux_outputs: HashMap<String, String>,
        tmux_sequences: RefCell<HashMap<String, Vec<String>>>,
        git_outputs: HashMap<String, String>,
        tmux_calls: RefCell<Vec<Vec<String>>>,
        git_calls: RefCell<Vec<Vec<String>>>,
    }

    impl FakeRunner {
        fn new() -> Self {
            Self::default()
        }

        fn with_tmux(mut self, command: &str, output: &str) -> Self {
            self.tmux_outputs
                .insert(command.to_string(), output.to_string());
            self
        }

        fn with_tmux_sequence(self, command: &str, outputs: Vec<String>) -> Self {
            self.tmux_sequences
                .borrow_mut()
                .insert(command.to_string(), outputs);
            self
        }

        fn with_git(mut self, command: &str, output: &str) -> Self {
            self.git_outputs
                .insert(command.to_string(), output.to_string());
            self
        }

        fn calls(&self) -> Vec<Vec<String>> {
            self.tmux_calls.borrow().clone()
        }

        fn git_calls(&self) -> Vec<Vec<String>> {
            self.git_calls.borrow().clone()
        }
    }

    impl CommandRunner for FakeRunner {
        fn run_tmux(&self, args: &[String]) -> Result<String, String> {
            self.tmux_calls.borrow_mut().push(args.to_vec());
            if let Some(sequence) = self
                .tmux_sequences
                .borrow_mut()
                .get_mut(args.first().map(String::as_str).unwrap_or_default())
            {
                if !sequence.is_empty() {
                    return Ok(sequence.remove(0));
                }
            }
            if matches!(
                args.first().map(String::as_str),
                Some(
                    "send-keys"
                        | "run-shell"
                        | "select-window"
                        | "new-window"
                        | "new-session"
                        | "kill-pane",
                )
            ) {
                return Ok(String::new());
            }
            self.tmux_outputs
                .get(args.first().map(String::as_str).unwrap_or_default())
                .cloned()
                .ok_or_else(|| format!("missing tmux output for {:?}", args))
        }

        fn run_git(&self, args: &[String]) -> Result<String, String> {
            self.git_calls.borrow_mut().push(args.to_vec());
            self.git_outputs
                .get(args.get(2).map(String::as_str).unwrap_or_default())
                .cloned()
                .ok_or_else(|| format!("missing git output for {:?}", args))
        }
    }

    #[test]
    fn parse_choices_detects_marker_style_choices() {
        let content = ["Do you want to proceed?", " ❯ 1. Yes", "   2. No"].join("\n");

        assert_eq!(
            parse_choices(&content),
            vec![choice("1", "Yes"), choice("2", "No")]
        );
    }

    #[test]
    fn parse_choices_detects_inline_choices() {
        let content = [
            "Pick a deployment target:",
            "  1: staging    2: production   3: dev",
        ]
        .join("\n");

        assert_eq!(
            parse_choices(&content),
            vec![
                choice("1", "staging"),
                choice("2", "production"),
                choice("3", "dev"),
            ]
        );
    }

    #[test]
    fn parse_choices_ignores_optional_survey() {
        let content = [
            "● How is Claude doing this session? (optional)",
            "  1: Bad    2: Fine   3: Good   0: Dismiss",
        ]
        .join("\n");

        assert_eq!(parse_choices(&content), Vec::<TmuxChoice>::new());
    }

    #[test]
    fn parse_choices_ignores_marker_survey_labels() {
        let content = [
            "Rate this response",
            " ❯ 1. Bad",
            "   2. Fine",
            "   3. Good",
        ]
        .join("\n");

        assert_eq!(parse_choices(&content), Vec::<TmuxChoice>::new());
    }

    #[test]
    fn parse_choices_detects_dot_choices_with_marker() {
        let content = [
            "Some prompt text",
            " ● 1. Option A",
            "   2. Option B",
            "   3. Option C",
        ]
        .join("\n");

        assert_eq!(
            parse_choices(&content),
            vec![
                choice("1", "Option A"),
                choice("2", "Option B"),
                choice("3", "Option C"),
            ]
        );
    }

    #[test]
    fn parse_choices_returns_empty_without_choices() {
        let content = ["⏺ Here is a normal response.", "", "Some more text."].join("\n");

        assert_eq!(parse_choices(&content), Vec::<TmuxChoice>::new());
    }

    #[test]
    fn parse_choices_detects_long_multiline_choice_block() {
        let command_lines =
            std::iter::repeat_n(r#"    $RG -n "\bfoo\b" $BASE --glob "**/*.{ts,tsx}""#, 25);
        let content = [
            "Do you want to proceed?",
            " ❯ 1. Yes",
            "   2. Yes, and don't ask again for: BASE=/some/path",
            "               RG=/opt/homebrew/bin/rg",
            "",
        ]
        .into_iter()
        .chain(command_lines)
        .chain(["   3. No", "", "Esc to cancel"])
        .collect::<Vec<_>>()
        .join("\n");

        assert_eq!(
            parse_choices(&content)
                .iter()
                .map(|choice| choice.number.as_str())
                .collect::<Vec<_>>(),
            vec!["1", "2", "3"]
        );
    }

    #[test]
    fn parse_choices_handles_bash_tool_permission_prompt() {
        let content = [
            " Bash command",
            "",
            r#"   node -e "some code""#,
            "",
            " Command contains consecutive quote characters",
            "",
            " Do you want to proceed?",
            " ❯ 1. Yes",
            "   2. No",
        ]
        .join("\n");

        assert_eq!(
            parse_choices(&content),
            vec![choice("1", "Yes"), choice("2", "No")]
        );
    }

    #[test]
    fn parse_choices_handles_footer_padding() {
        let mut lines = vec![
            "Do you want to proceed?".to_string(),
            " ❯ 1. Yes".to_string(),
            "   2. Yes, and don't ask again for: brew upgrade:*".to_string(),
            "   3. No".to_string(),
            String::new(),
        ];
        lines.extend(std::iter::repeat_n(String::new(), 35));
        lines.extend([
            "──────────────────────────────────────────".to_string(),
            "❯ ".to_string(),
            "──────────────────────────────────────────".to_string(),
            "  Session ID: abc123 | main | Ctx: 83.5k".to_string(),
            "  Model: Opus 4.6 (1M context)".to_string(),
            String::new(),
        ]);

        assert_eq!(
            parse_choices(&lines.join("\n")),
            vec![
                choice("1", "Yes"),
                choice("2", "Yes, and don't ask again for: brew upgrade:*"),
                choice("3", "No"),
            ]
        );
    }

    #[test]
    fn detect_status_claude_prioritizes_choices_over_busy_title() {
        let content = [" Do you want to proceed?", " ❯ 1. Yes", "   2. No"].join("\n");

        let result = detect_status_claude("⠂ Claude Code", &content);

        assert_eq!(result.status, PaneStatus::Waiting);
        assert_eq!(result.choices, vec![choice("1", "Yes"), choice("2", "No")]);
    }

    #[test]
    fn detect_status_codex_detects_numbered_option_prompt() {
        let content = [
            "この設計で進めてよければ実装に入ります。",
            "",
            "  1. 左ペインはファイル一覧だけ",
            "     modified/path.ts +12 -3 のように表示し、j/k または n/N で移動、Enter/o で開閉、クリックでジャンプ。",
            "  2. ディレクトリツリー風に折りたたむ",
            "     src/renderer/... をツリー化します。",
            "  3. Git overlay と同じ行リストを差分内に再利用",
            "     見た目の統一はしやすいですが、責務が違います。",
            "",
            "おすすめは 1 です。",
        ]
        .join("\n");

        let result = detect_status_codex(&content);

        assert_eq!(result.status, PaneStatus::Waiting);
        assert_eq!(
            result.choices,
            vec![
                choice("1", "左ペインはファイル一覧だけ"),
                choice("2", "ディレクトリツリー風に折りたたむ"),
                choice("3", "Git overlay と同じ行リストを差分内に再利用"),
            ]
        );
    }

    #[test]
    fn detect_status_codex_detects_lettered_option_prompt() {
        let content = [
            "次の確認です。フェーズ1のルーム参加導線はどれにしますか？",
            "",
            "  - A 推奨: ルーム作成後に /rooms/$roomId のURL共有で参加",
            "  - B 6桁程度のルームコード入力で参加",
            "  - C 両方対応: URL共有とルームコード参加の両方",
            "",
            "おすすめは C です。",
        ]
        .join("\n");

        let result = detect_status_codex(&content);

        assert_eq!(result.status, PaneStatus::Waiting);
        assert_eq!(
            result.choices,
            vec![
                choice("A", "推奨: ルーム作成後に /rooms/$roomId のURL共有で参加"),
                choice("B", "6桁程度のルームコード入力で参加"),
                choice("C", "両方対応: URL共有とルームコード参加の両方"),
            ]
        );
    }

    #[test]
    fn detect_status_codex_ignores_ordinary_bullet_lists() {
        let content = [
            "実装内容です。",
            "",
            "  - 設定画面に Coming soon を表示",
            "  - 問題管理を一覧閲覧のみに制限",
            "",
            "Enter to send",
        ]
        .join("\n");

        let result = detect_status_codex(&content);

        assert_eq!(result.status, PaneStatus::Idle);
        assert_eq!(result.choices, Vec::<TmuxChoice>::new());
    }

    #[test]
    fn detect_status_codex_does_not_treat_verification_steps_as_choices() {
        let content = [
            "最低限この順で確認すると効率がいいです。",
            "",
            "  1. .env に Firebase 設定を入れる",
            "  2. aube seed で10件登録",
            "  3. aube dev で / と /play を確認",
            "  4. /results まで1周遊ぶ",
            "",
            "特に rooms 周りは、通常ブラウザ + シークレットで見るのが重要です。",
        ]
        .join("\n");

        let result = detect_status_codex(&content);

        assert_eq!(result.status, PaneStatus::Idle);
        assert_eq!(result.choices, Vec::<TmuxChoice>::new());
    }

    #[test]
    fn detect_status_routes_codex_variant_commands_to_codex_detection() {
        let content = [
            "Would you like to run the following command?",
            "",
            "  1. Yes, proceed (y)",
            "› 2. Yes, and don't ask again for commands that start with `tmux capture-pane` (p)",
            "  3. No, and tell Codex what to do differently (esc)",
        ]
        .join("\n");

        let result = detect_status("unitmux", &content, "codex-aarch64-a");

        assert_eq!(result.status, PaneStatus::Waiting);
        assert_eq!(
            result
                .choices
                .iter()
                .map(|choice| choice.number.as_str())
                .collect::<Vec<_>>(),
            vec!["1", "2", "3"]
        );
    }

    #[test]
    fn resolve_codex_approval_menu_numbers_to_shortcut_keys() {
        let choices = vec![
            choice("1", "Yes, proceed (y)"),
            choice(
                "2",
                "Yes, and don't ask again for commands that start with `gh auth status` (p)",
            ),
            choice("3", "No, and tell Codex what to do differently (esc)"),
        ];

        assert_eq!(
            resolve_codex_choice_input("1", &choices),
            ResolvedCodexChoice {
                text: "y".to_string(),
                submit: false,
                key: None,
            }
        );
        assert_eq!(
            resolve_codex_choice_input("2", &choices),
            ResolvedCodexChoice {
                text: "p".to_string(),
                submit: false,
                key: None,
            }
        );
        assert_eq!(
            resolve_codex_choice_input("3", &choices),
            ResolvedCodexChoice {
                text: String::new(),
                submit: false,
                key: Some(CodexChoiceKey::Escape),
            }
        );
    }

    #[test]
    fn resolve_codex_ordinary_numbered_choices_are_submitted() {
        let choices = vec![
            choice("1", "左ペインはファイル一覧だけ"),
            choice("2", "ディレクトリツリー風に折りたたむ"),
        ];

        assert_eq!(
            resolve_codex_choice_input("1", &choices),
            ResolvedCodexChoice {
                text: "1".to_string(),
                submit: true,
                key: None,
            }
        );
    }

    #[test]
    fn trim_cli_footer_strips_footer_lines() {
        let content = [
            "⏺ Some response text",
            "",
            "─────────────────────────────────────",
            "❯ ",
            "─────────────────────────────────────",
            "  Session ID: abc123 | ⎇ main",
            "",
        ]
        .join("\n");

        assert_eq!(trim_cli_footer(&content), "⏺ Some response text");
    }

    #[test]
    fn trim_cli_footer_preserves_content_without_footer() {
        let content = "⏺ Some response text\nMore text here";

        assert_eq!(trim_cli_footer(content), content);
    }

    #[test]
    fn trim_cli_footer_strips_flick_token_footer() {
        let content = [
            "⏺ Response",
            "",
            "─────────────────────────────────────",
            "  Session abc | Model opus",
            "500 tokens",
            "",
        ]
        .join("\n");

        assert_eq!(trim_cli_footer(&content), "⏺ Response");
    }

    #[test]
    fn strip_ansi_removes_terminal_escape_sequences() {
        let content = "\u{1b}[31mred\u{1b}[0m \u{1b}]0;title\u{7}plain\u{1b}(B";

        assert_eq!(strip_ansi(content), "red plain");
    }

    #[test]
    fn parse_model_detects_openai_o_series_models() {
        let content = "Model: o3-mini\nSession ID: abc123";

        assert_eq!(parse_model(content), "o3-mini");
    }

    #[test]
    fn runtime_filters_and_normalizes_claude_codex_panes() {
        let runner = FakeRunner::new()
            .with_tmux(
                "list-panes",
                "s:1.0|101|codex-aarch64-a|unitmux\ns:1.1|102|zsh|✳ work\ns:1.2|103|vim|editor\n",
            )
            .with_tmux("capture-pane", "Enter to send\n");
        let runtime = TmuxRuntime::new(runner);

        let panes = runtime
            .list_panes()
            .expect("list_panes should parse fake output");

        assert_eq!(panes.len(), 2);
        assert_eq!(panes[0].command, "codex");
        assert_eq!(panes[0].status, PaneStatus::Idle);
        assert_eq!(panes[1].command, "claude");
    }

    #[test]
    fn runtime_rejects_invalid_send_target_without_running_tmux() {
        let runner = FakeRunner::new();
        let runtime = TmuxRuntime::new(runner);

        let result = runtime.send_input("bad-target", "hello", false, &[]);

        assert_eq!(
            result,
            SendResult {
                success: false,
                error: Some("Invalid target format".to_string()),
            }
        );
        assert_eq!(runtime.runner().calls(), Vec::<Vec<String>>::new());
    }

    #[test]
    fn runtime_sends_multiline_claude_text_as_bracketed_paste() {
        let runner = FakeRunner::new()
            .with_tmux("capture-pane", "")
            .with_tmux("display-message", "✳ Claude Code|claude\n");
        let runtime = TmuxRuntime::new(runner);

        let result = runtime.send_input("s:1.0", "hello\nworld\n", false, &[]);

        assert_eq!(result, SendResult::ok());
        assert_eq!(
            runtime.runner().calls(),
            vec![
                args(&["capture-pane", "-t", "s:1.0", "-p"]),
                args(&[
                    "display-message",
                    "-t",
                    "s:1.0",
                    "-p",
                    "#{pane_title}|#{pane_current_command}",
                ]),
                args(&["send-keys", "-t", "s:1.0", "\u{1b}[200~"]),
                args(&["send-keys", "-t", "s:1.0", "-l", "hello\nworld"]),
                args(&["send-keys", "-t", "s:1.0", "\u{1b}[201~"]),
                args(&["send-keys", "-t", "s:1.0", "", "Enter"]),
            ]
        );
    }

    #[test]
    fn runtime_maps_codex_approval_choice_to_shortcut_key() {
        let content = [
            "Would you like to run the following command?",
            "",
            "  1. Yes, proceed (y)",
            "› 2. Yes, and don't ask again for commands that start with `gh auth status` (p)",
            "  3. No, and tell Codex what to do differently (esc)",
        ]
        .join("\n");
        let runner = FakeRunner::new()
            .with_tmux("capture-pane", &content)
            .with_tmux("display-message", "unitmux|codex\n");
        let runtime = TmuxRuntime::new(runner);

        let result = runtime.send_input("s:1.0", "2", false, &[]);

        assert_eq!(result, SendResult::ok());
        assert_eq!(
            runtime.runner().calls(),
            vec![
                args(&["capture-pane", "-t", "s:1.0", "-p"]),
                args(&[
                    "display-message",
                    "-t",
                    "s:1.0",
                    "-p",
                    "#{pane_title}|#{pane_current_command}",
                ]),
                args(&["send-keys", "-t", "s:1.0", "-l", "p"]),
            ]
        );
    }

    #[test]
    fn runtime_builds_git_add_files_with_path_separator() {
        let runner = FakeRunner::new().with_git("add", "");
        let runtime = TmuxRuntime::new(runner);

        let result =
            runtime.git_add_files("/repo", &["a b.ts".to_string(), "src/main.rs".to_string()]);

        assert_eq!(result, SendResult::ok());
        assert_eq!(
            runtime.runner().git_calls(),
            vec![args(&["-C", "/repo", "add", "--", "a b.ts", "src/main.rs"])]
        );
    }

    #[test]
    fn runtime_captures_pane_with_scrollback_and_trims_footer() {
        let runner = FakeRunner::new().with_tmux(
            "capture-pane",
            "\u{1b}[32mhello\u{1b}[0m\n\n────────────────\n❯ \n  Session ID: abc123\n",
        );
        let runtime = TmuxRuntime::new(runner);

        let output = runtime
            .capture_pane("s:1.0")
            .expect("capture should succeed");

        assert_eq!(output, "hello");
        assert_eq!(
            runtime.runner().calls(),
            vec![args(&["capture-pane", "-t", "s:1.0", "-p", "-S", "-500"])]
        );
    }

    #[test]
    fn runtime_returns_empty_capture_when_tmux_capture_fails() {
        let runtime = TmuxRuntime::new(FakeRunner::new());

        let output = runtime
            .capture_pane("s:1.0")
            .expect("capture failure should preserve the empty-string contract");

        assert_eq!(output, "");
    }

    #[test]
    fn runtime_gets_claude_token_usage_for_pane() {
        let tmp_dir = std::env::temp_dir().join(format!(
            "unitmux-core-token-pane-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after epoch")
                .as_nanos()
        ));
        let sessions_dir = tmp_dir.join(".claude").join("sessions");
        let project_dir = tmp_dir.join(".claude").join("projects").join("-repo");
        std::fs::create_dir_all(&sessions_dir).expect("create sessions dir");
        std::fs::create_dir_all(&project_dir).expect("create project dir");
        std::fs::write(
            sessions_dir.join("42.json"),
            r#"{"cwd":"/repo","sessionId":"abc","startedAt":1}"#,
        )
        .expect("write session metadata");
        std::fs::write(
            project_dir.join("abc.jsonl"),
            r#"{"requestId":"req-1","message":{"usage":{"input_tokens":10,"cache_creation_input_tokens":2,"cache_read_input_tokens":3,"output_tokens":5}}}"#,
        )
        .expect("write usage jsonl");

        let runner = FakeRunner::new()
            .with_tmux("capture-pane", "Claude output\n")
            .with_tmux_sequence(
                "display-message",
                vec![
                    "claude|✳ work|/repo\n".to_string(),
                    "42|/repo\n".to_string(),
                ],
            );
        let runtime = TmuxRuntime::new(runner);

        let usage = runtime
            .get_pane_token_usage("s:1.0", &tmp_dir)
            .expect("token usage should not error");

        assert_eq!(usage.source, TokenUsageSource::ClaudeJsonl);
        assert_eq!(usage.input, 15);
        assert_eq!(usage.cached_input, 3);
        assert_eq!(usage.output, 5);
        assert_eq!(usage.total, 20);

        std::fs::remove_dir_all(tmp_dir).expect("remove temp dir");
    }

    #[test]
    fn runtime_combines_claude_history_with_live_capture() {
        let tmp_dir = std::env::temp_dir().join(format!(
            "unitmux-core-history-{}",
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock should be after epoch")
                .as_nanos()
        ));
        let sessions_dir = tmp_dir.join(".claude").join("sessions");
        let project_dir = tmp_dir.join(".claude").join("projects").join("-repo");
        std::fs::create_dir_all(&sessions_dir).expect("create sessions dir");
        std::fs::create_dir_all(&project_dir).expect("create project dir");
        std::fs::write(
            sessions_dir.join("42.json"),
            r#"{"cwd":"/repo","sessionId":"abc","startedAt":1}"#,
        )
        .expect("write session metadata");
        std::fs::write(
            project_dir.join("abc.jsonl"),
            [
                r#"{"type":"user","message":{"role":"user","content":"hello"}}"#,
                r#"{"type":"assistant","message":{"role":"assistant","content":[{"type":"text","text":"hi there"}]}}"#,
            ]
            .join("\n"),
        )
        .expect("write conversation jsonl");

        let runner = FakeRunner::new()
            .with_tmux("capture-pane", "live output\n")
            .with_tmux("display-message", "42|/repo\n");
        let runtime = TmuxRuntime::new(runner);

        let output = runtime
            .capture_pane_with_history("s:1.0", &tmp_dir)
            .expect("capture with history should succeed");

        assert_eq!(
            output,
            "> hello\n\nhi there\n\n── live ──────────────────────\n\nlive output"
        );

        std::fs::remove_dir_all(tmp_dir).expect("remove temp dir");
    }

    #[test]
    fn runtime_exposes_git_commit_push_and_diff() {
        let runner = FakeRunner::new()
            .with_git("add", "")
            .with_git("commit", "")
            .with_git("push", "")
            .with_git("diff", "diff --git a/file b/file\n");
        let runtime = TmuxRuntime::new(runner);

        assert_eq!(runtime.git_add("/repo"), SendResult::ok());
        assert_eq!(runtime.git_commit("/repo", "msg"), SendResult::ok());
        assert_eq!(runtime.git_push("/repo"), SendResult::ok());
        assert_eq!(
            runtime
                .git_diff("/repo", true)
                .expect("diff should succeed"),
            "diff --git a/file b/file\n"
        );
        assert_eq!(
            runtime.runner().git_calls(),
            vec![
                args(&["-C", "/repo", "add", "-A"]),
                args(&["-C", "/repo", "commit", "-m", "msg"]),
                args(&["-C", "/repo", "push"]),
                args(&["-C", "/repo", "diff", "--staged"]),
            ]
        );
    }

    #[test]
    fn runtime_returns_empty_diff_when_git_diff_fails() {
        let runtime = TmuxRuntime::new(FakeRunner::new());

        let diff = runtime
            .git_diff("/repo", false)
            .expect("git diff failure should preserve the empty-string contract");

        assert_eq!(diff, "");
    }

    #[test]
    fn runtime_manages_tmux_sessions_and_panes() {
        let runner = FakeRunner::new().with_tmux("list-sessions", "alpha\nbeta\n");
        let runtime = TmuxRuntime::new(runner);

        assert_eq!(
            runtime.list_tmux_sessions().expect("sessions should parse"),
            vec!["alpha".to_string(), "beta".to_string()]
        );
        assert_eq!(
            runtime.create_session("alpha", "codex", Some("/repo")),
            SendResult::ok()
        );
        assert_eq!(
            runtime.create_new_session("new", "claude", None),
            SendResult::ok()
        );
        assert_eq!(runtime.kill_pane("alpha:1.0"), SendResult::ok());
        assert_eq!(
            runtime.runner().calls(),
            vec![
                args(&["list-sessions", "-F", "#{session_name}"]),
                args(&["new-window", "-a", "-t", "alpha", "-c", "/repo", "codex"]),
                args(&["new-session", "-d", "-s", "new", "claude"]),
                args(&["kill-pane", "-t", "alpha:1.0"]),
            ]
        );
    }

    #[test]
    fn runtime_finds_existing_shell_pane() {
        let runner = FakeRunner::new().with_tmux(
            "list-panes",
            "alpha:1.0|work\nalpha:2.0|unitmux-shell\nbeta:1.0|unitmux-shell\n",
        );
        let runtime = TmuxRuntime::new(runner);

        assert_eq!(
            runtime
                .find_shell_pane("alpha")
                .expect("shell lookup should succeed"),
            Some("alpha:2.0".to_string())
        );
    }

    #[test]
    fn runtime_ensure_shell_pane_creates_and_restores_current_window() {
        let runner = FakeRunner::new()
            .with_tmux_sequence(
                "list-panes",
                vec![
                    "alpha:1.0|work\n".to_string(),
                    "alpha:1.0|work\nalpha:3.0|unitmux-shell\n".to_string(),
                ],
            )
            .with_tmux("display-message", "1\n");
        let runtime = TmuxRuntime::new(runner);

        let result = runtime.ensure_shell_pane("alpha", "/repo");

        assert_eq!(
            result,
            ShellPaneResult {
                success: true,
                target: Some("alpha:3.0".to_string()),
                error: None,
            }
        );
        assert_eq!(
            runtime.runner().calls(),
            vec![
                args(&[
                    "list-panes",
                    "-a",
                    "-F",
                    "#{session_name}:#{window_index}.#{pane_index}|#{window_name}"
                ]),
                args(&["display-message", "-t", "alpha", "-p", "#{window_index}"]),
                args(&[
                    "new-window",
                    "-t",
                    "alpha",
                    "-n",
                    "unitmux-shell",
                    "-c",
                    "/repo"
                ]),
                args(&["select-window", "-t", "alpha:1"]),
                args(&[
                    "list-panes",
                    "-a",
                    "-F",
                    "#{session_name}:#{window_index}.#{pane_index}|#{window_name}"
                ]),
            ]
        );
    }

    #[test]
    fn pane_serializes_to_existing_renderer_contract() {
        let pane = TmuxPane {
            target: "s:1.0".to_string(),
            pid: "123".to_string(),
            command: "codex".to_string(),
            title: "unitmux".to_string(),
            status: PaneStatus::Idle,
            choices: vec![choice("1", "Yes")],
            prompt: String::new(),
            activity_line: "Working".to_string(),
        };

        let value = serde_json::to_value(&pane).expect("pane should serialize");

        assert_eq!(value["status"], "idle");
        assert_eq!(value["activityLine"], "Working");
        assert!(value.get("activity_line").is_none());
    }

    #[test]
    fn runtime_gets_pane_detail_with_git_and_cli_metadata() {
        let runner = FakeRunner::new()
            .with_tmux(
                "display-message",
                "s:1.0|123|codex|unitmux|120|40|codex|/repo|/dev/ttys001\n",
            )
            .with_tmux(
                "capture-pane",
                "Model: codex-mini\nSession ID: 12345678-abcd-4000-9000-000000000000\n",
            )
            .with_git("branch", "main\n")
            .with_git("status", " M src/main.rs\n");
        let runtime = TmuxRuntime::new(runner);

        let detail = runtime
            .get_pane_detail("s:1.0")
            .expect("pane detail should not error")
            .expect("valid pane should return detail");

        assert_eq!(
            detail,
            PaneDetail {
                target: "s:1.0".to_string(),
                pid: "123".to_string(),
                command: "codex".to_string(),
                title: "unitmux".to_string(),
                width: "120".to_string(),
                height: "40".to_string(),
                started_at: "codex".to_string(),
                cwd: "/repo".to_string(),
                tty: "/dev/ttys001".to_string(),
                git_branch: "main".to_string(),
                git_status: " M src/main.rs".to_string(),
                model: "codex-mini".to_string(),
                session_id: "12345678-abcd-4000-9000-000000000000".to_string(),
            }
        );
        assert_eq!(
            runtime.runner().calls(),
            vec![
                args(&[
                    "display-message",
                    "-t",
                    "s:1.0",
                    "-p",
                    "#{session_name}:#{window_index}.#{pane_index}|#{pane_pid}|#{pane_current_command}|#{pane_title}|#{pane_width}|#{pane_height}|#{pane_start_command}|#{pane_current_path}|#{pane_tty}",
                ]),
                args(&["capture-pane", "-t", "s:1.0", "-p"]),
            ]
        );
        assert_eq!(
            runtime.runner().git_calls(),
            vec![
                args(&["-C", "/repo", "branch", "--show-current"]),
                args(&["-C", "/repo", "status", "--short"]),
            ]
        );
    }

    #[test]
    fn runtime_returns_no_pane_detail_when_tmux_display_fails() {
        let runtime = TmuxRuntime::new(FakeRunner::new());

        let detail = runtime
            .get_pane_detail("s:1.0")
            .expect("pane detail failure should preserve the null contract");

        assert_eq!(detail, None);
    }

    #[test]
    fn pane_detail_serializes_to_existing_renderer_contract() {
        let detail = PaneDetail {
            target: "s:1.0".to_string(),
            pid: "123".to_string(),
            command: "codex".to_string(),
            title: "unitmux".to_string(),
            width: "120".to_string(),
            height: "40".to_string(),
            started_at: "codex".to_string(),
            cwd: "/repo".to_string(),
            tty: "/dev/ttys001".to_string(),
            git_branch: "main".to_string(),
            git_status: " M file".to_string(),
            model: "codex-mini".to_string(),
            session_id: "12345678".to_string(),
        };

        let value = serde_json::to_value(&detail).expect("detail should serialize");

        assert_eq!(value["startedAt"], "codex");
        assert_eq!(value["gitBranch"], "main");
        assert_eq!(value["gitStatus"], " M file");
        assert_eq!(value["sessionId"], "12345678");
        assert!(value.get("started_at").is_none());
    }

    #[test]
    fn runtime_gets_codex_pane_token_usage_from_archived_session() {
        let home = std::env::temp_dir().join(format!(
            "unitmux-pane-token-test-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock should be after epoch")
                .as_nanos()
        ));
        let archived = home.join(".codex").join("archived_sessions");
        std::fs::create_dir_all(&archived).expect("archive dir should be created");
        std::fs::write(
            archived.join("2026-05-31-12345678-abcd-4000-9000-000000000000.jsonl"),
            serde_json::json!({
                "timestamp": "2026-05-31T00:00:00.000Z",
                "payload": {
                    "total_token_usage": {
                        "input_tokens": 12,
                        "cached_input_tokens": 3,
                        "output_tokens": 4,
                        "reasoning_output_tokens": 1,
                        "total_tokens": 16
                    }
                }
            })
            .to_string()
                + "\n",
        )
        .expect("usage file should be written");
        let runner = FakeRunner::new()
            .with_tmux("display-message", "codex|unitmux|/repo\n")
            .with_tmux(
                "capture-pane",
                "Session ID: 12345678-abcd-4000-9000-000000000000\n",
            );
        let runtime = TmuxRuntime::new(runner);

        let usage = runtime
            .get_pane_token_usage("s:1.0", &home)
            .expect("usage should load");

        assert_eq!(usage.total, 16);
        assert_eq!(usage.source, TokenUsageSource::CodexJsonl);
        std::fs::remove_dir_all(home).expect("test home should be removed");
    }

    #[test]
    fn runtime_returns_empty_token_usage_when_tmux_metadata_fails() {
        let runtime = TmuxRuntime::new(FakeRunner::new());

        let usage = runtime
            .get_pane_token_usage("s:1.0", std::env::temp_dir())
            .expect("token usage failure should preserve the empty usage contract");

        assert_eq!(usage, create_empty_token_usage(TokenUsageSource::None));
    }

    #[test]
    fn run_command_with_timeout_stops_stuck_processes() {
        let started = std::time::Instant::now();

        let result = run_command_with_timeout(
            "sh",
            &["-c".to_string(), "sleep 2; echo late".to_string()],
            Duration::from_millis(100),
        );

        assert!(
            result
                .expect_err("command should time out")
                .contains("timed out")
        );
        assert!(started.elapsed() < Duration::from_secs(1));
    }
}

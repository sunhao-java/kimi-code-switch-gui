//! 系统集成原子能力：进程执行、HTTP 请求、文件切片/元信息。
//! 对应 Electron 侧 cli.ts / terminal.ts / webdav.ts / usageIngest.ts 中需要 Node 原生能力的部分。
//! 纯逻辑（正则解析、URL 构建、流式解析等）保留在前端。

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::process::{Command as StdCommand, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::Duration;

use tauri::Emitter;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader as TokioBufReader};

static KIMI_OAUTH_LOGIN_RUNNING: AtomicBool = AtomicBool::new(false);

/// 验证命令是否在允许的白名单中。
fn validate_command(program: &str) -> Result<(), String> {
    let allowed_commands = [
        "kimi",
        "kimi-code",
        "brew",
        "sh",
        "powershell.exe",
        "open",
        "osascript",
        "uv",
        "uvx",
        "python",
        "python3",
        "node",
        "npm",
        "npx",
    ];

    // 检查程序名（可能包含路径）
    let program_name = Path::new(program)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or(program);

    if allowed_commands.contains(&program_name) {
        return Ok(());
    }

    Err(format!(
        "Command '{}' is not in the allowed list: {:?}",
        program, allowed_commands
    ))
}

/// 验证 HTTP URL 是否在允许的域名范围内。
fn validate_http_url(url: &str) -> Result<(), String> {
    let allowed_domains = [
        "api.github.com",
        "github.com",
        "pypi.org",
        "files.pythonhosted.org",
    ];

    // 解析 URL
    let parsed = url::Url::parse(url).map_err(|e| format!("Invalid URL: {}", e))?;

    let host = parsed
        .host_str()
        .ok_or_else(|| "URL has no host".to_string())?;

    // 检查是否在白名单中，或者是用户配置的 WebDAV 域名
    if allowed_domains.iter().any(|d| host.ends_with(d)) {
        return Ok(());
    }

    // WebDAV 用户配置的域名：允许所有 https 协议
    // （用户在配置面板中输入的 WebDAV 地址应该被信任）
    if parsed.scheme() == "https" || parsed.scheme() == "http" {
        // 对于 WebDAV，我们信任用户配置的任何域名
        return Ok(());
    }

    Err(format!(
        "URL host '{}' is not in allowed domains: {:?}",
        host, allowed_domains
    ))
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum KimiOAuthTarget {
    KimiCode,
}

impl KimiOAuthTarget {
    fn from_config_target(target: &str) -> Self {
        let _ = target;
        Self::KimiCode
    }

    fn as_config_target(self) -> &'static str {
        match self {
            Self::KimiCode => "kimi-code",
        }
    }

    fn label(self) -> &'static str {
        match self {
            Self::KimiCode => "Kimi Code",
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct OAuthLoginCommand {
    program: String,
    args: Vec<String>,
}

fn resolve_home(path: &str) -> PathBuf {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    PathBuf::from(path)
}

fn executable_path_if_exists(path: PathBuf) -> Option<PathBuf> {
    if path.is_file() {
        Some(path)
    } else {
        None
    }
}

fn panel_tmp_dir() -> Option<PathBuf> {
    dirs::home_dir().map(|home| home.join(".kimi-code/.panel/tmp"))
}

fn find_kimi_code_login_command() -> OAuthLoginCommand {
    if cfg!(windows) {
        if let Some(home) = dirs::home_dir() {
            let root = std::env::var("KIMI_INSTALL_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| home.join(".kimi-code"));
            if let Some(path) = executable_path_if_exists(root.join("bin/kimi.exe")) {
                return OAuthLoginCommand {
                    program: path.to_string_lossy().to_string(),
                    args: vec!["login".to_string()],
                };
            }
        }
        return OAuthLoginCommand {
            program: "kimi".to_string(),
            args: vec!["login".to_string()],
        };
    }

    if let Ok(prefix) = StdCommand::new("brew")
        .arg("--prefix")
        .arg("kimi-code")
        .env("PATH", augmented_path())
        .output()
    {
        if prefix.status.success() {
            let path = String::from_utf8_lossy(&prefix.stdout).trim().to_string();
            if let Some(candidate) = executable_path_if_exists(PathBuf::from(path).join("bin/kimi"))
            {
                return OAuthLoginCommand {
                    program: candidate.to_string_lossy().to_string(),
                    args: vec!["login".to_string()],
                };
            }
        }
    }

    if let Some(home) = dirs::home_dir() {
        let root = std::env::var("KIMI_INSTALL_DIR")
            .map(PathBuf::from)
            .unwrap_or_else(|_| home.join(".kimi-code"));
        if let Some(path) = executable_path_if_exists(root.join("bin/kimi")) {
            return OAuthLoginCommand {
                program: path.to_string_lossy().to_string(),
                args: vec!["login".to_string()],
            };
        }
    }

    OAuthLoginCommand {
        program: "kimi".to_string(),
        args: vec!["login".to_string()],
    }
}

fn find_oauth_login_command(target: KimiOAuthTarget) -> OAuthLoginCommand {
    match target {
        KimiOAuthTarget::KimiCode => find_kimi_code_login_command(),
    }
}

/// macOS / 类 Unix：在常见路径基础上补齐 CLI 查找路径（对应 cli.ts 的 getCliEnv）。
fn augmented_path() -> String {
    let mut entries: Vec<String> = Vec::new();
    let separator = if cfg!(windows) { ';' } else { ':' };
    if let Ok(p) = std::env::var("PATH") {
        entries.extend(p.split(separator).map(|s| s.to_string()));
    }
    if let Some(home) = dirs::home_dir() {
        if cfg!(windows) {
            for extra in [
                home.join(".kimi-code/bin").to_string_lossy().to_string(),
                home.join("AppData/Roaming/npm")
                    .to_string_lossy()
                    .to_string(),
                home.join(".cargo/bin").to_string_lossy().to_string(),
                home.join(".volta/bin").to_string_lossy().to_string(),
            ] {
                entries.push(extra);
            }
        } else {
            for extra in [
                "/opt/homebrew/bin".to_string(),
                "/usr/local/bin".to_string(),
                home.join(".kimi-code/bin").to_string_lossy().to_string(),
                home.join(".local/bin").to_string_lossy().to_string(),
                home.join(".cargo/bin").to_string_lossy().to_string(),
                home.join(".npm-global/bin").to_string_lossy().to_string(),
                home.join(".volta/bin").to_string_lossy().to_string(),
            ] {
                entries.push(extra);
            }
        }
    }
    let mut seen = std::collections::HashSet::new();
    entries
        .into_iter()
        .map(|e| e.trim().to_string())
        .filter(|e| !e.is_empty() && seen.insert(e.clone()))
        .collect::<Vec<_>>()
        .join(if cfg!(windows) { ";" } else { ":" })
}

fn expand_shell_like_path_value(value: &str) -> String {
    if value == "~" {
        return dirs::home_dir()
            .map(|home| home.to_string_lossy().to_string())
            .unwrap_or_else(|| value.to_string());
    }
    if let Some(stripped) = value.strip_prefix("~/") {
        return dirs::home_dir()
            .map(|home| home.join(stripped).to_string_lossy().to_string())
            .unwrap_or_else(|| value.to_string());
    }
    value.to_string()
}

fn normalize_mcp_stdio_args(program: &str, args: &[String]) -> Vec<String> {
    let program_name = Path::new(program)
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(program)
        .to_ascii_lowercase();
    let mut normalized: Vec<String> = args
        .iter()
        .map(|arg| expand_shell_like_path_value(arg))
        .collect();

    if program_name == "npx"
        && normalized
            .iter()
            .any(|arg| arg == "@modelcontextprotocol/server-filesystem")
        && !normalized.iter().any(|arg| arg == "-y" || arg == "--yes")
    {
        normalized.insert(0, "-y".to_string());
    }

    normalized
}

#[derive(serde::Serialize)]
pub struct ExecResult {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Clone, serde::Serialize)]
pub struct KimiOAuthLoginEvent {
    pub kind: String,
    pub target: String,
    pub stream: Option<String>,
    pub line: Option<String>,
    pub url: Option<String>,
    pub user_code: Option<String>,
    pub expires_in: Option<u64>,
    pub message: Option<String>,
}

fn emit_oauth_login_event(app: &tauri::AppHandle, event: KimiOAuthLoginEvent) {
    let _ = app.emit("kimi-oauth-login", event);
}

fn extract_query_value(url: &str, key: &str) -> Option<String> {
    let query = url.split_once('?')?.1;
    for part in query.split('&') {
        let (candidate_key, value) = part.split_once('=')?;
        if candidate_key == key && !value.trim().is_empty() {
            return Some(value.trim().to_string());
        }
    }
    None
}

fn parse_device_login_line(target: KimiOAuthTarget, line: &str) -> KimiOAuthLoginEvent {
    if let Some(url) = line.strip_prefix("Opening browser for Kimi device login: ") {
        return KimiOAuthLoginEvent {
            kind: "device-code".to_string(),
            target: target.as_config_target().to_string(),
            stream: None,
            line: Some(line.to_string()),
            url: Some(url.trim().to_string()),
            user_code: None,
            expires_in: None,
            message: None,
        };
    }
    if let Some(url) = line.strip_prefix("Verification URL: ") {
        let url = url.trim();
        return KimiOAuthLoginEvent {
            kind: "device-code".to_string(),
            target: target.as_config_target().to_string(),
            stream: None,
            line: Some(line.to_string()),
            url: Some(url.to_string()),
            user_code: extract_query_value(url, "user_code"),
            expires_in: None,
            message: None,
        };
    }
    if let Some(rest) =
        line.strip_prefix("If the browser did not open, paste the URL above and enter code: ")
    {
        return KimiOAuthLoginEvent {
            kind: "user-code".to_string(),
            target: target.as_config_target().to_string(),
            stream: None,
            line: Some(line.to_string()),
            url: None,
            user_code: Some(rest.trim().to_string()),
            expires_in: None,
            message: None,
        };
    }
    if let Some(rest) = line.strip_prefix("User Code: ") {
        return KimiOAuthLoginEvent {
            kind: "user-code".to_string(),
            target: target.as_config_target().to_string(),
            stream: None,
            line: Some(line.to_string()),
            url: None,
            user_code: Some(rest.trim().to_string()),
            expires_in: None,
            message: None,
        };
    }
    if let Some(rest) = line.strip_prefix("Code expires in ") {
        let seconds = rest
            .trim_end_matches('.')
            .trim_end_matches('s')
            .trim()
            .parse::<u64>()
            .ok();
        return KimiOAuthLoginEvent {
            kind: "expires-in".to_string(),
            target: target.as_config_target().to_string(),
            stream: None,
            line: Some(line.to_string()),
            url: None,
            user_code: None,
            expires_in: seconds,
            message: None,
        };
    }
    if let Some(rest) = line.strip_prefix("Logged in to ") {
        return KimiOAuthLoginEvent {
            kind: "success".to_string(),
            target: target.as_config_target().to_string(),
            stream: None,
            line: Some(line.to_string()),
            url: None,
            user_code: None,
            expires_in: None,
            message: Some(format!("Logged in to {}", rest.trim_end_matches('.'))),
        };
    }
    if line.trim() == "Logged in successfully." {
        return KimiOAuthLoginEvent {
            kind: "success".to_string(),
            target: target.as_config_target().to_string(),
            stream: None,
            line: Some(line.to_string()),
            url: None,
            user_code: None,
            expires_in: None,
            message: Some("Logged in successfully.".to_string()),
        };
    }
    if is_oauth_models_payment_required(line) {
        return KimiOAuthLoginEvent {
            kind: "account-required".to_string(),
            target: target.as_config_target().to_string(),
            stream: None,
            line: Some(line.to_string()),
            url: None,
            user_code: None,
            expires_in: None,
            message: Some(kimi_oauth_account_required_message()),
        };
    }
    if let Some(rest) = line.strip_prefix("Login failed: ") {
        return KimiOAuthLoginEvent {
            kind: "error".to_string(),
            target: target.as_config_target().to_string(),
            stream: None,
            line: Some(line.to_string()),
            url: None,
            user_code: None,
            expires_in: None,
            message: Some(rest.to_string()),
        };
    }
    KimiOAuthLoginEvent {
        kind: "output".to_string(),
        target: target.as_config_target().to_string(),
        stream: None,
        line: Some(line.to_string()),
        url: None,
        user_code: None,
        expires_in: None,
        message: None,
    }
}

fn read_oauth_login_stream<R: Read + Send + 'static>(
    app: tauri::AppHandle,
    target: KimiOAuthTarget,
    stream_name: &'static str,
    reader: R,
) -> std::thread::JoinHandle<String> {
    std::thread::spawn(move || {
        let mut collected = String::new();
        let reader = BufReader::new(reader);
        for line in reader.lines().map_while(Result::ok) {
            collected.push_str(&line);
            collected.push('\n');
            let mut event = parse_device_login_line(target, &line);
            event.stream = Some(stream_name.to_string());
            emit_oauth_login_event(&app, event);
        }
        collected
    })
}

fn is_oauth_models_payment_required(value: &str) -> bool {
    let lower = value.to_ascii_lowercase();
    let mentions_models = lower.contains("models") || lower.contains("coding/v1/models");
    let mentions_payment = lower.contains("payment required")
        || lower.contains("http 402")
        || lower.contains(" 402,")
        || lower.contains(": 402");
    mentions_models && mentions_payment
}

fn kimi_oauth_account_required_message() -> String {
    "Kimi OAuth authorization completed, but the Kimi models endpoint returned 402 Payment Required. Check account billing, plan, or quota, then retry.".to_string()
}

fn last_non_empty_line(value: &str) -> Option<String> {
    value
        .lines()
        .rev()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(str::to_string)
}

fn summarize_oauth_login_failure(result: &ExecResult) -> String {
    let combined_output = format!("{}\n{}", result.stderr, result.stdout);
    if is_oauth_models_payment_required(&combined_output) {
        return kimi_oauth_account_required_message();
    }
    last_non_empty_line(&result.stderr)
        .or_else(|| last_non_empty_line(&result.stdout))
        .unwrap_or_else(|| format!("Kimi OAuth login failed with exit code {}.", result.code))
}

/// 执行外部命令，拿 stdout/stderr/退出码。覆盖 kimi/open/osascript 等调用。
/// timeout_ms <= 0 表示不超时（依赖系统）。
#[tauri::command]
pub async fn exec_command(
    program: String,
    args: Vec<String>,
    timeout_ms: Option<u64>,
) -> Result<ExecResult, String> {
    validate_command(&program)?;

    // 使用 tokio::process::Command 以便超时时能真正 kill 子进程
    let mut cmd = tokio::process::Command::new(&program);
    cmd.args(&args);
    cmd.env("PATH", augmented_path());

    match timeout_ms {
        Some(ms) if ms > 0 => {
            let child = cmd.output();
            match tokio::time::timeout(Duration::from_millis(ms), child).await {
                Ok(output_result) => {
                    let output = output_result.map_err(|e| format!("spawn error: {e}"))?;
                    Ok(ExecResult {
                        code: output.status.code().unwrap_or(-1),
                        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
                    })
                }
                Err(_) => {
                    // 超时：tokio::process::Command 的 output() 会自动 kill 子进程
                    Err(format!("command timed out after {ms}ms"))
                }
            }
        }
        _ => {
            let output = cmd
                .output()
                .await
                .map_err(|e| format!("spawn error: {e}"))?;
            Ok(ExecResult {
                code: output.status.code().unwrap_or(-1),
                stdout: String::from_utf8_lossy(&output.stdout).to_string(),
                stderr: String::from_utf8_lossy(&output.stderr).to_string(),
            })
        }
    }
}

/// 启动当前配置目标的官方 `kimi login` 设备码登录流程。
///
/// 该命令不持有、不读取、不写入 OAuth token；token 仍由对应 CLI 自己写入本机。
/// 这里仅选择目标对应的可执行文件，并转发 stdout/stderr 到 renderer。
#[tauri::command]
pub async fn start_kimi_oauth_login(
    app: tauri::AppHandle,
    target: String,
) -> Result<ExecResult, String> {
    let target = KimiOAuthTarget::from_config_target(&target);
    let target_label = target.label();
    if KIMI_OAUTH_LOGIN_RUNNING
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Err("Kimi OAuth login is already running.".to_string());
    }

    emit_oauth_login_event(
        &app,
        KimiOAuthLoginEvent {
            kind: "start".to_string(),
            target: target.as_config_target().to_string(),
            stream: None,
            line: None,
            url: None,
            user_code: None,
            expires_in: None,
            message: Some(format!("Starting {target_label} OAuth login.")),
        },
    );

    let app_for_task = app.clone();
    let result =
        tauri::async_runtime::spawn_blocking(move || {
            let login_command = find_oauth_login_command(target);
            let mut child = StdCommand::new(&login_command.program)
                .args(&login_command.args)
                .env("PATH", augmented_path())
                .stdin(Stdio::null())
                .stdout(Stdio::piped())
                .stderr(Stdio::piped())
                .spawn()
                .map_err(|e| format!("spawn {}: {e}", target.label()))?;

            let stdout_handle = child.stdout.take().map(|stdout| {
                read_oauth_login_stream(app_for_task.clone(), target, "stdout", stdout)
            });
            let stderr_handle = child.stderr.take().map(|stderr| {
                read_oauth_login_stream(app_for_task.clone(), target, "stderr", stderr)
            });

            let status = child
                .wait()
                .map_err(|e| format!("wait {}: {e}", target.label()))?;
            let stdout = stdout_handle
                .map(|handle| handle.join().unwrap_or_default())
                .unwrap_or_default();
            let stderr = stderr_handle
                .map(|handle| handle.join().unwrap_or_default())
                .unwrap_or_default();
            Ok(ExecResult {
                code: status.code().unwrap_or(-1),
                stdout,
                stderr,
            })
        })
        .await
        .map_err(|e| format!("join error: {e}"));

    KIMI_OAUTH_LOGIN_RUNNING.store(false, Ordering::SeqCst);

    match result {
        Ok(Ok(exec_result)) => {
            let ok = exec_result.code == 0;
            let message = if ok {
                format!("{target_label} OAuth login completed.")
            } else {
                summarize_oauth_login_failure(&exec_result)
            };
            emit_oauth_login_event(
                &app,
                KimiOAuthLoginEvent {
                    kind: if ok { "complete" } else { "failed" }.to_string(),
                    target: target.as_config_target().to_string(),
                    stream: None,
                    line: None,
                    url: None,
                    user_code: None,
                    expires_in: None,
                    message: Some(message.clone()),
                },
            );
            if ok {
                Ok(exec_result)
            } else {
                Err(message)
            }
        }
        Ok(Err(err)) | Err(err) => {
            emit_oauth_login_event(
                &app,
                KimiOAuthLoginEvent {
                    kind: "failed".to_string(),
                    target: target.as_config_target().to_string(),
                    stream: None,
                    line: None,
                    url: None,
                    user_code: None,
                    expires_in: None,
                    message: Some(err.clone()),
                },
            );
            Err(err)
        }
    }
}

/// 写文件并赋可执行权限（terminal.ts 的 iTerm 启动脚本用）。
#[tauri::command]
pub fn write_executable(path: String, content: String) -> Result<(), String> {
    let resolved = resolve_home(&path);

    // 只允许写入临时脚本目录
    let temp_dir = std::env::temp_dir();
    let panel_tmp = panel_tmp_dir();
    let in_allowed_dir = resolved.starts_with(&temp_dir)
        || panel_tmp
            .as_ref()
            .is_some_and(|allowed| resolved.starts_with(allowed));
    if !in_allowed_dir {
        return Err(format!(
            "write_executable only allowed in temp directories, got: {}",
            resolved.display()
        ));
    }

    if let Some(parent) = resolved.parent() {
        std::fs::create_dir_all(parent).map_err(|e| format!("ensure parent: {e}"))?;
    }
    std::fs::write(&resolved, content).map_err(|e| format!("write: {e}"))?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&resolved)
            .map_err(|e| format!("metadata: {e}"))?
            .permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&resolved, perms).map_err(|e| format!("chmod: {e}"))?;
    }
    Ok(())
}

#[derive(serde::Serialize)]
pub struct FileStat {
    pub size: u64,
    pub mtime_ms: f64,
    /// inode（Unix）或 0（其他平台），与 size/mtime 组合成轮转签名。
    pub ino: u64,
}

/// 文件元信息：供 usage 日志增量摄取检测轮转用。文件不存在返回 None。
#[tauri::command]
pub fn file_stat(path: String) -> Result<Option<FileStat>, String> {
    let resolved = resolve_home(&path);
    let meta = match std::fs::metadata(&resolved) {
        Ok(m) => m,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(err) => return Err(format!("file_stat: {err}")),
    };
    let mtime_ms = meta
        .modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as f64)
        .unwrap_or(0.0);
    #[cfg(unix)]
    let ino = {
        use std::os::unix::fs::MetadataExt;
        meta.ino()
    };
    #[cfg(not(unix))]
    let ino = 0u64;
    Ok(Some(FileStat {
        size: meta.len(),
        mtime_ms,
        ino,
    }))
}

/// 从指定偏移读取一段字节并按 UTF-8（lossy）返回。供 tail 增量读取日志。
/// 限制单次最大读取 10MB，避免一次性分配大 buffer。
#[tauri::command]
pub fn read_file_slice(path: String, offset: u64, length: u64) -> Result<String, String> {
    const MAX_CHUNK_SIZE: usize = 10 * 1024 * 1024; // 10MB

    let resolved = resolve_home(&path);
    let mut file = std::fs::File::open(&resolved).map_err(|e| format!("open: {e}"))?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("seek: {e}"))?;

    // 限制读取长度
    let length = length as usize;
    if length == 0 {
        return Ok(String::new());
    }

    let mut result = Vec::with_capacity(length.min(MAX_CHUNK_SIZE));
    let mut remaining = length;

    while remaining > 0 {
        let chunk_size = remaining.min(MAX_CHUNK_SIZE);
        let mut buf = vec![0u8; chunk_size];
        let n = file.read(&mut buf).map_err(|e| format!("read: {e}"))?;
        if n == 0 {
            break; // EOF
        }
        result.extend_from_slice(&buf[..n]);
        remaining -= n;
    }

    Ok(String::from_utf8_lossy(&result).to_string())
}

#[derive(serde::Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub ok: bool,
    pub body: String,
    pub headers: HashMap<String, String>,
}

#[derive(serde::Deserialize)]
pub struct McpStdioRequest {
    pub id: Option<u64>,
    pub method: String,
    pub params: Option<serde_json::Value>,
}

#[derive(serde::Serialize)]
pub struct McpStdioResponse {
    pub responses: Vec<serde_json::Value>,
    pub stderr: String,
}

async fn write_mcp_stdio_message<W: AsyncWriteExt + Unpin>(
    writer: &mut W,
    payload: &serde_json::Value,
) -> Result<(), String> {
    writer
        .write_all(format!("{payload}\n").as_bytes())
        .await
        .map_err(|e| format!("write MCP stdio request: {e}"))?;
    writer
        .flush()
        .await
        .map_err(|e| format!("flush MCP stdio request: {e}"))
}

async fn read_mcp_stdio_message<R: AsyncBufReadExt + AsyncReadExt + Unpin>(
    reader: &mut R,
) -> Result<Option<serde_json::Value>, String> {
    loop {
        let mut line = String::new();
        let read = reader
            .read_line(&mut line)
            .await
            .map_err(|e| format!("read MCP stdio stdout: {e}"))?;
        if read == 0 {
            return Ok(None);
        }
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            continue;
        }

        if trimmed.starts_with('{') {
            let value = serde_json::from_str::<serde_json::Value>(trimmed)
                .map_err(|e| format!("parse MCP stdio JSON-RPC line: {e}"))?;
            return Ok(Some(value));
        }

        if let Some((name, value)) = trimmed.split_once(':') {
            if name.eq_ignore_ascii_case("content-length") {
                let length = value
                    .trim()
                    .parse::<usize>()
                    .map_err(|e| format!("parse MCP stdio content-length: {e}"))?;

                loop {
                    let mut header = String::new();
                    let read = reader
                        .read_line(&mut header)
                        .await
                        .map_err(|e| format!("read MCP stdio header: {e}"))?;
                    if read == 0 {
                        return Ok(None);
                    }
                    if header.trim_end_matches(['\r', '\n']).is_empty() {
                        break;
                    }
                }

                let mut body = vec![0u8; length];
                reader
                    .read_exact(&mut body)
                    .await
                    .map_err(|e| format!("read MCP stdio body: {e}"))?;
                let value = serde_json::from_slice::<serde_json::Value>(&body)
                    .map_err(|e| format!("parse MCP stdio JSON-RPC body: {e}"))?;
                return Ok(Some(value));
            }
        }
    }
}

/// 纯构造：把方法/URL/头部/请求体组装成一个 reqwest::Request。
/// 与发送解耦，便于单测断言方法、头部与 body 的构造结果（覆盖 WebDAV 的
/// MKCOL/PROPFIND 等非标准方法及大小写归一化）。
fn build_http_request(
    client: &reqwest::Client,
    method: &str,
    url: &str,
    headers: Option<&HashMap<String, String>>,
    body: Option<String>,
) -> Result<reqwest::Request, String> {
    let req_method = reqwest::Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|e| format!("invalid method {method}: {e}"))?;
    let mut req = client.request(req_method, url);

    if let Some(hs) = headers {
        for (k, v) in hs {
            req = req.header(k, v);
        }
    }
    if let Some(b) = body {
        req = req.body(b);
    }
    req.build().map_err(|e| format!("build request: {e}"))
}

/// 通用 HTTP 请求（reqwest）：覆盖 WebDAV（MKCOL/PROPFIND/PUT/DELETE）、
/// provider 连通性测试、PyPI/GitHub 版本检查——绕过浏览器 fetch 的方法限制与 CORS。
#[tauri::command]
pub async fn http_request(
    method: String,
    url: String,
    headers: Option<HashMap<String, String>>,
    body: Option<String>,
) -> Result<HttpResponse, String> {
    validate_http_url(&url)?;

    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(false)
        .build()
        .map_err(|e| format!("client build: {e}"))?;

    let req = build_http_request(&client, &method, &url, headers.as_ref(), body)?;

    let resp = client
        .execute(req)
        .await
        .map_err(|e| format!("request: {e}"))?;
    let status = resp.status();
    let headers = resp
        .headers()
        .iter()
        .filter_map(|(key, value)| {
            value
                .to_str()
                .ok()
                .map(|v| (key.as_str().to_ascii_lowercase(), v.to_string()))
        })
        .collect();
    let text = resp.text().await.map_err(|e| format!("read body: {e}"))?;
    Ok(HttpResponse {
        status: status.as_u16(),
        ok: status.is_success(),
        body: text,
        headers,
    })
}

#[tauri::command]
pub async fn run_mcp_stdio_session(
    program: String,
    args: Vec<String>,
    env: HashMap<String, String>,
    requests: Vec<McpStdioRequest>,
    timeout_ms: Option<u64>,
) -> Result<McpStdioResponse, String> {
    validate_command(&program)?;
    if requests.is_empty() {
        return Err("MCP stdio request list cannot be empty.".to_string());
    }

    let args = normalize_mcp_stdio_args(&program, &args);
    let env = env
        .into_iter()
        .map(|(key, value)| (key, expand_shell_like_path_value(&value)))
        .collect::<HashMap<_, _>>();
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(30000).max(1000));
    let task = async move {
        let mut child = tokio::process::Command::new(&program)
            .args(&args)
            .env("PATH", augmented_path())
            .envs(env)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("spawn MCP stdio server: {e}"))?;

        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "MCP stdio server stdin is unavailable.".to_string())?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| "MCP stdio server stdout is unavailable.".to_string())?;
        let mut stderr = child
            .stderr
            .take()
            .ok_or_else(|| "MCP stdio server stderr is unavailable.".to_string())?;
        let stderr_task = tokio::spawn(async move {
            let mut stderr_output = String::new();
            let _ = stderr.read_to_string(&mut stderr_output).await;
            stderr_output
        });
        let mut reader = TokioBufReader::new(stdout);
        let mut responses = Vec::new();
        for request in &requests {
            let mut payload = serde_json::json!({
                "jsonrpc": "2.0",
                "method": request.method,
            });
            if let Some(id) = request.id {
                payload["id"] = serde_json::json!(id);
            }
            if let Some(params) = &request.params {
                payload["params"] = params.clone();
            }
            write_mcp_stdio_message(&mut stdin, &payload).await?;

            let Some(expected_id) = request.id else {
                continue;
            };

            loop {
                let Some(parsed) = read_mcp_stdio_message(&mut reader).await? else {
                    break;
                };
                let Some(id) = parsed.get("id").and_then(|value| value.as_u64()) else {
                    continue;
                };
                if id == expected_id {
                    responses.push(parsed);
                    break;
                }
            }
        }

        let _ = child.kill().await;
        let _ = child.wait().await;
        let stderr = match tokio::time::timeout(Duration::from_millis(500), stderr_task).await {
            Ok(join_result) => join_result.unwrap_or_default(),
            Err(_) => String::new(),
        };

        if responses.is_empty() {
            return Err(format!(
                "MCP stdio server returned no JSON-RPC response.{}",
                if stderr.trim().is_empty() {
                    String::new()
                } else {
                    format!(" stderr: {}", stderr.trim())
                }
            ));
        }

        Ok(McpStdioResponse { responses, stderr })
    };

    tokio::time::timeout(timeout, task).await.map_err(|_| {
        format!(
            "MCP stdio session timed out after {}ms",
            timeout.as_millis()
        )
    })?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn client() -> reqwest::Client {
        reqwest::Client::builder().build().unwrap()
    }

    #[test]
    fn resolve_home_expands_tilde_prefix() {
        let home = dirs::home_dir().expect("home dir required");
        assert_eq!(resolve_home("~/run.sh"), home.join("run.sh"));
    }

    #[test]
    fn resolve_home_keeps_plain_path() {
        assert_eq!(resolve_home("/tmp/run.sh"), PathBuf::from("/tmp/run.sh"));
    }

    #[test]
    fn augmented_path_dedupes_and_includes_homebrew() {
        let path = augmented_path();
        let separator = if cfg!(windows) { ';' } else { ':' };
        let parts: Vec<&str> = path.split(separator).collect();
        // 去重：每个条目唯一。
        let mut seen = std::collections::HashSet::new();
        for p in &parts {
            assert!(seen.insert(*p), "duplicate path entry: {p}");
        }
        // 补齐常见 CLI 路径。
        #[cfg(not(windows))]
        {
            assert!(parts.contains(&"/opt/homebrew/bin"));
            assert!(parts.contains(&"/usr/local/bin"));
        }
        #[cfg(windows)]
        {
            assert!(parts.iter().any(|part| part.ends_with(".kimi-code/bin")));
            assert!(parts
                .iter()
                .any(|part| part.ends_with("AppData/Roaming/npm")));
        }
    }

    #[test]
    fn normalize_mcp_stdio_args_adds_npx_yes_for_filesystem() {
        assert_eq!(
            normalize_mcp_stdio_args(
                "npx",
                &[
                    "@modelcontextprotocol/server-filesystem".to_string(),
                    "/tmp".to_string()
                ]
            ),
            vec![
                "-y".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
                "/tmp".to_string(),
            ]
        );
    }

    #[test]
    fn normalize_mcp_stdio_args_keeps_existing_npx_yes() {
        assert_eq!(
            normalize_mcp_stdio_args(
                "npx",
                &[
                    "--yes".to_string(),
                    "@modelcontextprotocol/server-filesystem".to_string(),
                    "/tmp".to_string()
                ]
            ),
            vec![
                "--yes".to_string(),
                "@modelcontextprotocol/server-filesystem".to_string(),
                "/tmp".to_string(),
            ]
        );
    }

    #[test]
    fn normalize_mcp_stdio_args_expands_tilde_args() {
        let home = dirs::home_dir().expect("home dir required");
        assert_eq!(
            normalize_mcp_stdio_args("node", &["~/server.js".to_string()]),
            vec![home.join("server.js").to_string_lossy().to_string()]
        );
    }

    #[test]
    fn command_allowlist_supports_kimi_detection_shells() {
        assert!(validate_command("sh").is_ok());
        assert!(validate_command("powershell.exe").is_ok());
        assert!(validate_command("/bin/sh").is_ok());
    }

    #[test]
    fn panel_tmp_dir_allows_terminal_launch_scripts() {
        let panel_tmp = panel_tmp_dir().expect("home dir required");
        assert!(panel_tmp.ends_with(".kimi-code/.panel/tmp"));
        assert!(panel_tmp
            .join("terminal/kimi-launch.sh")
            .starts_with(&panel_tmp));
    }

    #[test]
    #[ignore = "requires npx network/package availability"]
    fn run_mcp_stdio_session_lists_filesystem_tools() {
        let result = tauri::async_runtime::block_on(async {
            run_mcp_stdio_session(
                "npx".to_string(),
                vec![
                    "-y".to_string(),
                    "@modelcontextprotocol/server-filesystem".to_string(),
                    "/tmp".to_string(),
                ],
                HashMap::new(),
                vec![
                    McpStdioRequest {
                        id: Some(1),
                        method: "initialize".to_string(),
                        params: Some(serde_json::json!({
                            "protocolVersion": "2025-03-26",
                            "capabilities": {},
                            "clientInfo": {
                                "name": "kimi-code-switch-gui-test",
                                "version": "0.0.0"
                            }
                        })),
                    },
                    McpStdioRequest {
                        id: None,
                        method: "notifications/initialized".to_string(),
                        params: None,
                    },
                    McpStdioRequest {
                        id: Some(2),
                        method: "tools/list".to_string(),
                        params: None,
                    },
                ],
                Some(30000),
            )
            .await
        })
        .expect("filesystem MCP tools/list should complete");

        assert_eq!(result.responses.len(), 2);
        assert!(result
            .responses
            .iter()
            .any(|response| response.get("id").and_then(|id| id.as_u64()) == Some(2)));
    }

    #[test]
    fn config_target_always_uses_kimi_code() {
        assert!(matches!(
            KimiOAuthTarget::from_config_target("kimi-cli"),
            KimiOAuthTarget::KimiCode
        ));
        assert!(matches!(
            KimiOAuthTarget::from_config_target("kimi-code"),
            KimiOAuthTarget::KimiCode
        ));
        assert!(matches!(
            KimiOAuthTarget::from_config_target("unknown"),
            KimiOAuthTarget::KimiCode
        ));
    }

    #[test]
    fn kimi_code_login_command_targets_kimi_code_install_when_available() {
        let command = find_oauth_login_command(KimiOAuthTarget::KimiCode);

        assert_eq!(command.args, vec!["login"]);
        if command.program != "kimi" {
            assert!(
                command.program.contains("kimi-code"),
                "unexpected kimi-code command path: {}",
                command.program
            );
        }
    }

    #[test]
    fn parse_device_login_line_extracts_authorization_url() {
        let event = parse_device_login_line(
            KimiOAuthTarget::KimiCode,
            "Opening browser for Kimi device login: https://auth.example/device?code=abc",
        );

        assert_eq!(event.kind, "device-code");
        assert_eq!(event.target, "kimi-code");
        assert_eq!(
            event.url.as_deref(),
            Some("https://auth.example/device?code=abc")
        );
        assert_eq!(
            event.line.as_deref(),
            Some("Opening browser for Kimi device login: https://auth.example/device?code=abc")
        );
    }

    #[test]
    fn parse_device_login_line_extracts_verification_url_and_user_code() {
        let event = parse_device_login_line(
            KimiOAuthTarget::KimiCode,
            "Verification URL: https://www.kimi.com/code/authorize_device?user_code=RSSI-UYYI",
        );

        assert_eq!(event.kind, "device-code");
        assert_eq!(event.target, "kimi-code");
        assert_eq!(
            event.url.as_deref(),
            Some("https://www.kimi.com/code/authorize_device?user_code=RSSI-UYYI")
        );
        assert_eq!(event.user_code.as_deref(), Some("RSSI-UYYI"));
    }

    #[test]
    fn parse_device_login_line_extracts_user_code() {
        let event = parse_device_login_line(
            KimiOAuthTarget::KimiCode,
            "If the browser did not open, paste the URL above and enter code: ABCD-1234",
        );

        assert_eq!(event.kind, "user-code");
        assert_eq!(event.target, "kimi-code");
        assert_eq!(event.user_code.as_deref(), Some("ABCD-1234"));
    }

    #[test]
    fn parse_device_login_line_extracts_standalone_user_code() {
        let event = parse_device_login_line(KimiOAuthTarget::KimiCode, "User Code: RSSI-UYYI");

        assert_eq!(event.kind, "user-code");
        assert_eq!(event.user_code.as_deref(), Some("RSSI-UYYI"));
    }

    #[test]
    fn parse_device_login_line_extracts_expiry_seconds() {
        let event = parse_device_login_line(KimiOAuthTarget::KimiCode, "Code expires in 600s.");

        assert_eq!(event.kind, "expires-in");
        assert_eq!(event.expires_in, Some(600));
    }

    #[test]
    fn parse_device_login_line_marks_success() {
        let event = parse_device_login_line(KimiOAuthTarget::KimiCode, "Logged in to Moonshot.");

        assert_eq!(event.kind, "success");
        assert_eq!(event.message.as_deref(), Some("Logged in to Moonshot"));
    }

    #[test]
    fn parse_device_login_line_marks_plain_success() {
        let event = parse_device_login_line(KimiOAuthTarget::KimiCode, "Logged in successfully.");

        assert_eq!(event.kind, "success");
        assert_eq!(event.message.as_deref(), Some("Logged in successfully."));
    }

    #[test]
    fn parse_device_login_line_marks_models_payment_required() {
        let event = parse_device_login_line(
            KimiOAuthTarget::KimiCode,
            "Failed to get models: 402, message='Payment Required', url='https://api.kimi.com/coding/v1/models'",
        );

        assert_eq!(event.kind, "account-required");
        assert_eq!(event.target, "kimi-code");
        assert_eq!(
            event.message.as_deref(),
            Some("Kimi OAuth authorization completed, but the Kimi models endpoint returned 402 Payment Required. Check account billing, plan, or quota, then retry.")
        );
    }

    #[test]
    fn parse_device_login_line_marks_login_failure() {
        let event = parse_device_login_line(
            KimiOAuthTarget::KimiCode,
            "Login failed: authorization expired",
        );

        assert_eq!(event.kind, "error");
        assert_eq!(event.message.as_deref(), Some("authorization expired"));
    }

    #[test]
    fn parse_device_login_line_keeps_unrecognized_output() {
        let event = parse_device_login_line(
            KimiOAuthTarget::KimiCode,
            "Waiting for authorization to complete...",
        );

        assert_eq!(event.kind, "output");
        assert_eq!(
            event.line.as_deref(),
            Some("Waiting for authorization to complete...")
        );
    }

    #[test]
    fn oauth_failure_summary_prefers_stderr() {
        let result = ExecResult {
            code: 1,
            stdout: "Verification URL: https://www.kimi.com/code/authorize_device?user_code=ABCD\n"
                .to_string(),
            stderr: "\nLogin failed: authorization expired\n".to_string(),
        };

        assert_eq!(
            summarize_oauth_login_failure(&result),
            "Login failed: authorization expired"
        );
    }

    #[test]
    fn oauth_failure_summary_identifies_models_payment_required() {
        let result = ExecResult {
            code: 1,
            stdout: [
                "Please visit the following URL to finish authorization.",
                "Verification URL: https://www.kimi.com/code/authorize_device?user_code=0FR7-01JN",
                "Failed to get models: 402, message='Payment Required',",
                "url='https://api.kimi.com/coding/v1/models'",
            ]
            .join("\n"),
            stderr: String::new(),
        };

        assert_eq!(
            summarize_oauth_login_failure(&result),
            "Kimi OAuth authorization completed, but the Kimi models endpoint returned 402 Payment Required. Check account billing, plan, or quota, then retry."
        );
    }

    #[test]
    fn oauth_failure_summary_falls_back_to_stdout() {
        let result = ExecResult {
            code: 1,
            stdout: "\nKimi OAuth login failed because the code expired\n".to_string(),
            stderr: "\n".to_string(),
        };

        assert_eq!(
            summarize_oauth_login_failure(&result),
            "Kimi OAuth login failed because the code expired"
        );
    }

    #[test]
    fn oauth_failure_summary_reports_exit_code_without_output() {
        let result = ExecResult {
            code: 42,
            stdout: String::new(),
            stderr: String::new(),
        };

        assert_eq!(
            summarize_oauth_login_failure(&result),
            "Kimi OAuth login failed with exit code 42."
        );
    }

    #[test]
    fn build_http_request_normalizes_method_to_uppercase() {
        let req = build_http_request(&client(), "get", "https://example.com/", None, None).unwrap();
        assert_eq!(req.method().as_str(), "GET");
        assert_eq!(req.url().as_str(), "https://example.com/");
    }

    #[test]
    fn build_http_request_supports_webdav_methods() {
        // WebDAV 的非标准方法（浏览器 fetch 不支持）应可构造。
        for m in ["PROPFIND", "MKCOL", "DELETE", "PUT"] {
            let req =
                build_http_request(&client(), m, "https://dav.example.com/x", None, None).unwrap();
            assert_eq!(req.method().as_str(), m);
        }
    }

    #[test]
    fn build_http_request_applies_headers_and_body() {
        let mut headers = HashMap::new();
        headers.insert("Authorization".to_string(), "Bearer t0ken".to_string());
        headers.insert("Content-Type".to_string(), "application/json".to_string());

        let req = build_http_request(
            &client(),
            "POST",
            "https://api.example.com/v1",
            Some(&headers),
            Some("{\"k\":1}".to_string()),
        )
        .unwrap();

        assert_eq!(req.method().as_str(), "POST");
        assert_eq!(req.headers().get("authorization").unwrap(), "Bearer t0ken");
        assert_eq!(
            req.headers().get("content-type").unwrap(),
            "application/json"
        );
        let body_bytes = req.body().and_then(|b| b.as_bytes()).unwrap();
        assert_eq!(body_bytes, b"{\"k\":1}");
    }

    #[test]
    fn build_http_request_rejects_invalid_method() {
        // 含空格的非法方法名应报错而非 panic。
        let err = build_http_request(&client(), "BAD METHOD", "https://x", None, None).unwrap_err();
        assert!(err.contains("invalid method"));
    }
}

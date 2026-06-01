//! 系统集成原子能力：进程执行、HTTP 请求、文件切片/元信息。
//! 对应 Electron 侧 cli.ts / terminal.ts / webdav.ts / usageIngest.ts 中需要 Node 原生能力的部分。
//! 纯逻辑（正则解析、URL 构建、流式解析等）保留在前端。

use std::collections::HashMap;
use std::io::{Read, Seek, SeekFrom};
use std::path::PathBuf;
use std::process::Command;
use std::time::Duration;

fn resolve_home(path: &str) -> PathBuf {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    PathBuf::from(path)
}

/// macOS / 类 Unix：在常见路径基础上补齐 CLI 查找路径（对应 cli.ts 的 getCliEnv）。
fn augmented_path() -> String {
    let mut entries: Vec<String> = Vec::new();
    if let Ok(p) = std::env::var("PATH") {
        entries.extend(p.split(':').map(|s| s.to_string()));
    }
    if let Some(home) = dirs::home_dir() {
        for extra in [
            "/opt/homebrew/bin".to_string(),
            "/usr/local/bin".to_string(),
            home.join(".local/bin").to_string_lossy().to_string(),
            home.join(".cargo/bin").to_string_lossy().to_string(),
            home.join(".npm-global/bin").to_string_lossy().to_string(),
            home.join(".volta/bin").to_string_lossy().to_string(),
        ] {
            entries.push(extra);
        }
    }
    let mut seen = std::collections::HashSet::new();
    entries
        .into_iter()
        .map(|e| e.trim().to_string())
        .filter(|e| !e.is_empty() && seen.insert(e.clone()))
        .collect::<Vec<_>>()
        .join(":")
}

#[derive(serde::Serialize)]
pub struct ExecResult {
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

/// 执行外部命令，拿 stdout/stderr/退出码。覆盖 kimi/uv/open/osascript 等调用。
/// timeout_ms <= 0 表示不超时（依赖系统）。
#[tauri::command]
pub async fn exec_command(
    program: String,
    args: Vec<String>,
    timeout_ms: Option<u64>,
) -> Result<ExecResult, String> {
    let handle = tauri::async_runtime::spawn_blocking(move || {
        let mut cmd = Command::new(&program);
        cmd.args(&args);
        cmd.env("PATH", augmented_path());
        cmd.output()
    });

    // 简单超时：spawn_blocking 无法直接 kill，这里用 tokio timeout 包裹 join。
    let output = match timeout_ms {
        Some(ms) if ms > 0 => {
            match tokio::time::timeout(Duration::from_millis(ms), handle).await {
                Ok(joined) => joined.map_err(|e| format!("join error: {e}"))?,
                Err(_) => return Err(format!("command timed out after {ms}ms")),
            }
        }
        _ => handle.await.map_err(|e| format!("join error: {e}"))?,
    };

    let output = output.map_err(|e| format!("spawn error: {e}"))?;
    Ok(ExecResult {
        code: output.status.code().unwrap_or(-1),
        stdout: String::from_utf8_lossy(&output.stdout).to_string(),
        stderr: String::from_utf8_lossy(&output.stderr).to_string(),
    })
}

/// 写文件并赋可执行权限（terminal.ts 的 iTerm 启动脚本用）。
#[tauri::command]
pub fn write_executable(path: String, content: String) -> Result<(), String> {
    let resolved = resolve_home(&path);
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
#[tauri::command]
pub fn read_file_slice(path: String, offset: u64, length: u64) -> Result<String, String> {
    let resolved = resolve_home(&path);
    let mut file = std::fs::File::open(&resolved).map_err(|e| format!("open: {e}"))?;
    file.seek(SeekFrom::Start(offset))
        .map_err(|e| format!("seek: {e}"))?;
    let mut buf = vec![0u8; length as usize];
    let n = file.read(&mut buf).map_err(|e| format!("read: {e}"))?;
    buf.truncate(n);
    Ok(String::from_utf8_lossy(&buf).to_string())
}

#[derive(serde::Serialize)]
pub struct HttpResponse {
    pub status: u16,
    pub ok: bool,
    pub body: String,
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
    let client = reqwest::Client::builder()
        .danger_accept_invalid_certs(false)
        .build()
        .map_err(|e| format!("client build: {e}"))?;

    let req_method = reqwest::Method::from_bytes(method.to_uppercase().as_bytes())
        .map_err(|e| format!("invalid method {method}: {e}"))?;
    let mut req = client.request(req_method, &url);

    if let Some(hs) = headers {
        for (k, v) in hs {
            req = req.header(k, v);
        }
    }
    if let Some(b) = body {
        req = req.body(b);
    }

    let resp = req.send().await.map_err(|e| format!("request: {e}"))?;
    let status = resp.status();
    let text = resp.text().await.map_err(|e| format!("read body: {e}"))?;
    Ok(HttpResponse {
        status: status.as_u16(),
        ok: status.is_success(),
        body: text,
    })
}

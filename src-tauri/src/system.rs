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
    let text = resp.text().await.map_err(|e| format!("read body: {e}"))?;
    Ok(HttpResponse {
        status: status.as_u16(),
        ok: status.is_success(),
        body: text,
    })
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
        let parts: Vec<&str> = path.split(':').collect();
        // 去重：每个条目唯一。
        let mut seen = std::collections::HashSet::new();
        for p in &parts {
            assert!(seen.insert(*p), "duplicate path entry: {p}");
        }
        // 补齐常见 CLI 路径。
        assert!(parts.contains(&"/opt/homebrew/bin"));
        assert!(parts.contains(&"/usr/local/bin"));
    }

    #[test]
    fn build_http_request_normalizes_method_to_uppercase() {
        let req = build_http_request(&client(), "get", "https://example.com/", None, None)
            .unwrap();
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
        assert_eq!(
            req.headers().get("authorization").unwrap(),
            "Bearer t0ken"
        );
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
        let err = build_http_request(&client(), "BAD METHOD", "https://x", None, None)
            .unwrap_err();
        assert!(err.contains("invalid method"));
    }
}

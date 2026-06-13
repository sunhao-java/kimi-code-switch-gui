//! 文件读写原子能力——对应 Electron 侧 src/main/modules/fileAccess.ts
//! 前端 shared/configStore 的 FileAccess 接口下沉到这里，通过 invoke 调用。

use std::path::{Path, PathBuf};

/// 解析 `~/` 前缀为用户主目录绝对路径。
pub(crate) fn resolve_home(path: &str) -> PathBuf {
    if let Some(stripped) = path.strip_prefix("~/") {
        if let Some(home) = dirs::home_dir() {
            return home.join(stripped);
        }
    }
    if path == "~" {
        if let Some(home) = dirs::home_dir() {
            return home;
        }
    }
    PathBuf::from(path)
}

/// 读取文本文件。文件不存在时返回 None（对应 TS 的 null），而非报错。
#[tauri::command]
pub fn read_text(path: String) -> Result<Option<String>, String> {
    let resolved = resolve_home(&path);
    match std::fs::read_to_string(&resolved) {
        Ok(content) => Ok(Some(content)),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(err) => Err(format!("read_text {}: {}", resolved.display(), err)),
    }
}

/// 写入文本文件（覆盖）。
#[tauri::command]
pub fn write_text(path: String, content: String) -> Result<(), String> {
    let resolved = resolve_home(&path);
    if let Some(parent) = resolved.parent() {
        if !parent.exists() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("ensure parent {}: {}", parent.display(), e))?;
        }
    }
    std::fs::write(&resolved, content)
        .map_err(|e| format!("write_text {}: {}", resolved.display(), e))
}

/// 递归创建目录。
#[tauri::command]
pub fn ensure_dir(path: String) -> Result<(), String> {
    let resolved = resolve_home(&path);
    std::fs::create_dir_all(&resolved)
        .map_err(|e| format!("ensure_dir {}: {}", resolved.display(), e))
}

/// 删除文件（不存在时静默成功）。
#[tauri::command]
pub fn remove_file(path: String) -> Result<(), String> {
    let resolved = resolve_home(&path);
    match std::fs::remove_file(&resolved) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("remove_file {}: {}", resolved.display(), err)),
    }
}

/// 递归删除目录（不存在时静默成功）。用于备份轮转/恢复。
#[tauri::command]
pub fn remove_dir(path: String) -> Result<(), String> {
    let resolved = resolve_home(&path);
    match std::fs::remove_dir_all(&resolved) {
        Ok(()) => Ok(()),
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(err) => Err(format!("remove_dir {}: {}", resolved.display(), err)),
    }
}

/// 移动文件（支持跨目录）。
#[tauri::command]
pub fn move_file(from: String, to: String) -> Result<(), String> {
    let from_resolved = resolve_home(&from);
    let to_resolved = resolve_home(&to);

    if !from_resolved.exists() {
        return Err(format!(
            "Source file does not exist: {}",
            from_resolved.display()
        ));
    }

    // 确保目标目录存在
    if let Some(parent) = to_resolved.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("create parent dir {}: {}", parent.display(), e))?;
    }

    // 移动文件
    std::fs::rename(&from_resolved, &to_resolved).map_err(|e| {
        format!(
            "move {} to {}: {}",
            from_resolved.display(),
            to_resolved.display(),
            e
        )
    })
}

/// 主机名（备份元信息用）。
#[tauri::command]
pub fn hostname() -> String {
    std::env::var("HOSTNAME")
        .ok()
        .or_else(|| {
            std::process::Command::new("hostname")
                .output()
                .ok()
                .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        })
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown-host".to_string())
}

/// 列目录下的子目录名（供备份枚举）。
#[tauri::command]
pub fn list_subdirs(path: String) -> Result<Vec<String>, String> {
    let resolved = resolve_home(&path);
    let entries = match std::fs::read_dir(&resolved) {
        Ok(e) => e,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(format!("list_subdirs {}: {}", resolved.display(), err)),
    };
    let mut names = Vec::new();
    for entry in entries.flatten() {
        if entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
            if let Some(name) = entry.file_name().to_str() {
                names.push(name.to_string());
            }
        }
    }
    Ok(names)
}

/// 判断路径是否存在。
#[tauri::command]
pub fn path_exists(path: String) -> bool {
    Path::new(&resolve_home(&path)).exists()
}

/// 列目录下的文件名（非递归）。
#[tauri::command]
pub fn list_dir(path: String) -> Result<Vec<String>, String> {
    let resolved = resolve_home(&path);
    let entries = match std::fs::read_dir(&resolved) {
        Ok(e) => e,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(format!("list_dir {}: {}", resolved.display(), err)),
    };
    let mut names = Vec::new();
    for entry in entries.flatten() {
        if let Some(name) = entry.file_name().to_str() {
            names.push(name.to_string());
        }
    }
    Ok(names)
}

#[derive(serde::Serialize)]
pub struct DirEntry {
    pub name: String,
    #[serde(rename = "isDirectory")]
    pub is_directory: bool,
}

/// 列目录条目（带是否目录标记）。供 skillsStore 的 SkillFileAccess.listDir 使用。
#[tauri::command]
pub fn list_dir_typed(path: String) -> Result<Vec<DirEntry>, String> {
    let resolved = resolve_home(&path);
    let entries = match std::fs::read_dir(&resolved) {
        Ok(e) => e,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
        Err(err) => return Err(format!("list_dir_typed {}: {}", resolved.display(), err)),
    };
    let mut result = Vec::new();
    for entry in entries.flatten() {
        if let Some(name) = entry.file_name().to_str() {
            let is_directory = entry.file_type().map(|t| t.is_dir()).unwrap_or(false);
            result.push(DirEntry {
                name: name.to_string(),
                is_directory,
            });
        }
    }
    Ok(result)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolve_home_expands_tilde_prefix() {
        let home = dirs::home_dir().expect("home dir required for this test");
        let resolved = resolve_home("~/.kimi/config.toml");
        assert_eq!(resolved, home.join(".kimi/config.toml"));
    }

    #[test]
    fn resolve_home_expands_bare_tilde() {
        let home = dirs::home_dir().expect("home dir required for this test");
        assert_eq!(resolve_home("~"), home);
    }

    #[test]
    fn resolve_home_keeps_absolute_path_unchanged() {
        // 绝对路径不含 ~ 前缀，应原样返回。
        assert_eq!(resolve_home("/etc/hosts"), PathBuf::from("/etc/hosts"));
    }

    #[test]
    fn resolve_home_keeps_relative_path_unchanged() {
        // 相对路径既非 "~" 也无 "~/" 前缀，原样返回。
        assert_eq!(resolve_home("foo/bar.txt"), PathBuf::from("foo/bar.txt"));
    }

    #[test]
    fn resolve_home_does_not_expand_tilde_in_middle() {
        // 只识别开头的 ~/ 与单独的 ~，路径中间的 ~ 不展开。
        assert_eq!(resolve_home("/var/~cache"), PathBuf::from("/var/~cache"));
    }

    #[test]
    fn dir_entry_serializes_is_directory_camel_case() {
        let entry = DirEntry {
            name: "skills".to_string(),
            is_directory: true,
        };
        let json = serde_json::to_value(&entry).unwrap();
        assert_eq!(json["name"], "skills");
        // serde rename 应输出 camelCase 键 isDirectory。
        assert_eq!(json["isDirectory"], true);
        assert!(json.get("is_directory").is_none());
    }
}

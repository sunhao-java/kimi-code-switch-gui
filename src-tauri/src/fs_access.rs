//! 文件读写原子能力——对应 Electron 侧 src/main/modules/fileAccess.ts
//! 前端 shared/configStore 的 FileAccess 接口下沉到这里，通过 invoke 调用。

use std::path::{Path, PathBuf};

/// 解析 `~/` 前缀为用户主目录绝对路径。
fn resolve_home(path: &str) -> PathBuf {
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

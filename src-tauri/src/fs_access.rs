//! 文件读写原子能力——对应 Electron 侧 src/main/modules/fileAccess.ts
//! 前端 shared/configStore 的 FileAccess 接口下沉到这里，通过 invoke 调用。

use std::path::{Path, PathBuf};

const KIMI_CODE_HOME: &str = ".kimi-code";
const PANEL_APP_DIR: &str = ".kimi-code-switch-gui";
const ENV_DIR: &str = ".kimi-code-switch-gui/.env";
const DEFAULT_ENV_DIR: &str = ".kimi-code-switch-gui/.env/default";

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

/// 验证路径是否在允许的目录范围内。
/// 允许的路径：~/.kimi、~/.kimi-code、~/.kimi-code-switch-gui，以及显式选择的导入/导出路径。
/// 注意：这是防御性检查，主要防止前端代码错误或供应链攻击。
pub(crate) fn validate_path_scope(path: &Path) -> Result<(), String> {
    let path_str = path.to_string_lossy();

    // 拒绝任何包含 `..` 的路径。合法路径（前端构造的固定路径、file dialog 返回的规范路径）
    // 都不含 `..`；带 `..` 必为路径穿越尝试（如 ~/.kimi/../../.ssh），因 starts_with 逐段
    // 比较不解析 `..`，否则可越界写/删。
    if path
        .components()
        .any(|c| matches!(c, std::path::Component::ParentDir))
    {
        return Err(format!(
            "Path '{}' contains '..' segments and is not allowed",
            path_str
        ));
    }

    // 允许的基础路径
    let allowed_bases = [
        dirs::home_dir().map(|h| h.join(".kimi")),
        dirs::home_dir().map(|h| h.join(".kimi-code")),
        dirs::home_dir().map(|h| h.join(".kimi-code-switch-gui")),
    ];

    // 检查是否在允许的基础路径下
    for base in allowed_bases.iter().flatten() {
        if path.starts_with(base) {
            return Ok(());
        }
    }

    // 绝对路径且不在允许范围内时，假定为用户显式选择的导入/导出路径
    // （通过 Tauri 的 file dialog API 选择的路径应该被允许）
    if path.is_absolute() && !path_str.starts_with("~") {
        // 这里我们信任绝对路径，因为它们应该来自用户的显式文件选择对话框
        return Ok(());
    }

    Err(format!(
        "Path '{}' is outside allowed directories (~/.kimi, ~/.kimi-code, ~/.kimi-code-switch-gui, or explicitly selected paths)",
        path_str
    ))
}

fn home_child(relative: &str) -> Result<PathBuf, String> {
    dirs::home_dir()
        .map(|home| home.join(relative))
        .ok_or_else(|| "Unable to resolve home directory".to_string())
}

fn copy_dir_recursive(from: &Path, to: &Path) -> Result<(), String> {
    if !from.exists() {
        std::fs::create_dir_all(to).map_err(|e| format!("create {}: {}", to.display(), e))?;
        return Ok(());
    }
    if !from.is_dir() {
        return Err(format!("Source is not a directory: {}", from.display()));
    }
    std::fs::create_dir_all(to).map_err(|e| format!("create {}: {}", to.display(), e))?;
    for entry in
        std::fs::read_dir(from).map_err(|e| format!("read_dir {}: {}", from.display(), e))?
    {
        let entry = entry.map_err(|e| format!("read_dir entry {}: {}", from.display(), e))?;
        let file_name = entry.file_name();
        let source = entry.path();
        let target = to.join(file_name);
        let file_type = entry
            .file_type()
            .map_err(|e| format!("file_type {}: {}", source.display(), e))?;
        if file_type.is_symlink() {
            let link_target = std::fs::read_link(&source)
                .map_err(|e| format!("read_link {}: {}", source.display(), e))?;
            create_symlink_path(&link_target, &target)?;
        } else if file_type.is_dir() {
            copy_dir_recursive(&source, &target)?;
        } else if file_type.is_file() {
            std::fs::copy(&source, &target)
                .map_err(|e| format!("copy {} to {}: {}", source.display(), target.display(), e))?;
        }
    }
    Ok(())
}

#[cfg(unix)]
fn create_symlink_path(target: &Path, link: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(target, link)
        .map_err(|e| format!("symlink {} -> {}: {}", link.display(), target.display(), e))
}

#[cfg(windows)]
fn create_symlink_path(target: &Path, link: &Path) -> Result<(), String> {
    if target.is_dir() {
        std::os::windows::fs::symlink_dir(target, link)
    } else {
        std::os::windows::fs::symlink_file(target, link)
    }
    .map_err(|e| format!("symlink {} -> {}: {}", link.display(), target.display(), e))
}

fn remove_link_or_empty_dir(path: &Path) -> Result<(), String> {
    let metadata = match std::fs::symlink_metadata(path) {
        Ok(metadata) => metadata,
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(err) => return Err(format!("stat {}: {}", path.display(), err)),
    };
    if metadata.file_type().is_symlink() || metadata.is_file() {
        std::fs::remove_file(path).map_err(|e| format!("remove {}: {}", path.display(), e))
    } else if metadata.is_dir() {
        let mut entries =
            std::fs::read_dir(path).map_err(|e| format!("read_dir {}: {}", path.display(), e))?;
        if entries.next().is_none() {
            std::fs::remove_dir(path).map_err(|e| format!("remove_dir {}: {}", path.display(), e))
        } else {
            Err(format!(
                "{} is a real directory and is not empty; run environment layout migration first",
                path.display()
            ))
        }
    } else {
        Err(format!("Unsupported file type at {}", path.display()))
    }
}

fn sanitize_environment_id(value: &str) -> Result<String, String> {
    let id = value.trim();
    if id.is_empty() {
        return Err("Environment id cannot be empty".to_string());
    }
    if id.contains('/') || id.contains('\\') || id == "." || id == ".." || id.contains("..") {
        return Err(format!("Invalid environment id: {}", value));
    }
    Ok(id.to_string())
}

#[derive(serde::Serialize)]
pub struct KimiCodeEnvironmentLayout {
    #[serde(rename = "defaultHomePath")]
    pub default_home_path: String,
    #[serde(rename = "managedDefaultPath")]
    pub managed_default_path: String,
    #[serde(rename = "environmentsPath")]
    pub environments_path: String,
    #[serde(rename = "defaultWasMigrated")]
    pub default_was_migrated: bool,
    #[serde(rename = "linkWasUpdated")]
    pub link_was_updated: bool,
}

/// 确保 Kimi Code 多环境目录采用 GUI 托管布局：
/// ~/.kimi-code -> ~/.kimi-code-switch-gui/.env/<active>
/// 首次迁移会把真实 ~/.kimi-code 目录复制到托管 default。
#[tauri::command]
pub fn ensure_kimi_code_environment_layout(
    active_environment_id: String,
) -> Result<KimiCodeEnvironmentLayout, String> {
    let kimi_home = home_child(KIMI_CODE_HOME)?;
    let panel_dir = home_child(PANEL_APP_DIR)?;
    let env_dir = home_child(ENV_DIR)?;
    let managed_default = home_child(DEFAULT_ENV_DIR)?;
    std::fs::create_dir_all(&panel_dir)
        .map_err(|e| format!("create {}: {}", panel_dir.display(), e))?;
    std::fs::create_dir_all(&env_dir)
        .map_err(|e| format!("create {}: {}", env_dir.display(), e))?;

    let mut default_was_migrated = false;
    match std::fs::symlink_metadata(&kimi_home) {
        Ok(metadata) if metadata.file_type().is_symlink() => {
            std::fs::create_dir_all(&managed_default)
                .map_err(|e| format!("create {}: {}", managed_default.display(), e))?;
        }
        Ok(metadata) if metadata.is_dir() => {
            copy_dir_recursive(&kimi_home, &managed_default)?;
            default_was_migrated = true;
            std::fs::remove_dir_all(&kimi_home)
                .map_err(|e| format!("remove_dir_all {}: {}", kimi_home.display(), e))?;
        }
        Ok(metadata) if metadata.is_file() => {
            return Err(format!(
                "{} is a file, expected a directory",
                kimi_home.display()
            ));
        }
        Ok(_) => {
            return Err(format!("Unsupported file type at {}", kimi_home.display()));
        }
        Err(err) if err.kind() == std::io::ErrorKind::NotFound => {
            std::fs::create_dir_all(&managed_default)
                .map_err(|e| format!("create {}: {}", managed_default.display(), e))?;
        }
        Err(err) => return Err(format!("stat {}: {}", kimi_home.display(), err)),
    }

    let link_was_updated = activate_kimi_code_environment_link(active_environment_id)?;
    Ok(KimiCodeEnvironmentLayout {
        default_home_path: "~/.kimi-code".to_string(),
        managed_default_path: "~/.kimi-code-switch-gui/.env/default".to_string(),
        environments_path: "~/.kimi-code-switch-gui/.env".to_string(),
        default_was_migrated,
        link_was_updated,
    })
}

/// 将 ~/.kimi-code 软链切换到指定托管环境目录。
#[tauri::command]
pub fn activate_kimi_code_environment_link(environment_id: String) -> Result<bool, String> {
    let kimi_home = home_child(KIMI_CODE_HOME)?;
    let env_dir = home_child(ENV_DIR)?;
    let target = env_dir.join(sanitize_environment_id(&environment_id)?);
    validate_path_scope(&target)?;
    std::fs::create_dir_all(&target).map_err(|e| format!("create {}: {}", target.display(), e))?;

    if let Ok(current_target) = std::fs::read_link(&kimi_home) {
        if current_target == target {
            return Ok(false);
        }
    }
    remove_link_or_empty_dir(&kimi_home)?;
    create_symlink_path(&target, &kimi_home)?;
    Ok(true)
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
    validate_path_scope(&resolved)?;
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
    validate_path_scope(&resolved)?;
    std::fs::create_dir_all(&resolved)
        .map_err(|e| format!("ensure_dir {}: {}", resolved.display(), e))
}

/// 删除文件（不存在时静默成功）。
#[tauri::command]
pub fn remove_file(path: String) -> Result<(), String> {
    let resolved = resolve_home(&path);
    validate_path_scope(&resolved)?;
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
    validate_path_scope(&resolved)?;
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
    validate_path_scope(&from_resolved)?;
    validate_path_scope(&to_resolved)?;

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

/// 递归复制目录。目标目录不存在时创建，已存在时覆盖同名文件。
#[tauri::command]
pub fn copy_dir(from: String, to: String) -> Result<(), String> {
    let from_resolved = resolve_home(&from);
    let to_resolved = resolve_home(&to);
    validate_path_scope(&from_resolved)?;
    validate_path_scope(&to_resolved)?;
    copy_dir_recursive(&from_resolved, &to_resolved)
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
    fn validate_path_scope_allows_kimi_dirs() {
        let home = dirs::home_dir().expect("home dir required for this test");
        assert!(validate_path_scope(&home.join(".kimi/config.toml")).is_ok());
        assert!(validate_path_scope(&home.join(".kimi-code/config.toml")).is_ok());
        assert!(validate_path_scope(&home.join(".kimi-code-switch-gui/app.db")).is_ok());
    }

    #[test]
    fn validate_path_scope_rejects_parent_traversal() {
        let home = dirs::home_dir().expect("home dir required for this test");
        // ~/.kimi/../../.ssh/id_rsa 之类的穿越必含 `..`，应被拒绝
        let traversal = home.join(".kimi/../../.ssh/id_rsa");
        assert!(validate_path_scope(&traversal).is_err());
        assert!(validate_path_scope(&resolve_home("~/.kimi/../.ssh/id_rsa")).is_err());
    }

    #[test]
    fn validate_path_scope_allows_explicit_absolute_paths() {
        // file dialog 返回的规范绝对路径（无 `..`）仍允许，用于导入/导出
        assert!(validate_path_scope(&PathBuf::from("/tmp/export-backup.zip")).is_ok());
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

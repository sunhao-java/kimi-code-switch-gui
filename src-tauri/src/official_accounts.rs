//! Kimi 官方账号槽位管理。
//!
//! 设计目标：GUI 只管理账号元数据和凭据槽位路径，不解析、不展示 token。
//! Kimi Code 运行时仍只读取标准 `~/.kimi-code/credentials`；切换账号时，
//! 将当前凭据同步回当前账号槽位，再把目标账号槽位物化到标准 credentials 目录。

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};

use rusqlite::{params, Connection, OptionalExtension};

use crate::fs_access::{resolve_home, validate_path_scope};

static ACCOUNT_SWITCH_RUNNING: AtomicBool = AtomicBool::new(false);

const DB_PATH: &str = "~/.kimi-code/.panel/app.db";
const ACCOUNTS_ROOT: &str = "~/.kimi-code/.panel/official-accounts";
const CREDENTIALS_PATH: &str = "~/.kimi-code/credentials";
const KIMI_CODE_CREDENTIAL_FILENAMES: &[&str] = &[
    "kimi-code.json",
    "kimi.json",
    "moonshot.json",
    "oauth.json",
    "auth.json",
    "credentials.json",
];

#[derive(Debug, serde::Serialize, serde::Deserialize)]
pub struct OfficialAccount {
    pub id: String,
    pub display_name: String,
    pub account_hint: String,
    pub status: String,
    pub is_active: bool,
    pub credentials_slot_path: String,
    pub last_login_at: String,
    pub last_checked_at: String,
    pub last_used_at: String,
    pub metadata_json: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, serde::Serialize)]
pub struct OfficialAccountOperationResult {
    pub account: OfficialAccount,
    pub active_account_id: String,
    pub credentials_present: bool,
}

#[derive(Debug, serde::Serialize)]
pub struct OfficialAccountCredentialsStatus {
    pub active_account_id: String,
    pub credentials_present: bool,
    pub standard_credentials_path: String,
}

struct SwitchLock;

impl SwitchLock {
    fn acquire() -> Result<Self, String> {
        ACCOUNT_SWITCH_RUNNING
            .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
            .map_err(|_| "Official account credential operation is already running.".to_string())?;
        Ok(Self)
    }
}

impl Drop for SwitchLock {
    fn drop(&mut self) {
        ACCOUNT_SWITCH_RUNNING.store(false, Ordering::SeqCst);
    }
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

fn db_path() -> PathBuf {
    resolve_home(DB_PATH)
}

fn accounts_root() -> PathBuf {
    resolve_home(ACCOUNTS_ROOT)
}

fn standard_credentials_dir() -> PathBuf {
    resolve_home(CREDENTIALS_PATH)
}

fn open_conn() -> Result<Connection, String> {
    let path = db_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("ensure official accounts db dir: {e}"))?;
    }
    let conn = Connection::open(&path).map_err(|e| format!("open official accounts db: {e}"))?;
    conn.execute_batch(
        "PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA foreign_keys=ON; \
         PRAGMA busy_timeout=5000;",
    )
    .map_err(|e| format!("official accounts pragma: {e}"))?;
    ensure_schema(&conn)?;
    Ok(conn)
}

fn ensure_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS official_accounts (
          id TEXT PRIMARY KEY,
          display_name TEXT NOT NULL,
          account_hint TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL,
          is_active INTEGER NOT NULL DEFAULT 0,
          credentials_slot_path TEXT NOT NULL,
          last_login_at TEXT NOT NULL DEFAULT '',
          last_checked_at TEXT NOT NULL DEFAULT '',
          last_used_at TEXT NOT NULL DEFAULT '',
          metadata_json TEXT NOT NULL DEFAULT '{}',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_official_accounts_active
          ON official_accounts(is_active)
          WHERE is_active = 1;",
    )
    .map_err(|e| format!("official accounts schema: {e}"))
}

fn row_to_account(row: &rusqlite::Row<'_>) -> rusqlite::Result<OfficialAccount> {
    Ok(OfficialAccount {
        id: row.get(0)?,
        display_name: row.get(1)?,
        account_hint: row.get(2)?,
        status: row.get(3)?,
        is_active: row.get::<_, i64>(4)? != 0,
        credentials_slot_path: row.get(5)?,
        last_login_at: row.get(6)?,
        last_checked_at: row.get(7)?,
        last_used_at: row.get(8)?,
        metadata_json: row.get(9)?,
        created_at: row.get(10)?,
        updated_at: row.get(11)?,
    })
}

fn get_account(conn: &Connection, id: &str) -> Result<Option<OfficialAccount>, String> {
    conn.query_row(
        "SELECT id, display_name, account_hint, status, is_active, credentials_slot_path,
                last_login_at, last_checked_at, last_used_at, metadata_json, created_at, updated_at
         FROM official_accounts WHERE id = ?1",
        params![id],
        row_to_account,
    )
    .optional()
    .map_err(|e| format!("get official account: {e}"))
}

fn get_active_account(conn: &Connection) -> Result<Option<OfficialAccount>, String> {
    conn.query_row(
        "SELECT id, display_name, account_hint, status, is_active, credentials_slot_path,
                last_login_at, last_checked_at, last_used_at, metadata_json, created_at, updated_at
         FROM official_accounts WHERE is_active = 1 LIMIT 1",
        [],
        row_to_account,
    )
    .optional()
    .map_err(|e| format!("get active official account: {e}"))
}

fn safe_account_id(id: &str) -> Result<String, String> {
    let trimmed = id.trim();
    if trimmed.is_empty() {
        return Err("Official account id cannot be empty.".to_string());
    }
    if trimmed
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        Ok(trimmed.to_string())
    } else {
        Err("Official account id may only contain letters, numbers, '-' and '_'.".to_string())
    }
}

fn create_account_id() -> String {
    format!("acct-{}", chrono::Utc::now().timestamp_millis())
}

fn account_slot_dir(id: &str) -> Result<PathBuf, String> {
    let safe_id = safe_account_id(id)?;
    let path = accounts_root().join(safe_id).join("credentials");
    validate_path_scope(&path)?;
    Ok(path)
}

fn path_to_tilde(path: &Path) -> String {
    if let Some(home) = dirs::home_dir() {
        if let Ok(stripped) = path.strip_prefix(home) {
            return format!("~/{}", stripped.to_string_lossy());
        }
    }
    path.to_string_lossy().to_string()
}

fn credentials_files_in(dir: &Path) -> Result<Vec<PathBuf>, String> {
    if !dir.exists() {
        return Ok(Vec::new());
    }
    let mut files = Vec::new();
    for entry in
        fs::read_dir(dir).map_err(|e| format!("read credentials dir {}: {e}", dir.display()))?
    {
        let entry = entry.map_err(|e| format!("read credentials entry: {e}"))?;
        let path = entry.path();
        if path.is_file() {
            if let Some(name) = path.file_name().and_then(|value| value.to_str()) {
                if KIMI_CODE_CREDENTIAL_FILENAMES.contains(&name) {
                    files.push(path);
                }
            }
        }
    }
    Ok(files)
}

fn has_credentials(dir: &Path) -> Result<bool, String> {
    Ok(!credentials_files_in(dir)?.is_empty())
}

#[cfg(unix)]
fn set_private_permissions(path: &Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    if path.is_dir() {
        fs::set_permissions(path, fs::Permissions::from_mode(0o700))
            .map_err(|e| format!("chmod dir {}: {e}", path.display()))?;
    } else if path.is_file() {
        fs::set_permissions(path, fs::Permissions::from_mode(0o600))
            .map_err(|e| format!("chmod file {}: {e}", path.display()))?;
    }
    Ok(())
}

#[cfg(not(unix))]
fn set_private_permissions(_path: &Path) -> Result<(), String> {
    Ok(())
}

fn ensure_private_dir(path: &Path) -> Result<(), String> {
    validate_path_scope(path)?;
    fs::create_dir_all(path).map_err(|e| format!("ensure private dir {}: {e}", path.display()))?;
    set_private_permissions(path)?;
    Ok(())
}

fn remove_kimi_code_credentials(dir: &Path) -> Result<(), String> {
    if !dir.exists() {
        return Ok(());
    }
    for file in credentials_files_in(dir)? {
        fs::remove_file(&file).map_err(|e| format!("remove credential {}: {e}", file.display()))?;
    }
    Ok(())
}

fn copy_kimi_code_credentials(from: &Path, to: &Path) -> Result<bool, String> {
    ensure_private_dir(to)?;
    remove_kimi_code_credentials(to)?;
    let files = credentials_files_in(from)?;
    for file in &files {
        let file_name = file
            .file_name()
            .ok_or_else(|| format!("credential file has no name: {}", file.display()))?;
        let target = to.join(file_name);
        fs::copy(file, &target).map_err(|e| {
            format!(
                "copy credential {} -> {}: {e}",
                file.display(),
                target.display()
            )
        })?;
        set_private_permissions(&target)?;
    }
    Ok(!files.is_empty())
}

fn sync_current_credentials_to_slot(account: &OfficialAccount) -> Result<bool, String> {
    let from = standard_credentials_dir();
    let to = resolve_home(&account.credentials_slot_path);
    copy_kimi_code_credentials(&from, &to)
}

fn materialize_slot_to_current(account: &OfficialAccount) -> Result<bool, String> {
    let from = resolve_home(&account.credentials_slot_path);
    let to = standard_credentials_dir();
    copy_kimi_code_credentials(&from, &to)
}

fn clear_current_credentials() -> Result<(), String> {
    let dir = standard_credentials_dir();
    ensure_private_dir(&dir)?;
    remove_kimi_code_credentials(&dir)
}

fn insert_account(
    conn: &Connection,
    id: &str,
    display_name: &str,
    account_hint: &str,
    status: &str,
    is_active: bool,
    slot_path: &str,
) -> Result<OfficialAccount, String> {
    let now = now_iso();
    conn.execute(
        "INSERT INTO official_accounts (
          id, display_name, account_hint, status, is_active, credentials_slot_path,
          last_login_at, last_checked_at, last_used_at, metadata_json, created_at, updated_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, '', ?8, '{}', ?9, ?10)",
        params![
            id,
            display_name,
            account_hint,
            status,
            if is_active { 1 } else { 0 },
            slot_path,
            if status == "logged-in" {
                now.as_str()
            } else {
                ""
            },
            if is_active { now.as_str() } else { "" },
            now,
            now,
        ],
    )
    .map_err(|e| format!("insert official account: {e}"))?;
    get_account(conn, id)?.ok_or_else(|| "Official account was not saved.".to_string())
}

#[tauri::command]
pub fn init_official_accounts_store() -> Result<(), String> {
    let conn = open_conn()?;
    ensure_schema(&conn)
}

#[tauri::command]
pub fn list_official_accounts() -> Result<Vec<OfficialAccount>, String> {
    let conn = open_conn()?;
    let mut stmt = conn
        .prepare(
            "SELECT id, display_name, account_hint, status, is_active, credentials_slot_path,
                    last_login_at, last_checked_at, last_used_at, metadata_json, created_at, updated_at
             FROM official_accounts
             ORDER BY is_active DESC, updated_at DESC, display_name COLLATE NOCASE ASC",
        )
        .map_err(|e| format!("prepare list official accounts: {e}"))?;
    let rows = stmt
        .query_map([], row_to_account)
        .map_err(|e| format!("query official accounts: {e}"))?;
    let mut out = Vec::new();
    for row in rows {
        out.push(row.map_err(|e| format!("read official account row: {e}"))?);
    }
    Ok(out)
}

#[tauri::command]
pub fn get_official_account_credentials_status() -> Result<OfficialAccountCredentialsStatus, String>
{
    let conn = open_conn()?;
    let active = get_active_account(&conn)?;
    let current_dir = standard_credentials_dir();
    Ok(OfficialAccountCredentialsStatus {
        active_account_id: active.map(|account| account.id).unwrap_or_default(),
        credentials_present: has_credentials(&current_dir)?,
        standard_credentials_path: path_to_tilde(&current_dir),
    })
}

#[tauri::command]
pub fn create_official_account(display_name: String) -> Result<OfficialAccount, String> {
    let conn = open_conn()?;
    let id = create_account_id();
    let slot_dir = account_slot_dir(&id)?;
    ensure_private_dir(&slot_dir)?;
    let name = if display_name.trim().is_empty() {
        "Kimi Official Account".to_string()
    } else {
        display_name.trim().to_string()
    };
    insert_account(
        &conn,
        &id,
        &name,
        "",
        "empty",
        false,
        &path_to_tilde(&slot_dir),
    )
}

#[tauri::command]
pub fn rename_official_account(
    id: String,
    display_name: String,
) -> Result<OfficialAccount, String> {
    let conn = open_conn()?;
    let safe_id = safe_account_id(&id)?;
    let name = display_name.trim();
    if name.is_empty() {
        return Err("Official account display name cannot be empty.".to_string());
    }
    let now = now_iso();
    conn.execute(
        "UPDATE official_accounts SET display_name = ?1, updated_at = ?2 WHERE id = ?3",
        params![name, now, safe_id],
    )
    .map_err(|e| format!("rename official account: {e}"))?;
    get_account(&conn, &safe_id)?.ok_or_else(|| "Official account not found.".to_string())
}

#[tauri::command]
pub fn capture_current_official_account(
    display_name: String,
) -> Result<OfficialAccountOperationResult, String> {
    let _lock = SwitchLock::acquire()?;
    let conn = open_conn()?;
    let id = create_account_id();
    let slot_dir = account_slot_dir(&id)?;
    ensure_private_dir(&slot_dir)?;
    let credentials_present = copy_kimi_code_credentials(&standard_credentials_dir(), &slot_dir)?;
    let name = if display_name.trim().is_empty() {
        "Current Kimi Account".to_string()
    } else {
        display_name.trim().to_string()
    };
    conn.execute("UPDATE official_accounts SET is_active = 0", [])
        .map_err(|e| format!("clear active official account: {e}"))?;
    let account = insert_account(
        &conn,
        &id,
        &name,
        "",
        if credentials_present {
            "logged-in"
        } else {
            "empty"
        },
        true,
        &path_to_tilde(&slot_dir),
    )?;
    Ok(OfficialAccountOperationResult {
        active_account_id: account.id.clone(),
        account,
        credentials_present,
    })
}

#[tauri::command]
pub fn prepare_official_account_login(
    id: String,
) -> Result<OfficialAccountOperationResult, String> {
    let _lock = SwitchLock::acquire()?;
    let conn = open_conn()?;
    let safe_id = safe_account_id(&id)?;
    let account =
        get_account(&conn, &safe_id)?.ok_or_else(|| "Official account not found.".to_string())?;
    if let Some(active) = get_active_account(&conn)? {
        let _ = sync_current_credentials_to_slot(&active);
    }
    clear_current_credentials()?;
    Ok(OfficialAccountOperationResult {
        active_account_id: account.id.clone(),
        account,
        credentials_present: false,
    })
}

#[tauri::command]
pub fn complete_official_account_login(
    id: String,
    activate: bool,
) -> Result<OfficialAccountOperationResult, String> {
    let _lock = SwitchLock::acquire()?;
    let conn = open_conn()?;
    let safe_id = safe_account_id(&id)?;
    let account =
        get_account(&conn, &safe_id)?.ok_or_else(|| "Official account not found.".to_string())?;
    let slot_dir = resolve_home(&account.credentials_slot_path);
    let credentials_present = copy_kimi_code_credentials(&standard_credentials_dir(), &slot_dir)?;
    let now = now_iso();
    if activate {
        conn.execute("UPDATE official_accounts SET is_active = 0", [])
            .map_err(|e| format!("clear active official account: {e}"))?;
    } else if let Some(active) = get_active_account(&conn)? {
        let _ = materialize_slot_to_current(&active);
    }
    conn.execute(
        "UPDATE official_accounts
         SET status = ?1, is_active = ?2, last_login_at = ?3, last_checked_at = ?4,
             last_used_at = CASE WHEN ?2 = 1 THEN ?5 ELSE last_used_at END, updated_at = ?6
         WHERE id = ?7",
        params![
            if credentials_present {
                "logged-in"
            } else {
                "empty"
            },
            if activate { 1 } else { 0 },
            if credentials_present {
                now.as_str()
            } else {
                ""
            },
            now,
            now,
            now,
            safe_id,
        ],
    )
    .map_err(|e| format!("complete official account login: {e}"))?;
    let updated =
        get_account(&conn, &safe_id)?.ok_or_else(|| "Official account not found.".to_string())?;
    Ok(OfficialAccountOperationResult {
        active_account_id: if activate {
            updated.id.clone()
        } else {
            get_active_account(&conn)?.map(|a| a.id).unwrap_or_default()
        },
        account: updated,
        credentials_present,
    })
}

#[tauri::command]
pub fn activate_official_account(id: String) -> Result<OfficialAccountOperationResult, String> {
    let _lock = SwitchLock::acquire()?;
    let conn = open_conn()?;
    let safe_id = safe_account_id(&id)?;
    let target =
        get_account(&conn, &safe_id)?.ok_or_else(|| "Official account not found.".to_string())?;
    let previous = get_active_account(&conn)?;
    if let Some(active) = &previous {
        sync_current_credentials_to_slot(active)?;
    }
    let backup_dir = accounts_root().join(".switch-backup");
    ensure_private_dir(&backup_dir)?;
    let had_backup = copy_kimi_code_credentials(&standard_credentials_dir(), &backup_dir)?;
    let result = materialize_slot_to_current(&target);
    if let Err(err) = result {
        if had_backup {
            let _ = copy_kimi_code_credentials(&backup_dir, &standard_credentials_dir());
        }
        return Err(err);
    }
    let credentials_present = has_credentials(&standard_credentials_dir())?;
    let now = now_iso();
    conn.execute("UPDATE official_accounts SET is_active = 0", [])
        .map_err(|e| format!("clear active official account: {e}"))?;
    conn.execute(
        "UPDATE official_accounts
         SET is_active = 1, status = ?1, last_checked_at = ?2, last_used_at = ?3, updated_at = ?4
         WHERE id = ?5",
        params![
            if credentials_present {
                "logged-in"
            } else {
                "empty"
            },
            now,
            now,
            now,
            safe_id,
        ],
    )
    .map_err(|e| format!("activate official account: {e}"))?;
    let account =
        get_account(&conn, &safe_id)?.ok_or_else(|| "Official account not found.".to_string())?;
    Ok(OfficialAccountOperationResult {
        active_account_id: account.id.clone(),
        account,
        credentials_present,
    })
}

#[tauri::command]
pub fn delete_official_account(id: String) -> Result<(), String> {
    let _lock = SwitchLock::acquire()?;
    let conn = open_conn()?;
    let safe_id = safe_account_id(&id)?;
    let account =
        get_account(&conn, &safe_id)?.ok_or_else(|| "Official account not found.".to_string())?;
    conn.execute(
        "DELETE FROM official_accounts WHERE id = ?1",
        params![safe_id],
    )
    .map_err(|e| format!("delete official account: {e}"))?;
    let slot = resolve_home(&account.credentials_slot_path);
    if slot.exists() {
        fs::remove_dir_all(&slot)
            .map_err(|e| format!("remove account slot {}: {e}", slot.display()))?;
    }
    if account.is_active {
        clear_current_credentials()?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn safe_account_id_accepts_stable_slug_characters() {
        assert_eq!(safe_account_id("acct-123_ABC").unwrap(), "acct-123_ABC");
        assert!(safe_account_id("../bad").is_err());
        assert!(safe_account_id("").is_err());
    }

    #[test]
    fn credentials_files_ignore_mcp_and_unknown_files() {
        let root = std::env::temp_dir().join(format!(
            "kimi-code-switch-official-account-test-{}",
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let credentials = root.join("credentials");
        let mcp_dir = credentials.join("mcp");
        fs::create_dir_all(&mcp_dir).unwrap();
        fs::write(credentials.join("kimi-code.json"), "{}").unwrap();
        fs::write(credentials.join("notes.txt"), "ignore").unwrap();
        fs::write(mcp_dir.join("server.json"), "{}").unwrap();

        let files = credentials_files_in(&credentials).unwrap();

        assert_eq!(files.len(), 1);
        assert_eq!(
            files[0].file_name().and_then(|name| name.to_str()),
            Some("kimi-code.json")
        );
        fs::remove_dir_all(root).unwrap();
    }
}

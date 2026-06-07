//! 配置历史版本管理。
//!
//! 功能：自动快照、版本查询、回滚、自动清理。
//! 存储：SQLite 元数据（~/.kimi/app.db 的 config_history 表）
//!       + 文件系统快照内容（~/.kimi/.panel/history/{id}.toml.gz）

use flate2::write::GzEncoder;
use flate2::Compression;
use flate2::read::GzDecoder;
use rusqlite::OptionalExtension;
use sha2::{Digest, Sha256};
use std::fs;
use std::io::Write;
use std::io::Read;

/// 配置历史表 schema。
///
/// 设计要点：
/// - UNIQUE(file_id, sha256) 实现去重（相同内容不重复存储）
/// - snapshot_at 索引支持时间范围查询
/// - file_id 索引支持按文件类型过滤
pub const SCHEMA_SQL: &str = r#"
CREATE TABLE IF NOT EXISTS config_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  snapshot_at TEXT NOT NULL,
  file_id TEXT NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  snapshot_path TEXT NOT NULL,
  description TEXT,
  UNIQUE(file_id, sha256)
);

CREATE INDEX IF NOT EXISTS idx_history_time
  ON config_history(snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_file
  ON config_history(file_id, snapshot_at DESC);
"#;

/// 初始化配置历史表。
///
/// 调用时机：应用启动时，在 usage_open 之后执行。
/// 注意：复用 usage.rs 的 SQLite 连接，不单独创建数据库文件。
#[tauri::command]
pub fn init_config_history(
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("usage db not open")?;

    conn.execute_batch(SCHEMA_SQL)
        .map_err(|e| format!("init config_history schema: {e}"))?;

    // 确保 history 目录存在
    let history_dir = dirs::home_dir()
        .ok_or("cannot resolve home dir")?
        .join(".kimi/.panel/history");

    std::fs::create_dir_all(&history_dir)
        .map_err(|e| format!("create history dir: {e}"))?;

    Ok(())
}

/// 辅助函数：计算字符串的 SHA256
fn compute_sha256(content: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(content.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// 辅助函数：gzip 压缩
fn gzip_compress(content: &str) -> Result<Vec<u8>, String> {
    let mut encoder = GzEncoder::new(Vec::new(), Compression::default());
    encoder
        .write_all(content.as_bytes())
        .map_err(|e| format!("gzip write: {e}"))?;
    encoder.finish().map_err(|e| format!("gzip finish: {e}"))
}

/// 捕获配置快照。
///
/// 流程：
/// 1. 读取配置内容：
///    - file_id="panel": 从 SQLite 导出 JSON（无需文件路径）
///    - 其他: 读取 TOML 文件
/// 2. 计算 SHA256
/// 3. 检查是否已存在（去重）
/// 4. gzip 压缩
/// 5. 保存到 ~/.kimi/.panel/history/{timestamp_ms}-{file_id}.{json|toml}.gz
/// 6. 插入 SQLite 记录
///
/// 错误处理：快照失败时记录错误日志，返回 Ok(None)，不阻塞调用方。
#[tauri::command]
pub fn capture_snapshot(
    file_id: String,
    file_path: String,
    description: Option<String>,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<Option<i64>, String> {
    // 读取配置内容
    let content = if file_id == "panel" {
        // Panel settings 从 SQLite 导出 JSON
        let guard = state.conn.lock().unwrap();
        let conn = guard.as_ref().ok_or("usage db not open")?;

        let settings_json: Option<String> = conn
            .query_row(
                "SELECT settings_json FROM panel_settings WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .optional()
            .map_err(|e| format!("export panel settings: {e}"))?;

        drop(guard); // 释放锁

        match settings_json {
            Some(json) => json,
            None => {
                log::warn!("Panel settings not found in database, skipping snapshot");
                return Ok(None);
            }
        }
    } else {
        // 其他配置文件从磁盘读取
        let resolved_path = crate::fs_access::resolve_home(&file_path);
        match fs::read_to_string(&resolved_path) {
            Ok(c) => c,
            Err(e) => {
                log::error!("Failed to read file for snapshot: {e}");
                return Ok(None); // 失败不阻塞
            }
        }
    };

    let size_bytes = content.len() as i64;
    let sha256 = compute_sha256(&content);

    // 检查是否已存在（去重）
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("usage db not open")?;

    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM config_history WHERE file_id = ?1 AND sha256 = ?2",
            [&file_id, &sha256],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if exists {
        log::info!("Snapshot already exists (deduplicated): {file_id} {sha256}");
        return Ok(None);
    }

    // gzip 压缩
    let compressed = match gzip_compress(&content) {
        Ok(c) => c,
        Err(e) => {
            log::error!("Failed to compress snapshot: {e}");
            return Ok(None);
        }
    };

    // 保存到文件系统
    let history_dir = dirs::home_dir()
        .ok_or("cannot resolve home dir")?
        .join(".kimi/.panel/history");

    std::fs::create_dir_all(&history_dir)
        .map_err(|e| format!("create history dir: {e}"))?;

    let timestamp_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();

    let snapshot_filename = format!("{}-{}.toml.gz", timestamp_ms, file_id);
    let snapshot_path = history_dir.join(&snapshot_filename);

    if let Err(e) = fs::write(&snapshot_path, &compressed) {
        log::error!("Failed to write snapshot file: {e}");
        return Ok(None);
    }

    // 插入 SQLite 记录
    let snapshot_at = chrono::Utc::now().to_rfc3339();
    let snapshot_path_str = snapshot_path.to_string_lossy().to_string();

    match conn.execute(
        "INSERT INTO config_history (snapshot_at, file_id, sha256, size_bytes, snapshot_path, description)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            snapshot_at,
            file_id,
            sha256,
            size_bytes,
            snapshot_path_str,
            description
        ],
    ) {
        Ok(_) => {
            let id = conn.last_insert_rowid();
            log::info!("Snapshot created: id={id}, file_id={file_id}, size={size_bytes}");
            Ok(Some(id))
        }
        Err(e) => {
            log::error!("Failed to insert snapshot record: {e}");
            // 清理文件系统快照
            let _ = fs::remove_file(&snapshot_path);
            Ok(None)
        }
    }
}

/// 快照记录（查询结果）
#[derive(serde::Serialize)]
pub struct SnapshotRecord {
    pub id: i64,
    pub snapshot_at: String,
    pub file_id: String,
    pub sha256: String,
    pub size_bytes: i64,
    pub snapshot_path: String,
    pub description: Option<String>,
}

/// 列出快照历史。
///
/// 参数：
/// - file_id: 可选，过滤指定文件类型
/// - limit: 返回记录数上限（默认 100）
///
/// 返回：按时间倒序排列的快照列表
#[tauri::command]
pub fn list_snapshots(
    file_id: Option<String>,
    limit: Option<i64>,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<Vec<SnapshotRecord>, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("usage db not open")?;

    let limit = limit.unwrap_or(100);

    let (sql, params): (String, Vec<Box<dyn rusqlite::ToSql>>) = if let Some(fid) = file_id {
        (
            "SELECT id, snapshot_at, file_id, sha256, size_bytes, snapshot_path, description
             FROM config_history
             WHERE file_id = ?1
             ORDER BY snapshot_at DESC
             LIMIT ?2".to_string(),
            vec![Box::new(fid), Box::new(limit)],
        )
    } else {
        (
            "SELECT id, snapshot_at, file_id, sha256, size_bytes, snapshot_path, description
             FROM config_history
             ORDER BY snapshot_at DESC
             LIMIT ?1".to_string(),
            vec![Box::new(limit)],
        )
    };

    let mut stmt = conn.prepare(&sql).map_err(|e| format!("prepare: {e}"))?;

    let rows = stmt
        .query_map(rusqlite::params_from_iter(params.iter()), |row| {
            Ok(SnapshotRecord {
                id: row.get(0)?,
                snapshot_at: row.get(1)?,
                file_id: row.get(2)?,
                sha256: row.get(3)?,
                size_bytes: row.get(4)?,
                snapshot_path: row.get(5)?,
                description: row.get(6)?,
            })
        })
        .map_err(|e| format!("query: {e}"))?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| format!("row: {e}"))?);
    }

    Ok(result)
}

/// 获取快照内容。
///
/// 流程：
/// 1. 从数据库查询快照记录
/// 2. 读取 gzip 文件
/// 3. 解压缩
/// 4. 返回原始文本
#[tauri::command]
pub fn get_snapshot_content(
    snapshot_id: i64,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<String, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("usage db not open")?;

    // 查询快照路径
    let snapshot_path: String = conn
        .query_row(
            "SELECT snapshot_path FROM config_history WHERE id = ?1",
            [snapshot_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("snapshot not found: {e}"))?;

    // 读取 gzip 文件
    let compressed = fs::read(&snapshot_path)
        .map_err(|e| format!("read snapshot file: {e}"))?;

    // 解压缩
    let mut decoder = GzDecoder::new(&compressed[..]);
    let mut content = String::new();
    decoder
        .read_to_string(&mut content)
        .map_err(|e| format!("decompress: {e}"))?;

    Ok(content)
}

/// 回滚到指定快照。
///
/// 流程：
/// 1. 读取快照内容（解压）
/// 2. 创建"回滚点"快照（当前配置，支持撤销）
/// 3. 覆盖配置文件
/// 4. 记录回滚操作到 SQLite
///
/// 错误处理：回滚失败时不修改文件，返回错误
#[tauri::command]
pub fn restore_snapshot(
    snapshot_id: i64,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("usage db not open")?;

    // 1. 查询快照信息
    let (file_id, snapshot_path): (String, String) = conn
        .query_row(
            "SELECT file_id, snapshot_path FROM config_history WHERE id = ?1",
            [snapshot_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|e| format!("snapshot not found: {e}"))?;

    // 2. 读取快照内容
    let compressed = fs::read(&snapshot_path)
        .map_err(|e| format!("read snapshot file: {e}"))?;

    let mut decoder = GzDecoder::new(&compressed[..]);
    let mut snapshot_content = String::new();
    decoder
        .read_to_string(&mut snapshot_content)
        .map_err(|e| format!("decompress: {e}"))?;

    // 3. 恢复配置
    if file_id == "panel" {
        // Panel settings：导入到 SQLite
        let now = chrono::Utc::now().to_rfc3339();

        conn.execute(
            "INSERT INTO panel_settings (id, version, settings_json, updated_at, created_at)
             VALUES (1, 1, ?1, ?2, ?2)
             ON CONFLICT(id) DO UPDATE SET
               settings_json = excluded.settings_json,
               updated_at = excluded.updated_at",
            rusqlite::params![snapshot_content, now],
        )
        .map_err(|e| format!("restore panel settings: {e}"))?;

        log::info!("Restored panel settings from snapshot {snapshot_id}");
        return Ok(());
    }

    // 其他配置文件：写入磁盘
    let config_file_path = match file_id.as_str() {
        "config" => "~/.kimi/config.toml",
        "profiles" => "~/.kimi/config.profiles.toml",
        "mcp" => "~/.kimi/config.mcp.json",
        _ => return Err(format!("unknown file_id: {file_id}")),
    };

    let target_path = crate::fs_access::resolve_home(config_file_path);

    // 4. 创建"回滚点"快照（当前配置）
    if target_path.exists() {
        if let Ok(current_content) = fs::read_to_string(&target_path) {
            let sha256 = compute_sha256(&current_content);
            let size_bytes = current_content.len() as i64;

            // 检查是否已存在（去重）
            let exists: bool = conn
                .query_row(
                    "SELECT 1 FROM config_history WHERE file_id = ?1 AND sha256 = ?2",
                    [&file_id, &sha256],
                    |_| Ok(true),
                )
                .unwrap_or(false);

            if !exists {
                // 压缩并保存
                if let Ok(compressed) = gzip_compress(&current_content) {
                    let history_dir = dirs::home_dir()
                        .ok_or("cannot resolve home dir")?
                        .join(".kimi/.panel/history");

                    let timestamp_ms = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap()
                        .as_millis();

                    let rollback_point_filename = format!("{}-{}.toml.gz", timestamp_ms, file_id);
                    let rollback_point_path = history_dir.join(&rollback_point_filename);

                    if fs::write(&rollback_point_path, &compressed).is_ok() {
                        let snapshot_at = chrono::Utc::now().to_rfc3339();
                        let rollback_point_path_str = rollback_point_path.to_string_lossy().to_string();

                        let _ = conn.execute(
                            "INSERT INTO config_history (snapshot_at, file_id, sha256, size_bytes, snapshot_path, description)
                             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                            rusqlite::params![
                                snapshot_at,
                                file_id,
                                sha256,
                                size_bytes,
                                rollback_point_path_str,
                                format!("Rollback point before restoring snapshot #{}", snapshot_id)
                            ],
                        );
                    }
                }
            }
        }
    }

    // 5. 覆盖配置文件
    fs::write(&target_path, snapshot_content)
        .map_err(|e| format!("write config file: {e}"))?;

    log::info!("Restored snapshot #{snapshot_id} to {file_id}");

    Ok(())
}

/// 清理旧快照。
///
/// 删除 30 天前的快照记录和对应的文件系统文件。
///
/// 调用时机：每次保存配置后（saveAppState 后）
#[tauri::command]
pub fn cleanup_old_snapshots(
    state: tauri::State<crate::usage::UsageState>,
) -> Result<i64, String> {
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("usage db not open")?;

    // 计算 30 天前的时间戳
    let thirty_days_ago = chrono::Utc::now() - chrono::Duration::days(30);
    let cutoff_time = thirty_days_ago.to_rfc3339();

    // 查询待删除的快照路径
    let mut stmt = conn
        .prepare("SELECT snapshot_path FROM config_history WHERE snapshot_at < ?1")
        .map_err(|e| format!("prepare: {e}"))?;

    let paths: Vec<String> = stmt
        .query_map([&cutoff_time], |row| row.get(0))
        .map_err(|e| format!("query: {e}"))?
        .filter_map(|r| r.ok())
        .collect();

    // 删除文件系统快照
    let mut deleted_files = 0;
    for path in &paths {
        if fs::remove_file(path).is_ok() {
            deleted_files += 1;
        }
    }

    // 删除数据库记录
    let deleted_rows = conn
        .execute(
            "DELETE FROM config_history WHERE snapshot_at < ?1",
            [&cutoff_time],
        )
        .map_err(|e| format!("delete: {e}"))?;

    log::info!(
        "Cleaned up {deleted_rows} old snapshots ({deleted_files} files deleted)"
    );

    Ok(deleted_rows as i64)
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;

    #[test]
    fn test_schema_creates_tables() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA_SQL).unwrap();

        // 验证表存在
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='config_history'").unwrap();
        let exists = stmt.exists([]).unwrap();
        assert!(exists, "config_history table should exist");

        // 验证索引存在
        let mut stmt = conn.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_history_time'").unwrap();
        let exists = stmt.exists([]).unwrap();
        assert!(exists, "idx_history_time index should exist");
    }

    #[test]
    fn test_unique_constraint() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA_SQL).unwrap();

        // 插入第一条记录
        conn.execute(
            "INSERT INTO config_history (snapshot_at, file_id, sha256, size_bytes, snapshot_path)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            ["2026-06-08T00:00:00Z", "config", "abc123", "1024", "/path/1.gz"],
        ).unwrap();

        // 尝试插入相同 file_id + sha256 应失败
        let result = conn.execute(
            "INSERT INTO config_history (snapshot_at, file_id, sha256, size_bytes, snapshot_path)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            ["2026-06-08T01:00:00Z", "config", "abc123", "2048", "/path/2.gz"],
        );

        assert!(result.is_err(), "duplicate file_id+sha256 should be rejected");
    }

    #[test]
    fn test_compute_sha256() {
        let hash = compute_sha256("hello world");
        assert_eq!(
            hash,
            "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
        );
    }

    #[test]
    fn test_gzip_compress() {
        let content = "test content";
        let compressed = gzip_compress(content).unwrap();
        assert!(compressed.len() < content.len() + 50); // 压缩后应该不会比原始大太多
        assert!(compressed.len() > 10); // 至少有 gzip header
    }

    #[test]
    fn test_gzip_round_trip() {
        let original = "Hello, 配置历史版本！This is a test content.";
        let compressed = gzip_compress(original).unwrap();

        // 解压缩
        let mut decoder = GzDecoder::new(&compressed[..]);
        let mut decompressed = String::new();
        decoder.read_to_string(&mut decompressed).unwrap();

        assert_eq!(original, decompressed);
    }

    #[test]
    fn test_list_snapshots() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA_SQL).unwrap();

        // 插入测试数据
        conn.execute(
            "INSERT INTO config_history (snapshot_at, file_id, sha256, size_bytes, snapshot_path)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            ["2026-06-08T10:00:00Z", "config", "hash1", "1024", "/path/1.gz"],
        ).unwrap();
        conn.execute(
            "INSERT INTO config_history (snapshot_at, file_id, sha256, size_bytes, snapshot_path)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            ["2026-06-08T11:00:00Z", "profiles", "hash2", "2048", "/path/2.gz"],
        ).unwrap();
        conn.execute(
            "INSERT INTO config_history (snapshot_at, file_id, sha256, size_bytes, snapshot_path)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            ["2026-06-08T12:00:00Z", "config", "hash3", "3072", "/path/3.gz"],
        ).unwrap();

        // 查询所有快照（应按时间倒序）
        let mut stmt = conn.prepare(
            "SELECT id, snapshot_at, file_id FROM config_history ORDER BY snapshot_at DESC"
        ).unwrap();
        let rows: Vec<(i64, String, String)> = stmt
            .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        assert_eq!(rows.len(), 3);
        assert_eq!(rows[0].1, "2026-06-08T12:00:00Z"); // 最新的在前
        assert_eq!(rows[2].1, "2026-06-08T10:00:00Z"); // 最老的在后

        // 查询指定文件类型
        let mut stmt = conn.prepare(
            "SELECT COUNT(*) FROM config_history WHERE file_id = 'config'"
        ).unwrap();
        let count: i64 = stmt.query_row([], |row| row.get(0)).unwrap();
        assert_eq!(count, 2);
    }
}

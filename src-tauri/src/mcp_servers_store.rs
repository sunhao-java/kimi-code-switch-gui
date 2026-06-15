//! MCP 服务器配置存储（SQLite）。
//!
//! 设计：结构化表存储，支持启用/禁用状态管理。
//! 启用：同步到 ~/.kimi-code/mcp.json
//! 禁用：从 mcp.json 删除，数据库保留（enabled=0）
//! 删除：从数据库物理删除

use rusqlite::OptionalExtension;
use serde_json::json;

/// mcp_servers 表 schema
pub const SCHEMA_SQL: &str = include_str!("mcp_servers_schema.sql");
const DEFAULT_ENVIRONMENT_ID: &str = "default";

/// 安全地获取数据库连接，处理 poisoned lock。
fn lock_conn<'a>(
    state: &'a tauri::State<crate::usage::UsageState>,
) -> Result<std::sync::MutexGuard<'a, Option<rusqlite::Connection>>, String> {
    state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())
}

fn migrate_mcp_servers_schema(conn: &rusqlite::Connection) -> Result<(), String> {
    let table_exists: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'mcp_servers'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("check mcp_servers table: {e}"))?;
    if table_exists == 0 {
        return Ok(());
    }

    let create_sql: String = conn
        .query_row(
            "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'mcp_servers'",
            [],
            |row| row.get(0),
        )
        .map_err(|e| format!("read mcp_servers schema: {e}"))?;
    let needs_rebuild = !create_sql.contains("kimi_code_environment_id")
        || create_sql.contains("server_name TEXT NOT NULL UNIQUE");
    if !needs_rebuild {
        return Ok(());
    }

    conn.execute_batch(
        r#"
        ALTER TABLE mcp_servers RENAME TO mcp_servers_legacy;
        CREATE TABLE mcp_servers (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          kimi_code_environment_id TEXT NOT NULL DEFAULT 'default',
          server_name TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          transport TEXT NOT NULL,
          url TEXT NOT NULL DEFAULT '',
          command TEXT NOT NULL DEFAULT '',
          args TEXT NOT NULL DEFAULT '[]',
          headers TEXT NOT NULL DEFAULT '{}',
          env TEXT NOT NULL DEFAULT '{}',
          extra TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          CHECK (enabled IN (0, 1)),
          CHECK (transport IN ('sse', 'stdio', 'streamable-http')),
          UNIQUE(kimi_code_environment_id, server_name)
        );
        INSERT OR IGNORE INTO mcp_servers (
          id, kimi_code_environment_id, server_name, enabled, transport, url, command,
          args, headers, env, extra, created_at, updated_at
        )
        SELECT
          id, 'default', server_name, enabled, transport, url, command,
          args, headers, env, extra, created_at, updated_at
        FROM mcp_servers_legacy;
        DROP TABLE mcp_servers_legacy;
        "#,
    )
    .map_err(|e| format!("migrate mcp_servers schema: {e}"))?;

    Ok(())
}

fn environment_id_from_server(server: &serde_json::Value) -> String {
    server["kimi_code_environment_id"]
        .as_str()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(DEFAULT_ENVIRONMENT_ID)
        .to_string()
}

fn server_json_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<serde_json::Value> {
    Ok(json!({
        "id": row.get::<_, i64>(0)?,
        "kimi_code_environment_id": row.get::<_, String>(1)?,
        "server_name": row.get::<_, String>(2)?,
        "enabled": row.get::<_, i64>(3)? != 0,
        "transport": row.get::<_, String>(4)?,
        "url": row.get::<_, String>(5)?,
        "command": row.get::<_, String>(6)?,
        "args": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(7)?).unwrap_or(json!([])),
        "headers": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(8)?).unwrap_or(json!({})),
        "env": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(9)?).unwrap_or(json!({})),
        "extra": row.get::<_, Option<String>>(10)?
            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
        "created_at": row.get::<_, String>(11)?,
        "updated_at": row.get::<_, String>(12)?,
    }))
}

/// 初始化 mcp_servers 表
#[tauri::command]
pub fn init_mcp_servers_store(state: tauri::State<crate::usage::UsageState>) -> Result<(), String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;

    migrate_mcp_servers_schema(conn)?;
    conn.execute_batch(SCHEMA_SQL)
        .map_err(|e| format!("create mcp_servers table: {e}"))?;

    log::info!("mcp_servers table initialized");
    Ok(())
}

/// 列出所有 MCP 服务器（包括禁用的）
#[tauri::command]
pub fn list_mcp_servers(state: tauri::State<crate::usage::UsageState>) -> Result<String, String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;

    let mut stmt = conn
        .prepare(
            "SELECT id, kimi_code_environment_id, server_name, enabled, transport, url, command, args, headers, env, extra, created_at, updated_at
             FROM mcp_servers ORDER BY server_name",
        )
        .map_err(|e| format!("prepare list: {e}"))?;

    let servers: Vec<serde_json::Value> = stmt
        .query_map([], server_json_from_row)
        .map_err(|e| format!("query servers: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect servers: {e}"))?;

    serde_json::to_string(&servers).map_err(|e| format!("serialize: {e}"))
}

/// 获取单个 MCP 服务器
#[tauri::command]
pub fn get_mcp_server(
    server_name: String,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<Option<String>, String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;

    let server_json: Option<String> = conn
        .query_row(
            "SELECT id, kimi_code_environment_id, server_name, enabled, transport, url, command, args, headers, env, extra, created_at, updated_at
             FROM mcp_servers WHERE kimi_code_environment_id = ?1 AND server_name = ?2",
            rusqlite::params![DEFAULT_ENVIRONMENT_ID, server_name],
            |row| Ok(server_json_from_row(row)?.to_string()),
        )
        .optional()
        .map_err(|e| format!("query server: {e}"))?;

    Ok(server_json)
}

/// 创建或更新 MCP 服务器
#[tauri::command]
pub fn save_mcp_server(
    server_json: String,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;

    let server: serde_json::Value =
        serde_json::from_str(&server_json).map_err(|e| format!("parse server json: {e}"))?;

    let now = chrono::Utc::now().to_rfc3339();

    let server_name = server["server_name"]
        .as_str()
        .ok_or("missing server_name")?;
    let environment_id = environment_id_from_server(&server);
    let enabled = if server["enabled"].as_bool().unwrap_or(true) {
        1i64
    } else {
        0i64
    };
    let transport = server["transport"].as_str().unwrap_or("stdio");
    let url = server["url"].as_str().unwrap_or("");
    let command = server["command"].as_str().unwrap_or("");
    let args = server["args"].to_string();
    let headers = server["headers"].to_string();
    let env = server["env"].to_string();
    let extra = if server["extra"].is_null() {
        None
    } else {
        Some(server["extra"].to_string())
    };

    conn.execute(
        "INSERT INTO mcp_servers (kimi_code_environment_id, server_name, enabled, transport, url, command, args, headers, env, extra, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
         ON CONFLICT(kimi_code_environment_id, server_name) DO UPDATE SET
           enabled = excluded.enabled,
           transport = excluded.transport,
           url = excluded.url,
           command = excluded.command,
           args = excluded.args,
           headers = excluded.headers,
           env = excluded.env,
           extra = excluded.extra,
           updated_at = excluded.updated_at",
        rusqlite::params![environment_id, server_name, enabled, transport, url, command, args, headers, env, extra, now],
    )
    .map_err(|e| format!("save mcp_server: {e}"))?;

    log::info!("MCP server {} saved", server_name);
    Ok(())
}

/// 启用 MCP 服务器
#[tauri::command]
pub fn enable_mcp_server(
    server_name: String,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;

    let now = chrono::Utc::now().to_rfc3339();

    let rows = conn
        .execute(
            "UPDATE mcp_servers SET enabled = 1, updated_at = ?1 WHERE kimi_code_environment_id = ?2 AND server_name = ?3",
            rusqlite::params![now, DEFAULT_ENVIRONMENT_ID, server_name],
        )
        .map_err(|e| format!("enable mcp_server: {e}"))?;

    if rows == 0 {
        return Err(format!("server {} not found", server_name));
    }

    log::info!("MCP server {} enabled", server_name);
    Ok(())
}

/// 禁用 MCP 服务器
#[tauri::command]
pub fn disable_mcp_server(
    server_name: String,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;

    let now = chrono::Utc::now().to_rfc3339();

    let rows = conn
        .execute(
            "UPDATE mcp_servers SET enabled = 0, updated_at = ?1 WHERE kimi_code_environment_id = ?2 AND server_name = ?3",
            rusqlite::params![now, DEFAULT_ENVIRONMENT_ID, server_name],
        )
        .map_err(|e| format!("disable mcp_server: {e}"))?;

    if rows == 0 {
        return Err(format!("server {} not found", server_name));
    }

    log::info!("MCP server {} disabled", server_name);
    Ok(())
}

/// 删除 MCP 服务器（物理删除）
#[tauri::command]
pub fn delete_mcp_server(
    server_name: String,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;

    let rows = conn
        .execute(
            "DELETE FROM mcp_servers WHERE kimi_code_environment_id = ?1 AND server_name = ?2",
            rusqlite::params![DEFAULT_ENVIRONMENT_ID, server_name],
        )
        .map_err(|e| format!("delete mcp_server: {e}"))?;

    if rows == 0 {
        return Err(format!("server {} not found", server_name));
    }

    log::info!("MCP server {} deleted", server_name);
    Ok(())
}

/// 获取所有启用的 MCP 服务器（用于同步到 mcp.json）
#[tauri::command]
pub fn get_enabled_mcp_servers(
    state: tauri::State<crate::usage::UsageState>,
) -> Result<String, String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;

    let mut stmt = conn
        .prepare(
            "SELECT server_name, transport, url, command, args, headers, env, extra
             FROM mcp_servers WHERE kimi_code_environment_id = ?1 AND enabled = 1 ORDER BY server_name",
        )
        .map_err(|e| format!("prepare enabled servers: {e}"))?;

    let servers: Vec<serde_json::Value> = stmt
        .query_map([DEFAULT_ENVIRONMENT_ID], |row| {
            Ok(json!({
                "server_name": row.get::<_, String>(0)?,
                "transport": row.get::<_, String>(1)?,
                "url": row.get::<_, String>(2)?,
                "command": row.get::<_, String>(3)?,
                "args": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(4)?).unwrap_or(json!([])),
                "headers": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(5)?).unwrap_or(json!({})),
                "env": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(6)?).unwrap_or(json!({})),
                "extra": row.get::<_, Option<String>>(7)?
                    .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
            }))
        })
        .map_err(|e| format!("query enabled servers: {e}"))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("collect enabled servers: {e}"))?;

    serde_json::to_string(&servers).map_err(|e| format!("serialize: {e}"))
}

/// 从旧 MCP JSON 导入到数据库。
///
/// 注意：不要重命名或删除源文件。`~/.kimi-code/mcp.json` 是 Kimi Code 标准配置文件，
/// 启动后台迁移如果移动它，会被保存冲突检测识别成外部删除。
#[tauri::command]
pub fn migrate_mcp_from_json(
    json_path: String,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    use std::fs;

    let resolved_path = crate::fs_access::resolve_home(&json_path);

    // 检查 JSON 文件是否存在
    if !resolved_path.exists() {
        return Ok(()); // 不存在则跳过
    }

    // 读取 JSON
    let json_content =
        fs::read_to_string(&resolved_path).map_err(|e| format!("read mcp json: {e}"))?;

    let mcp_config: serde_json::Value =
        serde_json::from_str(&json_content).map_err(|e| format!("parse mcp json: {e}"))?;

    // 提取 mcpServers 对象
    let servers = mcp_config["mcpServers"]
        .as_object()
        .ok_or("mcpServers not found or not an object")?;

    // 逐个插入
    for (server_name, config) in servers {
        let server_with_name = json!({
            "server_name": server_name,
            "enabled": config.get("enabled").and_then(|v| v.as_bool()).unwrap_or(true),
            "transport": config.get("transport").and_then(|v| v.as_str()).unwrap_or("stdio"),
            "url": config.get("url").and_then(|v| v.as_str()).unwrap_or(""),
            "command": config.get("command").and_then(|v| v.as_str()).unwrap_or(""),
            "args": config.get("args").cloned().unwrap_or(json!([])),
            "headers": config.get("headers").cloned().unwrap_or(json!({})),
            "env": config.get("env").cloned().unwrap_or(json!({})),
            "extra": config.get("extra").cloned(),
        });

        save_mcp_server(server_with_name.to_string(), state.clone())?;
    }

    log::info!("Imported MCP servers from {} to database", json_path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::Mutex;
    use std::sync::MutexGuard;

    fn make_test_state() -> crate::usage::UsageState {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA_SQL).unwrap();
        crate::usage::UsageState {
            conn: Mutex::new(Some(conn)),
        }
    }

    fn lock_test_conn<'a>(
        state: &'a crate::usage::UsageState,
    ) -> Result<MutexGuard<'a, Option<Connection>>, String> {
        state
            .conn
            .lock()
            .map_err(|_| "database lock poisoned".to_string())
    }

    // 测试专用辅助函数
    fn save_test(server_json: &str, state: &crate::usage::UsageState) -> Result<(), String> {
        let guard = lock_test_conn(state)?;
        let conn = guard.as_ref().ok_or("usage db not open")?;

        let server: serde_json::Value =
            serde_json::from_str(server_json).map_err(|e| format!("parse server json: {e}"))?;

        let now = chrono::Utc::now().to_rfc3339();

        let server_name = server["server_name"]
            .as_str()
            .ok_or("missing server_name")?;
        let environment_id = environment_id_from_server(&server);
        let enabled = if server["enabled"].as_bool().unwrap_or(true) {
            1i64
        } else {
            0i64
        };
        let transport = server["transport"].as_str().unwrap_or("stdio");
        let url = server["url"].as_str().unwrap_or("");
        let command = server["command"].as_str().unwrap_or("");
        let args = server["args"].to_string();
        let headers = server["headers"].to_string();
        let env = server["env"].to_string();
        let extra = if server["extra"].is_null() {
            None
        } else {
            Some(server["extra"].to_string())
        };

        conn.execute(
            "INSERT INTO mcp_servers (kimi_code_environment_id, server_name, enabled, transport, url, command, args, headers, env, extra, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?11)
             ON CONFLICT(kimi_code_environment_id, server_name) DO UPDATE SET
               enabled = excluded.enabled,
               transport = excluded.transport,
               url = excluded.url,
               command = excluded.command,
               args = excluded.args,
               headers = excluded.headers,
               env = excluded.env,
               extra = excluded.extra,
               updated_at = excluded.updated_at",
            rusqlite::params![environment_id, server_name, enabled, transport, url, command, args, headers, env, extra, now],
        )
        .map_err(|e| format!("save mcp_server: {e}"))?;

        Ok(())
    }

    fn get_test(
        server_name: &str,
        state: &crate::usage::UsageState,
    ) -> Result<Option<String>, String> {
        let guard = lock_test_conn(state)?;
        let conn = guard.as_ref().ok_or("usage db not open")?;

        let server_json: Option<String> = conn
            .query_row(
                "SELECT id, kimi_code_environment_id, server_name, enabled, transport, url, command, args, headers, env, extra, created_at, updated_at
                 FROM mcp_servers WHERE kimi_code_environment_id = ?1 AND server_name = ?2",
                rusqlite::params![DEFAULT_ENVIRONMENT_ID, server_name],
                |row| Ok(server_json_from_row(row)?.to_string()),
            )
            .optional()
            .map_err(|e| format!("query server: {e}"))?;

        Ok(server_json)
    }

    fn enable_test(server_name: &str, state: &crate::usage::UsageState) -> Result<(), String> {
        let guard = lock_test_conn(state)?;
        let conn = guard.as_ref().ok_or("usage db not open")?;

        let now = chrono::Utc::now().to_rfc3339();
        let rows = conn
            .execute(
                "UPDATE mcp_servers SET enabled = 1, updated_at = ?1 WHERE kimi_code_environment_id = ?2 AND server_name = ?3",
                rusqlite::params![now, DEFAULT_ENVIRONMENT_ID, server_name],
            )
            .map_err(|e| format!("enable mcp_server: {e}"))?;

        if rows == 0 {
            return Err(format!("server {} not found", server_name));
        }
        Ok(())
    }

    fn disable_test(server_name: &str, state: &crate::usage::UsageState) -> Result<(), String> {
        let guard = lock_test_conn(state)?;
        let conn = guard.as_ref().ok_or("usage db not open")?;

        let now = chrono::Utc::now().to_rfc3339();
        let rows = conn
            .execute(
                "UPDATE mcp_servers SET enabled = 0, updated_at = ?1 WHERE kimi_code_environment_id = ?2 AND server_name = ?3",
                rusqlite::params![now, DEFAULT_ENVIRONMENT_ID, server_name],
            )
            .map_err(|e| format!("disable mcp_server: {e}"))?;

        if rows == 0 {
            return Err(format!("server {} not found", server_name));
        }
        Ok(())
    }

    fn delete_test(server_name: &str, state: &crate::usage::UsageState) -> Result<(), String> {
        let guard = lock_test_conn(state)?;
        let conn = guard.as_ref().ok_or("usage db not open")?;

        let rows = conn
            .execute(
                "DELETE FROM mcp_servers WHERE kimi_code_environment_id = ?1 AND server_name = ?2",
                rusqlite::params![DEFAULT_ENVIRONMENT_ID, server_name],
            )
            .map_err(|e| format!("delete mcp_server: {e}"))?;

        if rows == 0 {
            return Err(format!("server {} not found", server_name));
        }
        Ok(())
    }

    fn get_enabled_test(state: &crate::usage::UsageState) -> Result<String, String> {
        let guard = lock_test_conn(state)?;
        let conn = guard.as_ref().ok_or("usage db not open")?;

        let mut stmt = conn
            .prepare(
                "SELECT server_name, transport, url, command, args, headers, env, extra
                 FROM mcp_servers WHERE kimi_code_environment_id = ?1 AND enabled = 1 ORDER BY server_name",
            )
            .map_err(|e| format!("prepare enabled servers: {e}"))?;

        let servers: Vec<serde_json::Value> = stmt
            .query_map([DEFAULT_ENVIRONMENT_ID], |row| {
                Ok(json!({
                    "server_name": row.get::<_, String>(0)?,
                    "transport": row.get::<_, String>(1)?,
                    "url": row.get::<_, String>(2)?,
                    "command": row.get::<_, String>(3)?,
                    "args": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(4)?).unwrap_or(json!([])),
                    "headers": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(5)?).unwrap_or(json!({})),
                    "env": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(6)?).unwrap_or(json!({})),
                    "extra": row.get::<_, Option<String>>(7)?
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                }))
            })
            .map_err(|e| format!("query enabled servers: {e}"))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("collect enabled servers: {e}"))?;

        serde_json::to_string(&servers).map_err(|e| format!("serialize: {e}"))
    }

    #[test]
    fn crud_operations() {
        let state = make_test_state();

        // Create
        let server = json!({
            "server_name": "test-server",
            "enabled": true,
            "transport": "stdio",
            "url": "",
            "command": "/usr/bin/test",
            "args": ["--flag"],
            "headers": {},
            "env": {"KEY": "value"},
            "extra": null
        });

        save_test(&server.to_string(), &state).unwrap();

        // Read
        let loaded = get_test("test-server", &state)
            .unwrap()
            .expect("server should exist");

        let loaded_json: serde_json::Value = serde_json::from_str(&loaded).unwrap();
        assert_eq!(loaded_json["server_name"], "test-server");
        assert_eq!(loaded_json["enabled"], true);
        assert_eq!(loaded_json["command"], "/usr/bin/test");

        // Update
        let updated = json!({
            "server_name": "test-server",
            "enabled": false,
            "transport": "sse",
            "url": "http://localhost:8080",
            "command": "",
            "args": [],
            "headers": {},
            "env": {},
            "extra": null
        });

        save_test(&updated.to_string(), &state).unwrap();

        let reloaded = get_test("test-server", &state).unwrap().unwrap();

        let reloaded_json: serde_json::Value = serde_json::from_str(&reloaded).unwrap();
        assert_eq!(reloaded_json["enabled"], false);
        assert_eq!(reloaded_json["transport"], "sse");

        // Delete
        delete_test("test-server", &state).unwrap();

        let deleted = get_test("test-server", &state).unwrap();
        assert!(deleted.is_none());
    }

    #[test]
    fn enable_disable() {
        let state = make_test_state();

        let server = json!({
            "server_name": "toggle-server",
            "enabled": true,
            "transport": "stdio",
            "url": "",
            "command": "/bin/test",
            "args": [],
            "headers": {},
            "env": {},
            "extra": null
        });

        save_test(&server.to_string(), &state).unwrap();

        // Disable
        disable_test("toggle-server", &state).unwrap();

        let disabled = get_test("toggle-server", &state).unwrap().unwrap();
        let disabled_json: serde_json::Value = serde_json::from_str(&disabled).unwrap();
        assert_eq!(disabled_json["enabled"], false);

        // Enable
        enable_test("toggle-server", &state).unwrap();

        let enabled = get_test("toggle-server", &state).unwrap().unwrap();
        let enabled_json: serde_json::Value = serde_json::from_str(&enabled).unwrap();
        assert_eq!(enabled_json["enabled"], true);
    }

    #[test]
    fn get_enabled_only() {
        let state = make_test_state();

        // 创建 3 个服务器，2 个启用，1 个禁用
        for (name, enabled) in [("server1", true), ("server2", false), ("server3", true)] {
            let server = json!({
                "server_name": name,
                "enabled": enabled,
                "transport": "stdio",
                "url": "",
                "command": "/bin/test",
                "args": [],
                "headers": {},
                "env": {},
                "extra": null
            });
            save_test(&server.to_string(), &state).unwrap();
        }

        let enabled_json = get_enabled_test(&state).unwrap();
        let enabled: Vec<serde_json::Value> = serde_json::from_str(&enabled_json).unwrap();

        assert_eq!(enabled.len(), 2);
        assert_eq!(enabled[0]["server_name"], "server1");
        assert_eq!(enabled[1]["server_name"], "server3");
    }

    #[test]
    fn same_server_name_can_exist_in_different_environments() {
        let state = make_test_state();

        let default_server = json!({
            "kimi_code_environment_id": "default",
            "server_name": "shared-name",
            "enabled": true,
            "transport": "stdio",
            "url": "",
            "command": "/bin/default",
            "args": [],
            "headers": {},
            "env": {},
            "extra": null
        });
        let work_server = json!({
            "kimi_code_environment_id": "work",
            "server_name": "shared-name",
            "enabled": true,
            "transport": "stdio",
            "url": "",
            "command": "/bin/work",
            "args": [],
            "headers": {},
            "env": {},
            "extra": null
        });

        save_test(&default_server.to_string(), &state).unwrap();
        save_test(&work_server.to_string(), &state).unwrap();

        let guard = lock_test_conn(&state).unwrap();
        let conn = guard.as_ref().unwrap();
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM mcp_servers WHERE server_name = 'shared-name'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 2);
    }
}

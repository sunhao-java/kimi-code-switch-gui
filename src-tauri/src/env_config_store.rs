//! 环境级配置存储（SQLite）。
//!
//! 存储 Provider / Model 配置，按 Kimi Code 环境标识隔离，SQLite 为唯一真源。
//! config.toml 仅为「启用项」的单向投影，由前端 saveState 负责生成。
//! providers / models 各以 JSON blob 形式存储（含 enabled 状态与真实密钥）。

use serde_json::{json, Value as Json};

/// env_config 表 schema
pub const SCHEMA_SQL: &str = include_str!("env_config_schema.sql");

/// 安全地获取数据库连接，处理 poisoned lock。
fn lock_conn<'a>(
    state: &'a tauri::State<crate::usage::UsageState>,
) -> Result<std::sync::MutexGuard<'a, Option<rusqlite::Connection>>, String> {
    state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())
}

fn now_iso() -> String {
    chrono::Utc::now().to_rfc3339()
}

/// 初始化 env_config 表。
#[tauri::command]
pub fn init_env_config_store(
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;
    conn.execute_batch(SCHEMA_SQL)
        .map_err(|e| format!("create env_config table: {e}"))?;
    log::info!("env_config table initialized");
    Ok(())
}

/// 校验 JSON 文本是对象，非法则回退为 "{}"。
fn ensure_json_object(text: &str) -> String {
    match serde_json::from_str::<Json>(text) {
        Ok(Json::Object(_)) => text.to_string(),
        _ => "{}".to_string(),
    }
}

/// 读取某环境的 providers / models，返回 `{ "providers": {...}, "models": {...} }` JSON 字符串。
/// 环境不存在时返回 null。
#[tauri::command]
pub fn get_env_config(
    environment_id: String,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<Option<String>, String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;
    let row: Option<(String, String)> = conn
        .query_row(
            "SELECT providers, models FROM env_config WHERE kimi_code_environment_id = ?1",
            [&environment_id],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .map_err(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                "no-row".to_string()
            } else {
                format!("get env_config: {e}")
            }
        })
        .ok()
        .map(Some)
        .unwrap_or(None);

    match row {
        Some((providers, models)) => {
            let providers_json: Json =
                serde_json::from_str(&providers).unwrap_or_else(|_| json!({}));
            let models_json: Json = serde_json::from_str(&models).unwrap_or_else(|_| json!({}));
            Ok(Some(
                json!({ "providers": providers_json, "models": models_json }).to_string(),
            ))
        }
        None => Ok(None),
    }
}

/// 整体替换某环境的 providers / models（UPSERT）。
/// `config_json` 形如 `{ "providers": {...}, "models": {...} }`。
#[tauri::command]
pub fn save_env_config(
    environment_id: String,
    config_json: String,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    let parsed: Json =
        serde_json::from_str(&config_json).map_err(|e| format!("parse env config: {e}"))?;
    let providers = parsed
        .get("providers")
        .map(|v| v.to_string())
        .unwrap_or_else(|| "{}".to_string());
    let models = parsed
        .get("models")
        .map(|v| v.to_string())
        .unwrap_or_else(|| "{}".to_string());
    let providers = ensure_json_object(&providers);
    let models = ensure_json_object(&models);
    let now = now_iso();

    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;
    conn.execute(
        "INSERT INTO env_config (kimi_code_environment_id, providers, models, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?4)
         ON CONFLICT(kimi_code_environment_id) DO UPDATE SET
           providers = excluded.providers,
           models = excluded.models,
           updated_at = excluded.updated_at",
        rusqlite::params![environment_id, providers, models, now],
    )
    .map_err(|e| format!("save env_config: {e}"))?;
    Ok(())
}

/// 删除某环境的整行配置（环境删除时调用）。
#[tauri::command]
pub fn delete_env_config(
    environment_id: String,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;
    conn.execute(
        "DELETE FROM env_config WHERE kimi_code_environment_id = ?1",
        [&environment_id],
    )
    .map_err(|e| format!("delete env_config: {e}"))?;
    Ok(())
}

/// 导出所有环境的配置，返回 `{ envId: { providers, models } }` JSON 字符串（用于全量备份）。
#[tauri::command]
pub fn export_all_env_configs(
    state: tauri::State<crate::usage::UsageState>,
) -> Result<String, String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;
    let mut stmt = conn
        .prepare(
            "SELECT kimi_code_environment_id, providers, models FROM env_config ORDER BY kimi_code_environment_id",
        )
        .map_err(|e| format!("prepare export env_config: {e}"))?;
    let rows = stmt
        .query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| format!("query env_config: {e}"))?;

    let mut out = serde_json::Map::new();
    for row in rows {
        let (env_id, providers, models) = row.map_err(|e| format!("read env_config row: {e}"))?;
        let providers_json: Json = serde_json::from_str(&providers).unwrap_or_else(|_| json!({}));
        let models_json: Json = serde_json::from_str(&models).unwrap_or_else(|_| json!({}));
        out.insert(
            env_id,
            json!({ "providers": providers_json, "models": models_json }),
        );
    }
    Ok(Json::Object(out).to_string())
}

/// 导入所有环境的配置（先清空 env_config 表，再整体写入）。
/// `all_json` 形如 `{ envId: { providers, models } }`。
#[tauri::command]
pub fn import_all_env_configs(
    all_json: String,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    let parsed: Json =
        serde_json::from_str(&all_json).map_err(|e| format!("parse all env config: {e}"))?;
    let obj = parsed
        .as_object()
        .ok_or("all env config must be an object")?;
    let now = now_iso();

    let mut guard = lock_conn(&state)?;
    let conn = guard.as_mut().ok_or("usage db not open")?;
    let tx = conn
        .transaction()
        .map_err(|e| format!("begin import tx: {e}"))?;
    tx.execute("DELETE FROM env_config", [])
        .map_err(|e| format!("clear env_config: {e}"))?;
    for (env_id, value) in obj {
        let providers = value
            .get("providers")
            .map(|v| v.to_string())
            .unwrap_or_else(|| "{}".to_string());
        let models = value
            .get("models")
            .map(|v| v.to_string())
            .unwrap_or_else(|| "{}".to_string());
        let providers = ensure_json_object(&providers);
        let models = ensure_json_object(&models);
        tx.execute(
            "INSERT INTO env_config (kimi_code_environment_id, providers, models, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            rusqlite::params![env_id, providers, models, now],
        )
        .map_err(|e| format!("insert env_config {env_id}: {e}"))?;
    }
    tx.commit().map_err(|e| format!("commit import tx: {e}"))?;
    Ok(())
}

/// 一次性迁移：从某环境的 config.toml 读取 [providers] / [models]，全部以 enabled=true 写入 DB。
/// 仅当该环境在 DB 中尚无记录时执行（幂等）。
#[tauri::command]
pub fn migrate_env_config_from_toml(
    environment_id: String,
    config_toml_path: String,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    use std::fs;

    // 已存在则跳过（幂等）。
    {
        let guard = lock_conn(&state)?;
        let conn = guard.as_ref().ok_or("usage db not open")?;
        let exists: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM env_config WHERE kimi_code_environment_id = ?1",
                [&environment_id],
                |r| r.get(0),
            )
            .map_err(|e| format!("check env_config exists: {e}"))?;
        if exists > 0 {
            return Ok(());
        }
    }

    let resolved = crate::fs_access::resolve_home(&config_toml_path);
    if !resolved.exists() {
        // 没有配置文件，写入空配置占位，避免后续重复迁移尝试。
        return save_env_config(
            environment_id,
            json!({ "providers": {}, "models": {} }).to_string(),
            state,
        );
    }

    let content = fs::read_to_string(&resolved).map_err(|e| format!("read config.toml: {e}"))?;
    let parsed: toml::Value =
        toml::from_str(&content).map_err(|e| format!("parse config.toml: {e}"))?;

    let to_json = |v: &toml::Value| -> Json {
        serde_json::to_value(v).unwrap_or_else(|_| json!({}))
    };
    let providers = parsed
        .get("providers")
        .map(to_json)
        .unwrap_or_else(|| json!({}));
    let models = parsed.get("models").map(to_json).unwrap_or_else(|| json!({}));

    // 全部标记 enabled=true。
    let mark_enabled = |v: Json| -> Json {
        match v {
            Json::Object(map) => {
                let mut out = serde_json::Map::new();
                for (k, mut entry) in map {
                    if let Json::Object(ref mut e) = entry {
                        e.insert("enabled".to_string(), json!(true));
                    }
                    out.insert(k, entry);
                }
                Json::Object(out)
            }
            other => other,
        }
    };

    save_env_config(
        environment_id,
        json!({
            "providers": mark_enabled(providers),
            "models": mark_enabled(models),
        })
        .to_string(),
        state,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::Mutex;

    fn make_state() -> crate::usage::UsageState {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA_SQL).unwrap();
        crate::usage::UsageState {
            conn: Mutex::new(Some(conn)),
        }
    }

    fn save(env: &str, cfg: &str, state: &crate::usage::UsageState) {
        let guard = state.conn.lock().unwrap();
        let conn = guard.as_ref().unwrap();
        let parsed: Json = serde_json::from_str(cfg).unwrap();
        let providers = parsed.get("providers").map(|v| v.to_string()).unwrap_or_else(|| "{}".into());
        let models = parsed.get("models").map(|v| v.to_string()).unwrap_or_else(|| "{}".into());
        conn.execute(
            "INSERT INTO env_config (kimi_code_environment_id, providers, models, created_at, updated_at)
             VALUES (?1, ?2, ?3, '2026-01-01', '2026-01-01')
             ON CONFLICT(kimi_code_environment_id) DO UPDATE SET providers=excluded.providers, models=excluded.models",
            rusqlite::params![env, providers, models],
        )
        .unwrap();
    }

    fn get(env: &str, state: &crate::usage::UsageState) -> Option<(String, String)> {
        let guard = state.conn.lock().unwrap();
        let conn = guard.as_ref().unwrap();
        conn.query_row(
            "SELECT providers, models FROM env_config WHERE kimi_code_environment_id = ?1",
            [env],
            |r| Ok((r.get(0)?, r.get(1)?)),
        )
        .ok()
    }

    #[test]
    fn upsert_and_read_roundtrip() {
        let state = make_state();
        save("default", r#"{"providers":{"p1":{"type":"kimi","enabled":true}},"models":{}}"#, &state);
        let (providers, _models) = get("default", &state).expect("row exists");
        let parsed: Json = serde_json::from_str(&providers).unwrap();
        assert_eq!(parsed["p1"]["type"], "kimi");
        assert_eq!(parsed["p1"]["enabled"], true);
    }

    #[test]
    fn upsert_replaces_existing() {
        let state = make_state();
        save("default", r#"{"providers":{"p1":{}},"models":{}}"#, &state);
        save("default", r#"{"providers":{"p2":{}},"models":{}}"#, &state);
        let (providers, _) = get("default", &state).unwrap();
        let parsed: Json = serde_json::from_str(&providers).unwrap();
        assert!(parsed.get("p1").is_none());
        assert!(parsed.get("p2").is_some());
    }

    #[test]
    fn environments_are_isolated() {
        let state = make_state();
        save("default", r#"{"providers":{"d":{}},"models":{}}"#, &state);
        save("work", r#"{"providers":{"w":{}},"models":{}}"#, &state);
        let (dp, _) = get("default", &state).unwrap();
        let (wp, _) = get("work", &state).unwrap();
        assert!(serde_json::from_str::<Json>(&dp).unwrap().get("d").is_some());
        assert!(serde_json::from_str::<Json>(&wp).unwrap().get("w").is_some());
    }
}


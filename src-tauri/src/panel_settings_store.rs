//! 面板设置存储（SQLite）。
//!
//! 设计：结构化表存储，每个配置项独立列，复杂对象（shortcuts、mcp_servers 等）使用 JSON 列。
//! 单行设计（id=1），version 字段用于未来 schema 升级。

use rusqlite::OptionalExtension;

/// panel_settings 表 schema（结构化存储）。
pub const SCHEMA_SQL: &str = include_str!("panel_settings_schema.sql");

/// 安全地获取数据库连接，处理 poisoned lock。
fn lock_conn<'a>(
    state: &'a tauri::State<crate::usage::UsageState>,
) -> Result<std::sync::MutexGuard<'a, Option<rusqlite::Connection>>, String> {
    state
        .conn
        .lock()
        .map_err(|_| "database lock poisoned".to_string())
}

fn ensure_column(
    conn: &rusqlite::Connection,
    columns: &[String],
    column_name: &str,
    column_definition: &str,
) -> Result<(), String> {
    if columns.contains(&column_name.to_string()) {
        return Ok(());
    }
    conn.execute(
        &format!("ALTER TABLE panel_settings ADD COLUMN {column_definition}"),
        [],
    )
    .map_err(|e| format!("add {column_name} column to panel_settings: {e}"))?;
    Ok(())
}

fn ensure_structured_panel_settings_columns(
    conn: &rusqlite::Connection,
    columns: &[String],
) -> Result<(), String> {
    let required_columns = [
        ("version", "version INTEGER NOT NULL DEFAULT 1"),
        (
            "config_target",
            "config_target TEXT NOT NULL DEFAULT 'kimi-code'",
        ),
        ("config_path", "config_path TEXT NOT NULL DEFAULT ''"),
        ("profiles", "profiles TEXT NOT NULL DEFAULT '{}'"),
        (
            "active_profile",
            "active_profile TEXT NOT NULL DEFAULT 'default'",
        ),
        ("profiles_path", "profiles_path TEXT NOT NULL DEFAULT ''"),
        (
            "follow_config_profiles",
            "follow_config_profiles INTEGER NOT NULL DEFAULT 1",
        ),
        ("theme", "theme TEXT NOT NULL DEFAULT 'auto'"),
        (
            "appearance_theme",
            "appearance_theme TEXT NOT NULL DEFAULT 'cupertino'",
        ),
        (
            "ui_font_size",
            "ui_font_size TEXT NOT NULL DEFAULT 'medium'",
        ),
        ("locale", "locale TEXT NOT NULL DEFAULT 'en-US'"),
        ("tray_icon", "tray_icon INTEGER NOT NULL DEFAULT 0"),
        (
            "sidebar_collapsed",
            "sidebar_collapsed INTEGER NOT NULL DEFAULT 0",
        ),
        (
            "display_open_mode",
            "display_open_mode TEXT NOT NULL DEFAULT 'normal'",
        ),
        (
            "close_behavior",
            "close_behavior TEXT NOT NULL DEFAULT 'minimize'",
        ),
        ("terminal_app", "terminal_app TEXT NOT NULL DEFAULT 'auto'"),
        ("last_display_id", "last_display_id INTEGER"),
        ("ui_state", "ui_state TEXT"),
        ("favorites", "favorites TEXT"),
        (
            "active_official_account_id",
            "active_official_account_id TEXT NOT NULL DEFAULT ''",
        ),
        (
            "backup_strategy",
            "backup_strategy TEXT NOT NULL DEFAULT 'manual'",
        ),
        (
            "backup_frequency",
            "backup_frequency TEXT NOT NULL DEFAULT 'daily'",
        ),
        (
            "backup_retention_count",
            "backup_retention_count INTEGER NOT NULL DEFAULT 7",
        ),
        (
            "backup_destination_type",
            "backup_destination_type TEXT NOT NULL DEFAULT 'local'",
        ),
        (
            "backup_local_path",
            "backup_local_path TEXT NOT NULL DEFAULT ''",
        ),
        (
            "backup_webdav_url",
            "backup_webdav_url TEXT NOT NULL DEFAULT ''",
        ),
        (
            "backup_webdav_username",
            "backup_webdav_username TEXT NOT NULL DEFAULT ''",
        ),
        (
            "backup_webdav_password",
            "backup_webdav_password TEXT NOT NULL DEFAULT ''",
        ),
        (
            "backup_webdav_path",
            "backup_webdav_path TEXT NOT NULL DEFAULT '/kimi-backups'",
        ),
        ("shortcuts", "shortcuts TEXT NOT NULL DEFAULT '{}'"),
        ("mcp_servers", "mcp_servers TEXT NOT NULL DEFAULT '{}'"),
        ("kimi_code_environments", "kimi_code_environments TEXT"),
        (
            "active_kimi_code_environment_id",
            "active_kimi_code_environment_id TEXT NOT NULL DEFAULT 'default'",
        ),
        (
            "insights_status",
            "insights_status TEXT NOT NULL DEFAULT 'disabled'",
        ),
        ("insights_proxy_port", "insights_proxy_port TEXT"),
        (
            "insights_retention_days",
            "insights_retention_days INTEGER NOT NULL DEFAULT 30",
        ),
        (
            "insights_disk_warn_threshold_mb",
            "insights_disk_warn_threshold_mb INTEGER NOT NULL DEFAULT 500",
        ),
        (
            "insights_store_prompt_preview",
            "insights_store_prompt_preview INTEGER NOT NULL DEFAULT 1",
        ),
        (
            "insights_onboarding_shown_at",
            "insights_onboarding_shown_at TEXT",
        ),
        (
            "insights_last_known_port",
            "insights_last_known_port INTEGER",
        ),
        (
            "insights_display_currency",
            "insights_display_currency TEXT NOT NULL DEFAULT 'USD'",
        ),
        ("insights_currency_rates", "insights_currency_rates TEXT"),
        ("updated_at", "updated_at TEXT NOT NULL DEFAULT ''"),
        ("created_at", "created_at TEXT NOT NULL DEFAULT ''"),
    ];
    for (column_name, column_definition) in required_columns {
        ensure_column(conn, columns, column_name, column_definition)?;
    }
    Ok(())
}

/// 初始化 panel_settings 表。
#[tauri::command]
pub fn init_panel_settings_store(
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;

    // 检查表是否存在以及结构是否匹配
    let table_exists: bool = conn
        .query_row(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='panel_settings'",
            [],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if table_exists {
        // 检查是否是旧的 JSON 列结构（通过查询表结构而不是执行查询）
        let columns: Vec<String> = conn
            .prepare("SELECT name FROM pragma_table_info('panel_settings')")
            .and_then(|mut stmt| {
                stmt.query_map([], |row| row.get(0))?
                    .collect::<Result<Vec<String>, _>>()
            })
            .unwrap_or_default();

        let has_settings_json_only = columns.contains(&"settings_json".to_string())
            && !columns.contains(&"config_path".to_string());

        // 如果是旧结构（只有 settings_json 列），删除表重建
        if has_settings_json_only {
            log::info!("Detected old panel_settings schema, dropping and recreating...");
            conn.execute("DROP TABLE panel_settings", [])
                .map_err(|e| format!("drop old panel_settings table: {e}"))?;
        } else if !columns.contains(&"id".to_string()) {
            log::info!("Detected incompatible panel_settings schema, dropping and recreating...");
            conn.execute("DROP TABLE panel_settings", [])
                .map_err(|e| format!("drop incompatible panel_settings table: {e}"))?;
        } else {
            ensure_structured_panel_settings_columns(conn, &columns)?;
        }
    }

    // 创建新表（如果不存在）
    conn.execute_batch(SCHEMA_SQL)
        .map_err(|e| format!("create panel_settings table: {e}"))?;

    log::info!("panel_settings table initialized");
    Ok(())
}

/// 获取面板设置。
///
/// 返回 JSON 字符串（前端自行解析为 PanelSettings）。
/// 若数据库为空，返回 None。
#[tauri::command]
pub fn get_panel_settings(
    state: tauri::State<crate::usage::UsageState>,
) -> Result<Option<String>, String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;

    // 查询所有列，组装为 JSON
    let row_json: Option<String> = conn
        .query_row(
            "SELECT
                version, config_target, config_path, profiles, active_profile, profiles_path, follow_config_profiles,
                theme, appearance_theme, ui_font_size, locale,
                tray_icon, sidebar_collapsed, display_open_mode, close_behavior, terminal_app,
                last_display_id, ui_state, favorites, active_official_account_id,
                backup_strategy, backup_frequency, backup_retention_count, backup_destination_type,
                backup_local_path, backup_webdav_url, backup_webdav_username,
                backup_webdav_password, backup_webdav_path,
                shortcuts, mcp_servers, kimi_code_environments, active_kimi_code_environment_id,
                insights_status, insights_proxy_port, insights_retention_days,
                insights_disk_warn_threshold_mb, insights_store_prompt_preview,
                insights_onboarding_shown_at, insights_last_known_port,
                insights_display_currency, insights_currency_rates
            FROM panel_settings WHERE id = 1",
            [],
            |row| {
                let json = serde_json::json!({
                    "version": row.get::<_, i64>(0)?,
                    "config_target": row.get::<_, String>(1)?,
                    "config_path": row.get::<_, String>(2)?,
                    "profiles": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(3)?).unwrap_or(serde_json::json!({})),
                    "active_profile": row.get::<_, String>(4)?,
                    "profiles_path": row.get::<_, String>(5)?,
                    "follow_config_profiles": row.get::<_, i64>(6)? != 0,
                    "theme": row.get::<_, String>(7)?,
                    "appearance_theme": row.get::<_, String>(8)?,
                    "ui_font_size": row.get::<_, String>(9)?,
                    "locale": row.get::<_, String>(10)?,
                    "tray_icon": row.get::<_, i64>(11)? != 0,
                    "sidebar_collapsed": row.get::<_, i64>(12)? != 0,
                    "display_open_mode": row.get::<_, String>(13)?,
                    "close_behavior": row.get::<_, String>(14)?,
                    "terminal_app": row.get::<_, String>(15)?,
                    "last_display_id": row.get::<_, Option<i64>>(16)?,
                    "uiState": row.get::<_, Option<String>>(17)?
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                    "favorites": row.get::<_, Option<String>>(18)?
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                    "active_official_account_id": row.get::<_, String>(19)?,
                    "backup_strategy": row.get::<_, String>(20)?,
                    "backup_frequency": row.get::<_, String>(21)?,
                    "backup_retention_count": row.get::<_, i64>(22)?,
                    "backup_destination_type": row.get::<_, String>(23)?,
                    "backup_local_path": row.get::<_, String>(24)?,
                    "backup_webdav_url": row.get::<_, String>(25)?,
                    "backup_webdav_username": row.get::<_, String>(26)?,
                    "backup_webdav_password": row.get::<_, String>(27)?,
                    "backup_webdav_path": row.get::<_, String>(28)?,
                    "shortcuts": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(29)?).unwrap_or(serde_json::json!({})),
                    "mcp_servers": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(30)?).unwrap_or(serde_json::json!({})),
                    "kimi_code_environments": row.get::<_, Option<String>>(31)?
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                    "active_kimi_code_environment_id": row.get::<_, String>(32)?,
                    "insights_status": row.get::<_, String>(33)?,
                    "insights_proxy_port": row.get::<_, Option<String>>(34)?
                        .and_then(|s| if s == "auto" { Some(serde_json::json!("auto")) } else { s.parse::<i64>().ok().map(|n| serde_json::json!(n)) }),
                    "insights_retention_days": row.get::<_, i64>(35)?,
                    "insights_disk_warn_threshold_mb": row.get::<_, i64>(36)?,
                    "insights_store_prompt_preview": row.get::<_, i64>(37)? != 0,
                    "insights_onboarding_shown_at": row.get::<_, Option<String>>(38)?,
                    "insights_last_known_port": row.get::<_, Option<i64>>(39)?,
                    "insights_display_currency": row.get::<_, String>(40)?,
                    "insights_currency_rates": row.get::<_, Option<String>>(41)?
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                });
                Ok(json.to_string())
            },
        )
        .optional()
        .map_err(|e| format!("query panel_settings: {e}"))?;

    Ok(row_json)
}

/// 保存面板设置。
///
/// 接收 JSON 字符串（前端已序列化 PanelSettings），拆解后插入各列。
#[tauri::command]
pub fn save_panel_settings(
    settings_json: String,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    let guard = lock_conn(&state)?;
    let conn = guard.as_ref().ok_or("usage db not open")?;

    let settings: serde_json::Value =
        serde_json::from_str(&settings_json).map_err(|e| format!("parse settings json: {e}"))?;

    let now = chrono::Utc::now().to_rfc3339();

    // 辅助函数：安全提取
    let get_str = |key: &str| settings[key].as_str().unwrap_or("").to_string();
    let get_bool = |key: &str| {
        if settings[key].as_bool().unwrap_or(false) {
            1i64
        } else {
            0i64
        }
    };
    let get_i64 = |key: &str| settings[key].as_i64().unwrap_or(0);
    let get_opt_i64 = |key: &str| settings[key].as_i64();
    let get_opt_str = |key: &str| settings[key].as_str().map(|s| s.to_string());
    let get_json_str = |key: &str| {
        if settings[key].is_null() {
            None
        } else {
            Some(settings[key].to_string())
        }
    };

    // UPSERT
    conn.execute(
        "INSERT INTO panel_settings (
            id, version,
            config_target, config_path, profiles, active_profile, profiles_path, follow_config_profiles,
            theme, appearance_theme, ui_font_size, locale,
            tray_icon, sidebar_collapsed, display_open_mode, close_behavior, terminal_app,
            last_display_id, ui_state, favorites, active_official_account_id,
            backup_strategy, backup_frequency, backup_retention_count, backup_destination_type,
            backup_local_path, backup_webdav_url, backup_webdav_username,
            backup_webdav_password, backup_webdav_path,
            shortcuts, mcp_servers, kimi_code_environments, active_kimi_code_environment_id,
            insights_status, insights_proxy_port, insights_retention_days,
            insights_disk_warn_threshold_mb, insights_store_prompt_preview,
            insights_onboarding_shown_at, insights_last_known_port,
            insights_display_currency, insights_currency_rates,
            updated_at, created_at
        ) VALUES (
            1, ?1,
            ?2, ?3, ?4, ?5, ?6, ?7,
            ?8, ?9, ?10, ?11,
            ?12, ?13, ?14, ?15, ?16,
            ?17, ?18, ?19, ?20,
            ?21, ?22, ?23, ?24,
            ?25, ?26, ?27,
            ?28, ?29,
            ?30, ?31, ?32, ?33,
            ?34, ?35, ?36,
            ?37, ?38,
            ?39, ?40,
            ?41, ?42,
            ?43, ?43
        )
        ON CONFLICT(id) DO UPDATE SET
            version = excluded.version,
            config_target = excluded.config_target,
            config_path = excluded.config_path,
            profiles = excluded.profiles,
            active_profile = excluded.active_profile,
            profiles_path = excluded.profiles_path,
            follow_config_profiles = excluded.follow_config_profiles,
            theme = excluded.theme,
            appearance_theme = excluded.appearance_theme,
            ui_font_size = excluded.ui_font_size,
            locale = excluded.locale,
            tray_icon = excluded.tray_icon,
            sidebar_collapsed = excluded.sidebar_collapsed,
            display_open_mode = excluded.display_open_mode,
            close_behavior = excluded.close_behavior,
            terminal_app = excluded.terminal_app,
            last_display_id = excluded.last_display_id,
            ui_state = excluded.ui_state,
            favorites = excluded.favorites,
            active_official_account_id = excluded.active_official_account_id,
            backup_strategy = excluded.backup_strategy,
            backup_frequency = excluded.backup_frequency,
            backup_retention_count = excluded.backup_retention_count,
            backup_destination_type = excluded.backup_destination_type,
            backup_local_path = excluded.backup_local_path,
            backup_webdav_url = excluded.backup_webdav_url,
            backup_webdav_username = excluded.backup_webdav_username,
            backup_webdav_password = excluded.backup_webdav_password,
            backup_webdav_path = excluded.backup_webdav_path,
            shortcuts = excluded.shortcuts,
            mcp_servers = excluded.mcp_servers,
            kimi_code_environments = excluded.kimi_code_environments,
            active_kimi_code_environment_id = excluded.active_kimi_code_environment_id,
            insights_status = excluded.insights_status,
            insights_proxy_port = excluded.insights_proxy_port,
            insights_retention_days = excluded.insights_retention_days,
            insights_disk_warn_threshold_mb = excluded.insights_disk_warn_threshold_mb,
            insights_store_prompt_preview = excluded.insights_store_prompt_preview,
            insights_onboarding_shown_at = excluded.insights_onboarding_shown_at,
            insights_last_known_port = excluded.insights_last_known_port,
            insights_display_currency = excluded.insights_display_currency,
            insights_currency_rates = excluded.insights_currency_rates,
            updated_at = excluded.updated_at",
        rusqlite::params![
            get_i64("version"),
            get_str("config_target"),
            get_str("config_path"),
            settings["profiles"].to_string(),
            get_str("active_profile"),
            get_str("profiles_path"),
            get_bool("follow_config_profiles"),
            get_str("theme"),
            get_str("appearance_theme"),
            get_str("ui_font_size"),
            get_str("locale"),
            get_bool("tray_icon"),
            get_bool("sidebar_collapsed"),
            get_str("display_open_mode"),
            get_str("close_behavior"),
            get_str("terminal_app"),
            get_opt_i64("last_display_id"),
            get_json_str("uiState"),
            get_json_str("favorites"),
            get_str("active_official_account_id"),
            get_str("backup_strategy"),
            get_str("backup_frequency"),
            get_i64("backup_retention_count"),
            get_str("backup_destination_type"),
            get_str("backup_local_path"),
            get_str("backup_webdav_url"),
            get_str("backup_webdav_username"),
            get_str("backup_webdav_password"),
            get_str("backup_webdav_path"),
            settings["shortcuts"].to_string(),
            settings["mcp_servers"].to_string(),
            get_json_str("kimi_code_environments"),
            get_str("active_kimi_code_environment_id"),
            get_str("insights_status"),
            // insights_proxy_port: number | "auto" | null
            settings["insights_proxy_port"].as_str().map(|s| s.to_string())
                .or_else(|| settings["insights_proxy_port"].as_i64().map(|n| n.to_string())),
            get_i64("insights_retention_days"),
            get_i64("insights_disk_warn_threshold_mb"),
            get_bool("insights_store_prompt_preview"),
            get_opt_str("insights_onboarding_shown_at"),
            get_opt_i64("insights_last_known_port"),
            get_str("insights_display_currency"),
            get_json_str("insights_currency_rates"),
            now,
        ],
    )
    .map_err(|e| format!("save panel_settings: {e}"))?;

    log::info!("panel_settings saved");
    Ok(())
}

/// 导出面板设置为 JSON 字符串（用于备份）。
#[tauri::command]
pub fn export_panel_settings(
    state: tauri::State<crate::usage::UsageState>,
) -> Result<String, String> {
    get_panel_settings(state)?.ok_or_else(|| "panel settings not found".to_string())
}

/// 导入面板设置（覆盖现有设置）。
#[tauri::command]
pub fn import_panel_settings(
    settings_json: String,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    save_panel_settings(settings_json, state)
}

/// 从旧 TOML 文件迁移到 SQLite（首次启动）。
/// 从旧版 TOML 文件迁移到数据库。
///
/// 迁移逻辑：
/// 1. 如果数据库中已有设置，只重命名 TOML 文件为 .migrated（不覆盖数据库）
/// 2. 如果数据库为空，解析 TOML 并保存到数据库，然后重命名 TOML
///
/// 这样可以避免前端先保存后迁移时，TOML 被遗留的问题。
#[tauri::command]
pub fn migrate_panel_settings_from_toml(
    toml_path: String,
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    use std::fs;

    let resolved_path = crate::fs_access::resolve_home(&toml_path);

    // 检查 TOML 文件是否存在
    if !resolved_path.exists() {
        return Ok(()); // 不存在则跳过
    }

    // 检查数据库中是否已有设置
    let db_has_settings = get_panel_settings(state.clone())?.is_some();

    if !db_has_settings {
        // 数据库为空，执行完整迁移
        let toml_content =
            fs::read_to_string(&resolved_path).map_err(|e| format!("read toml: {e}"))?;

        // 解析 TOML 为 JSON
        let toml_value: toml::Value =
            toml::from_str(&toml_content).map_err(|e| format!("parse toml: {e}"))?;

        let settings_json =
            serde_json::to_string(&toml_value).map_err(|e| format!("convert toml to json: {e}"))?;

        // 保存到数据库
        save_panel_settings(settings_json, state)?;

        log::info!("Migrated panel settings from {} to database", toml_path);
    } else {
        log::info!("Panel settings already exist in database, only renaming TOML file");
    }

    // 重命名 TOML 文件（无论数据库是否已有设置）
    let migrated_path = resolved_path.with_extension("toml.migrated");
    fs::rename(&resolved_path, &migrated_path).map_err(|e| format!("rename toml: {e}"))?;

    log::info!("Renamed {} to .migrated", toml_path);
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

    // 测试专用：直接操作 state
    fn save_test(settings_json: &str, state: &crate::usage::UsageState) -> Result<(), String> {
        let guard = lock_test_conn(state)?;
        let conn = guard.as_ref().ok_or("usage db not open")?;

        let settings: serde_json::Value =
            serde_json::from_str(settings_json).map_err(|e| format!("parse settings json: {e}"))?;

        let now = chrono::Utc::now().to_rfc3339();

        let get_str = |key: &str| settings[key].as_str().unwrap_or("").to_string();
        let get_bool = |key: &str| {
            if settings[key].as_bool().unwrap_or(false) {
                1i64
            } else {
                0i64
            }
        };
        let get_i64 = |key: &str| settings[key].as_i64().unwrap_or(0);
        let get_opt_i64 = |key: &str| settings[key].as_i64();
        let get_opt_str = |key: &str| settings[key].as_str().map(|s| s.to_string());
        let get_json_str = |key: &str| {
            if settings[key].is_null() {
                None
            } else {
                Some(settings[key].to_string())
            }
        };

        conn.execute(
            "INSERT INTO panel_settings (
                id, version,
                config_target, config_path, profiles, active_profile, profiles_path, follow_config_profiles,
                theme, appearance_theme, ui_font_size, locale,
                tray_icon, sidebar_collapsed, display_open_mode, close_behavior, terminal_app,
                last_display_id, ui_state, favorites, active_official_account_id,
                backup_strategy, backup_frequency, backup_retention_count, backup_destination_type,
                backup_local_path, backup_webdav_url, backup_webdav_username,
                backup_webdav_password, backup_webdav_path,
                shortcuts, mcp_servers, kimi_code_environments, active_kimi_code_environment_id,
                insights_status, insights_proxy_port, insights_retention_days,
                insights_disk_warn_threshold_mb, insights_store_prompt_preview,
                insights_onboarding_shown_at, insights_last_known_port,
                insights_display_currency, insights_currency_rates,
                updated_at, created_at
            ) VALUES (
                1, ?1,
                ?2, ?3, ?4, ?5, ?6, ?7,
                ?8, ?9, ?10, ?11,
                ?12, ?13, ?14, ?15, ?16,
                ?17, ?18, ?19, ?20,
                ?21, ?22, ?23, ?24,
                ?25, ?26, ?27,
                ?28, ?29,
                ?30, ?31, ?32, ?33,
                ?34, ?35, ?36,
                ?37, ?38,
                ?39, ?40,
                ?41, ?42,
                ?43, ?43
            )
            ON CONFLICT(id) DO UPDATE SET
                version = excluded.version,
                config_target = excluded.config_target,
                config_path = excluded.config_path,
                profiles = excluded.profiles,
                active_profile = excluded.active_profile,
                profiles_path = excluded.profiles_path,
                follow_config_profiles = excluded.follow_config_profiles,
                theme = excluded.theme,
                appearance_theme = excluded.appearance_theme,
                ui_font_size = excluded.ui_font_size,
                locale = excluded.locale,
                tray_icon = excluded.tray_icon,
                sidebar_collapsed = excluded.sidebar_collapsed,
                display_open_mode = excluded.display_open_mode,
                close_behavior = excluded.close_behavior,
                terminal_app = excluded.terminal_app,
                last_display_id = excluded.last_display_id,
                ui_state = excluded.ui_state,
                favorites = excluded.favorites,
                active_official_account_id = excluded.active_official_account_id,
                backup_strategy = excluded.backup_strategy,
                backup_frequency = excluded.backup_frequency,
                backup_retention_count = excluded.backup_retention_count,
                backup_destination_type = excluded.backup_destination_type,
                backup_local_path = excluded.backup_local_path,
                backup_webdav_url = excluded.backup_webdav_url,
                backup_webdav_username = excluded.backup_webdav_username,
                backup_webdav_password = excluded.backup_webdav_password,
                backup_webdav_path = excluded.backup_webdav_path,
                shortcuts = excluded.shortcuts,
                mcp_servers = excluded.mcp_servers,
                kimi_code_environments = excluded.kimi_code_environments,
                active_kimi_code_environment_id = excluded.active_kimi_code_environment_id,
                insights_status = excluded.insights_status,
                insights_proxy_port = excluded.insights_proxy_port,
                insights_retention_days = excluded.insights_retention_days,
                insights_disk_warn_threshold_mb = excluded.insights_disk_warn_threshold_mb,
                insights_store_prompt_preview = excluded.insights_store_prompt_preview,
                insights_onboarding_shown_at = excluded.insights_onboarding_shown_at,
                insights_last_known_port = excluded.insights_last_known_port,
                insights_display_currency = excluded.insights_display_currency,
                insights_currency_rates = excluded.insights_currency_rates,
                updated_at = excluded.updated_at",
            rusqlite::params![
                get_i64("version"),
                get_str("config_target"),
                get_str("config_path"),
                settings["profiles"].to_string(),
                get_str("active_profile"),
                get_str("profiles_path"),
                get_bool("follow_config_profiles"),
                get_str("theme"),
                get_str("appearance_theme"),
                get_str("ui_font_size"),
                get_str("locale"),
                get_bool("tray_icon"),
                get_bool("sidebar_collapsed"),
                get_str("display_open_mode"),
                get_str("close_behavior"),
                get_str("terminal_app"),
                get_opt_i64("last_display_id"),
                get_json_str("uiState"),
                get_json_str("favorites"),
                get_str("active_official_account_id"),
                get_str("backup_strategy"),
                get_str("backup_frequency"),
                get_i64("backup_retention_count"),
                get_str("backup_destination_type"),
                get_str("backup_local_path"),
                get_str("backup_webdav_url"),
                get_str("backup_webdav_username"),
                get_str("backup_webdav_password"),
                get_str("backup_webdav_path"),
                settings["shortcuts"].to_string(),
                settings["mcp_servers"].to_string(),
                get_json_str("kimi_code_environments"),
                get_str("active_kimi_code_environment_id"),
                get_str("insights_status"),
                settings["insights_proxy_port"].as_str().map(|s| s.to_string())
                    .or_else(|| settings["insights_proxy_port"].as_i64().map(|n| n.to_string())),
                get_i64("insights_retention_days"),
                get_i64("insights_disk_warn_threshold_mb"),
                get_bool("insights_store_prompt_preview"),
                get_opt_str("insights_onboarding_shown_at"),
                get_opt_i64("insights_last_known_port"),
                get_str("insights_display_currency"),
                get_json_str("insights_currency_rates"),
                now,
            ],
        )
        .map_err(|e| format!("save panel_settings: {e}"))?;

        Ok(())
    }

    fn get_test(state: &crate::usage::UsageState) -> Result<Option<String>, String> {
        let guard = lock_test_conn(state)?;
        let conn = guard.as_ref().ok_or("usage db not open")?;

        let row_json: Option<String> = conn
            .query_row(
                "SELECT
                    version, config_target, config_path, profiles, active_profile, profiles_path, follow_config_profiles,
                    theme, appearance_theme, ui_font_size, locale,
                    tray_icon, sidebar_collapsed, display_open_mode, close_behavior, terminal_app,
                    last_display_id, ui_state, favorites, active_official_account_id,
                    backup_strategy, backup_frequency, backup_retention_count, backup_destination_type,
                    backup_local_path, backup_webdav_url, backup_webdav_username,
                    backup_webdav_password, backup_webdav_path,
                    shortcuts, mcp_servers, kimi_code_environments, active_kimi_code_environment_id,
                    insights_status, insights_proxy_port, insights_retention_days,
                    insights_disk_warn_threshold_mb, insights_store_prompt_preview,
                    insights_onboarding_shown_at, insights_last_known_port,
                    insights_display_currency, insights_currency_rates
                FROM panel_settings WHERE id = 1",
                [],
                |row| {
                    let json = serde_json::json!({
                        "version": row.get::<_, i64>(0)?,
                        "config_target": row.get::<_, String>(1)?,
                        "config_path": row.get::<_, String>(2)?,
                        "profiles": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(3)?).unwrap_or(serde_json::json!({})),
                        "active_profile": row.get::<_, String>(4)?,
                        "profiles_path": row.get::<_, String>(5)?,
                        "follow_config_profiles": row.get::<_, i64>(6)? != 0,
                        "theme": row.get::<_, String>(7)?,
                        "appearance_theme": row.get::<_, String>(8)?,
                        "ui_font_size": row.get::<_, String>(9)?,
                        "locale": row.get::<_, String>(10)?,
                        "tray_icon": row.get::<_, i64>(11)? != 0,
                        "sidebar_collapsed": row.get::<_, i64>(12)? != 0,
                        "display_open_mode": row.get::<_, String>(13)?,
                        "close_behavior": row.get::<_, String>(14)?,
                        "terminal_app": row.get::<_, String>(15)?,
                        "last_display_id": row.get::<_, Option<i64>>(16)?,
                        "uiState": row.get::<_, Option<String>>(17)?
                            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                        "favorites": row.get::<_, Option<String>>(18)?
                            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                        "active_official_account_id": row.get::<_, String>(19)?,
                        "backup_strategy": row.get::<_, String>(20)?,
                        "backup_frequency": row.get::<_, String>(21)?,
                        "backup_retention_count": row.get::<_, i64>(22)?,
                        "backup_destination_type": row.get::<_, String>(23)?,
                        "backup_local_path": row.get::<_, String>(24)?,
                        "backup_webdav_url": row.get::<_, String>(25)?,
                        "backup_webdav_username": row.get::<_, String>(26)?,
                        "backup_webdav_password": row.get::<_, String>(27)?,
                        "backup_webdav_path": row.get::<_, String>(28)?,
                        "shortcuts": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(29)?).unwrap_or(serde_json::json!({})),
                        "mcp_servers": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(30)?).unwrap_or(serde_json::json!({})),
                        "kimi_code_environments": row.get::<_, Option<String>>(31)?
                            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                        "active_kimi_code_environment_id": row.get::<_, String>(32)?,
                        "insights_status": row.get::<_, String>(33)?,
                        "insights_proxy_port": row.get::<_, Option<String>>(34)?
                            .and_then(|s| if s == "auto" { Some(serde_json::json!("auto")) } else { s.parse::<i64>().ok().map(|n| serde_json::json!(n)) }),
                        "insights_retention_days": row.get::<_, i64>(35)?,
                        "insights_disk_warn_threshold_mb": row.get::<_, i64>(36)?,
                        "insights_store_prompt_preview": row.get::<_, i64>(37)? != 0,
                        "insights_onboarding_shown_at": row.get::<_, Option<String>>(38)?,
                        "insights_last_known_port": row.get::<_, Option<i64>>(39)?,
                        "insights_display_currency": row.get::<_, String>(40)?,
                        "insights_currency_rates": row.get::<_, Option<String>>(41)?
                            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                    });
                    Ok(json.to_string())
                },
            )
            .optional()
            .map_err(|e| format!("query panel_settings: {e}"))?;

        Ok(row_json)
    }

    #[test]
    fn save_and_get_panel_settings() {
        let state = make_test_state();
        let test_settings = serde_json::json!({
            "version": 1,
            "config_target": "kimi-cli",
            "config_path": "~/.kimi/config.toml",
            "profiles_path": "~/.kimi/config.profiles.toml",
            "follow_config_profiles": true,
            "theme": "dark",
            "appearance_theme": "cupertino",
            "ui_font_size": "medium",
            "locale": "zh-CN",
            "tray_icon": true,
            "sidebar_collapsed": false,
            "display_open_mode": "normal",
            "close_behavior": "minimize",
            "terminal_app": "auto",
            "last_display_id": 123,
            "uiState": {"activeTab": "providers"},
            "favorites": {"providers": ["openai"]},
            "active_official_account_id": "acct-test",
            "backup_strategy": "manual",
            "backup_frequency": "daily",
            "backup_retention_count": 7,
            "backup_destination_type": "local",
            "backup_local_path": "~/.kimi/backups",
            "backup_webdav_url": "",
            "backup_webdav_username": "",
            "backup_webdav_password": "",
            "backup_webdav_path": "/kimi-backups",
            "shortcuts": {},
            "mcp_servers": {},
            "kimi_code_environments": [{"id": "default", "name": "Default", "homePath": "~/.kimi-code"}],
            "active_kimi_code_environment_id": "default",
            "insights_status": "enabled",
            "insights_proxy_port": "auto",
            "insights_retention_days": 30,
            "insights_disk_warn_threshold_mb": 500,
            "insights_store_prompt_preview": true,
            "insights_onboarding_shown_at": null,
            "insights_last_known_port": 8080,
            "insights_display_currency": "USD",
            "insights_currency_rates": {"USD": 1.0}
        });

        // 保存
        save_test(&test_settings.to_string(), &state).unwrap();

        // 读取
        let loaded = get_test(&state).unwrap().expect("settings should exist");

        let loaded_json: serde_json::Value = serde_json::from_str(&loaded).unwrap();
        assert_eq!(loaded_json["config_target"], "kimi-cli");
        assert_eq!(loaded_json["theme"], "dark");
        assert_eq!(loaded_json["locale"], "zh-CN");
        assert_eq!(loaded_json["tray_icon"], true);
        assert_eq!(loaded_json["last_display_id"], 123);
        assert_eq!(loaded_json["active_official_account_id"], "acct-test");
        assert_eq!(loaded_json["active_kimi_code_environment_id"], "default");
    }

    #[test]
    fn export_and_import() {
        let state = make_test_state();
        let test_settings = serde_json::json!({
            "version": 1,
            "config_target": "kimi-code",
            "config_path": "~/.kimi/config.toml",
            "profiles_path": "~/.kimi/config.profiles.toml",
            "follow_config_profiles": true,
            "theme": "light",
            "appearance_theme": "material",
            "ui_font_size": "large",
            "locale": "en-US",
            "tray_icon": false,
            "sidebar_collapsed": true,
            "display_open_mode": "fullscreen",
            "close_behavior": "quit",
            "terminal_app": "iterm2",
            "backup_strategy": "auto",
            "backup_frequency": "weekly",
            "backup_retention_count": 14,
            "backup_destination_type": "webdav",
            "backup_local_path": "~/.kimi/backups",
            "backup_webdav_url": "https://dav.example.com",
            "backup_webdav_username": "user",
            "backup_webdav_password": "pass",
            "backup_webdav_path": "/backups",
            "shortcuts": {},
            "mcp_servers": {},
            "kimi_code_environments": [{"id": "default", "name": "Default", "homePath": "~/.kimi-code"}],
            "active_kimi_code_environment_id": "default",
            "insights_status": "disabled",
            "insights_proxy_port": 9000,
            "insights_retention_days": 60,
            "insights_disk_warn_threshold_mb": 1000,
            "insights_store_prompt_preview": false,
            "insights_display_currency": "CNY",
        });

        // 导入
        save_test(&test_settings.to_string(), &state).unwrap();

        // 导出
        let exported = get_test(&state).unwrap().unwrap();
        let exported_json: serde_json::Value = serde_json::from_str(&exported).unwrap();

        assert_eq!(exported_json["config_target"], "kimi-code");
        assert_eq!(exported_json["theme"], "light");
        assert_eq!(exported_json["locale"], "en-US");
        assert_eq!(exported_json["insights_display_currency"], "CNY");
    }

    #[test]
    fn saves_startup_default_panel_settings_shape() {
        let state = make_test_state();
        let default_settings = serde_json::json!({
            "version": 1,
            "config_target": "kimi-code",
            "config_path": "~/.kimi-code/config.toml",
            "profiles": {},
            "active_profile": "default",
            "profiles_path": "",
            "follow_config_profiles": true,
            "theme": "auto",
            "appearance_theme": "aurora",
            "ui_font_size": "standard",
            "locale": "zh-CN",
            "tray_icon": false,
            "sidebar_collapsed": false,
            "display_open_mode": "remember-last",
            "close_behavior": "quit",
            "terminal_app": "system-terminal",
            "backup_strategy": "manual",
            "backup_frequency": "daily",
            "backup_retention_count": 10,
            "backup_destination_type": "local",
            "backup_local_path": "~/.kimi-code-switch-gui/backups",
            "backup_webdav_url": "",
            "backup_webdav_username": "",
            "backup_webdav_password": "",
            "backup_webdav_path": "",
            "shortcuts": {},
            "mcp_servers": {},
            "kimi_code_environments": [{
                "id": "default",
                "name": "Default",
                "homePath": "~/.kimi-code",
                "description": "",
                "createdAt": "2026-01-01T00:00:00.000Z",
                "updatedAt": "2026-01-01T00:00:00.000Z",
                "profiles": {},
                "activeProfile": "",
                "mcpServers": {}
            }],
            "active_kimi_code_environment_id": "default",
            "insights_status": "disabled",
            "insights_proxy_port": "auto",
            "insights_retention_days": 90,
            "insights_disk_warn_threshold_mb": 100,
            "insights_store_prompt_preview": false,
            "insights_onboarding_shown_at": "",
            "insights_last_known_port": null,
            "insights_display_currency": "USD",
            "insights_currency_rates": {}
        });

        save_test(&default_settings.to_string(), &state).unwrap();

        let loaded = get_test(&state).unwrap().expect("settings should exist");
        let loaded_json: serde_json::Value = serde_json::from_str(&loaded).unwrap();
        assert_eq!(loaded_json["config_target"], "kimi-code");
        assert_eq!(loaded_json["active_profile"], "default");
        assert_eq!(loaded_json["active_kimi_code_environment_id"], "default");
        assert_eq!(
            loaded_json["kimi_code_environments"][0]["homePath"],
            "~/.kimi-code"
        );
    }

    #[test]
    fn init_adds_missing_columns_for_partial_structured_schema() {
        let state = {
            let conn = Connection::open_in_memory().unwrap();
            conn.execute_batch(
                r#"
                CREATE TABLE panel_settings (
                  id INTEGER PRIMARY KEY CHECK (id = 1),
                  version INTEGER NOT NULL DEFAULT 1,
                  config_path TEXT NOT NULL,
                  shortcuts TEXT NOT NULL,
                  mcp_servers TEXT NOT NULL,
                  updated_at TEXT NOT NULL,
                  created_at TEXT NOT NULL
                );
                "#,
            )
            .unwrap();
            crate::usage::UsageState {
                conn: Mutex::new(Some(conn)),
            }
        };

        {
            let guard = lock_test_conn(&state).unwrap();
            let conn = guard.as_ref().unwrap();
            let columns: Vec<String> = conn
                .prepare("SELECT name FROM pragma_table_info('panel_settings')")
                .unwrap()
                .query_map([], |row| row.get::<_, String>(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap();
            ensure_structured_panel_settings_columns(conn, &columns).unwrap();
            conn.execute_batch(SCHEMA_SQL).unwrap();
        }

        let columns = {
            let guard = lock_test_conn(&state).unwrap();
            let conn = guard.as_ref().unwrap();
            let mut stmt = conn
                .prepare("SELECT name FROM pragma_table_info('panel_settings')")
                .unwrap();
            stmt.query_map([], |row| row.get::<_, String>(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap()
        };

        assert!(columns.contains(&"active_kimi_code_environment_id".to_string()));
        assert!(columns.contains(&"insights_display_currency".to_string()));
        assert!(columns.contains(&"backup_local_path".to_string()));
    }
}

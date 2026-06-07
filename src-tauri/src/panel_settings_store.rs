//! 面板设置存储（SQLite）。
//!
//! 设计：结构化表存储，每个配置项独立列，复杂对象（shortcuts、mcp_servers 等）使用 JSON 列。
//! 单行设计（id=1），version 字段用于未来 schema 升级。

use rusqlite::OptionalExtension;

/// panel_settings 表 schema（结构化存储）。
pub const SCHEMA_SQL: &str = include_str!("panel_settings_schema.sql");

/// 初始化 panel_settings 表。
#[tauri::command]
pub fn init_panel_settings_store(
    state: tauri::State<crate::usage::UsageState>,
) -> Result<(), String> {
    let guard = state.conn.lock().unwrap();
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
        // 检查是否是旧的 JSON 列结构
        let has_settings_json_only: bool = conn
            .prepare("SELECT settings_json FROM panel_settings LIMIT 0")
            .is_ok();

        let has_new_structure: bool = conn
            .prepare("SELECT config_path, theme, locale FROM panel_settings LIMIT 0")
            .is_ok();

        // 如果是旧结构（只有 settings_json 列），删除表重建
        if has_settings_json_only && !has_new_structure {
            log::info!("Detected old panel_settings schema, dropping and recreating...");
            conn.execute("DROP TABLE panel_settings", [])
                .map_err(|e| format!("drop old panel_settings table: {e}"))?;
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
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("usage db not open")?;

    // 查询所有列，组装为 JSON
    let row_json: Option<String> = conn
        .query_row(
            "SELECT
                version, config_path, profiles_path, follow_config_profiles,
                theme, appearance_theme, ui_font_size, locale,
                tray_icon, sidebar_collapsed, display_open_mode, close_behavior, terminal_app,
                last_display_id, ui_state, favorites,
                backup_strategy, backup_frequency, backup_retention_count, backup_destination_type,
                backup_local_path, backup_webdav_url, backup_webdav_username,
                backup_webdav_password, backup_webdav_path,
                shortcuts, mcp_servers,
                insights_status, insights_proxy_port, insights_retention_days,
                insights_disk_warn_threshold_mb, insights_store_prompt_preview,
                insights_onboarding_shown_at, insights_last_known_port,
                insights_display_currency, insights_currency_rates
            FROM panel_settings WHERE id = 1",
            [],
            |row| {
                let json = serde_json::json!({
                    "version": row.get::<_, i64>(0)?,
                    "config_path": row.get::<_, String>(1)?,
                    "profiles_path": row.get::<_, String>(2)?,
                    "follow_config_profiles": row.get::<_, i64>(3)? != 0,
                    "theme": row.get::<_, String>(4)?,
                    "appearance_theme": row.get::<_, String>(5)?,
                    "ui_font_size": row.get::<_, String>(6)?,
                    "locale": row.get::<_, String>(7)?,
                    "tray_icon": row.get::<_, i64>(8)? != 0,
                    "sidebar_collapsed": row.get::<_, i64>(9)? != 0,
                    "display_open_mode": row.get::<_, String>(10)?,
                    "close_behavior": row.get::<_, String>(11)?,
                    "terminal_app": row.get::<_, String>(12)?,
                    "last_display_id": row.get::<_, Option<i64>>(13)?,
                    "uiState": row.get::<_, Option<String>>(14)?
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                    "favorites": row.get::<_, Option<String>>(15)?
                        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                    "backup_strategy": row.get::<_, String>(16)?,
                    "backup_frequency": row.get::<_, String>(17)?,
                    "backup_retention_count": row.get::<_, i64>(18)?,
                    "backup_destination_type": row.get::<_, String>(19)?,
                    "backup_local_path": row.get::<_, String>(20)?,
                    "backup_webdav_url": row.get::<_, String>(21)?,
                    "backup_webdav_username": row.get::<_, String>(22)?,
                    "backup_webdav_password": row.get::<_, String>(23)?,
                    "backup_webdav_path": row.get::<_, String>(24)?,
                    "shortcuts": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(25)?).unwrap_or(serde_json::json!({})),
                    "mcp_servers": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(26)?).unwrap_or(serde_json::json!({})),
                    "insights_status": row.get::<_, String>(27)?,
                    "insights_proxy_port": row.get::<_, Option<String>>(28)?
                        .and_then(|s| if s == "auto" { Some(serde_json::json!("auto")) } else { s.parse::<i64>().ok().map(|n| serde_json::json!(n)) }),
                    "insights_retention_days": row.get::<_, i64>(29)?,
                    "insights_disk_warn_threshold_mb": row.get::<_, i64>(30)?,
                    "insights_store_prompt_preview": row.get::<_, i64>(31)? != 0,
                    "insights_onboarding_shown_at": row.get::<_, Option<String>>(32)?,
                    "insights_last_known_port": row.get::<_, Option<i64>>(33)?,
                    "insights_display_currency": row.get::<_, String>(34)?,
                    "insights_currency_rates": row.get::<_, Option<String>>(35)?
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
    let guard = state.conn.lock().unwrap();
    let conn = guard.as_ref().ok_or("usage db not open")?;

    let settings: serde_json::Value = serde_json::from_str(&settings_json)
        .map_err(|e| format!("parse settings json: {e}"))?;

    let now = chrono::Utc::now().to_rfc3339();

    // 辅助函数：安全提取
    let get_str = |key: &str| settings[key].as_str().unwrap_or("").to_string();
    let get_bool = |key: &str| if settings[key].as_bool().unwrap_or(false) { 1i64 } else { 0i64 };
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
            config_path, profiles_path, follow_config_profiles,
            theme, appearance_theme, ui_font_size, locale,
            tray_icon, sidebar_collapsed, display_open_mode, close_behavior, terminal_app,
            last_display_id, ui_state, favorites,
            backup_strategy, backup_frequency, backup_retention_count, backup_destination_type,
            backup_local_path, backup_webdav_url, backup_webdav_username,
            backup_webdav_password, backup_webdav_path,
            shortcuts, mcp_servers,
            insights_status, insights_proxy_port, insights_retention_days,
            insights_disk_warn_threshold_mb, insights_store_prompt_preview,
            insights_onboarding_shown_at, insights_last_known_port,
            insights_display_currency, insights_currency_rates,
            updated_at, created_at
        ) VALUES (
            1, ?1,
            ?2, ?3, ?4,
            ?5, ?6, ?7, ?8,
            ?9, ?10, ?11, ?12, ?13,
            ?14, ?15, ?16,
            ?17, ?18, ?19, ?20,
            ?21, ?22, ?23,
            ?24, ?25,
            ?26, ?27,
            ?28, ?29, ?30,
            ?31, ?32,
            ?33, ?34,
            ?35, ?36,
            ?37, ?37
        )
        ON CONFLICT(id) DO UPDATE SET
            version = excluded.version,
            config_path = excluded.config_path,
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
            get_str("config_path"),
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
    get_panel_settings(state)?
        .ok_or_else(|| "panel settings not found".to_string())
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
    if get_panel_settings(state.clone())?.is_some() {
        log::info!("Panel settings already exist in database, skipping TOML migration");
        return Ok(());
    }

    // 读取 TOML
    let toml_content = fs::read_to_string(&resolved_path)
        .map_err(|e| format!("read toml: {e}"))?;

    // 解析 TOML 为 JSON（使用 toml crate）
    let toml_value: toml::Value = toml::from_str(&toml_content)
        .map_err(|e| format!("parse toml: {e}"))?;

    let settings_json = serde_json::to_string(&toml_value)
        .map_err(|e| format!("convert toml to json: {e}"))?;

    // 保存到数据库
    save_panel_settings(settings_json, state)?;

    // 重命名 TOML 文件
    let migrated_path = resolved_path.with_extension("toml.migrated");
    fs::rename(&resolved_path, &migrated_path)
        .map_err(|e| format!("rename toml: {e}"))?;

    log::info!("Migrated panel settings from {} to database", toml_path);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use std::sync::Mutex;

    fn make_test_state() -> crate::usage::UsageState {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(SCHEMA_SQL).unwrap();
        crate::usage::UsageState {
            conn: Mutex::new(Some(conn)),
        }
    }

    // 测试专用：直接操作 state
    fn save_test(settings_json: &str, state: &crate::usage::UsageState) -> Result<(), String> {
        let guard = state.conn.lock().unwrap();
        let conn = guard.as_ref().ok_or("usage db not open")?;

        let settings: serde_json::Value = serde_json::from_str(settings_json)
            .map_err(|e| format!("parse settings json: {e}"))?;

        let now = chrono::Utc::now().to_rfc3339();

        let get_str = |key: &str| settings[key].as_str().unwrap_or("").to_string();
        let get_bool = |key: &str| if settings[key].as_bool().unwrap_or(false) { 1i64 } else { 0i64 };
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
                config_path, profiles_path, follow_config_profiles,
                theme, appearance_theme, ui_font_size, locale,
                tray_icon, sidebar_collapsed, display_open_mode, close_behavior, terminal_app,
                last_display_id, ui_state, favorites,
                backup_strategy, backup_frequency, backup_retention_count, backup_destination_type,
                backup_local_path, backup_webdav_url, backup_webdav_username,
                backup_webdav_password, backup_webdav_path,
                shortcuts, mcp_servers,
                insights_status, insights_proxy_port, insights_retention_days,
                insights_disk_warn_threshold_mb, insights_store_prompt_preview,
                insights_onboarding_shown_at, insights_last_known_port,
                insights_display_currency, insights_currency_rates,
                updated_at, created_at
            ) VALUES (
                1, ?1,
                ?2, ?3, ?4,
                ?5, ?6, ?7, ?8,
                ?9, ?10, ?11, ?12, ?13,
                ?14, ?15, ?16,
                ?17, ?18, ?19, ?20,
                ?21, ?22, ?23,
                ?24, ?25,
                ?26, ?27,
                ?28, ?29, ?30,
                ?31, ?32,
                ?33, ?34,
                ?35, ?36,
                ?37, ?37
            )
            ON CONFLICT(id) DO UPDATE SET
                version = excluded.version,
                config_path = excluded.config_path,
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
                get_str("config_path"),
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
        let guard = state.conn.lock().unwrap();
        let conn = guard.as_ref().ok_or("usage db not open")?;

        let row_json: Option<String> = conn
            .query_row(
                "SELECT
                    version, config_path, profiles_path, follow_config_profiles,
                    theme, appearance_theme, ui_font_size, locale,
                    tray_icon, sidebar_collapsed, display_open_mode, close_behavior, terminal_app,
                    last_display_id, ui_state, favorites,
                    backup_strategy, backup_frequency, backup_retention_count, backup_destination_type,
                    backup_local_path, backup_webdav_url, backup_webdav_username,
                    backup_webdav_password, backup_webdav_path,
                    shortcuts, mcp_servers,
                    insights_status, insights_proxy_port, insights_retention_days,
                    insights_disk_warn_threshold_mb, insights_store_prompt_preview,
                    insights_onboarding_shown_at, insights_last_known_port,
                    insights_display_currency, insights_currency_rates
                FROM panel_settings WHERE id = 1",
                [],
                |row| {
                    let json = serde_json::json!({
                        "version": row.get::<_, i64>(0)?,
                        "config_path": row.get::<_, String>(1)?,
                        "profiles_path": row.get::<_, String>(2)?,
                        "follow_config_profiles": row.get::<_, i64>(3)? != 0,
                        "theme": row.get::<_, String>(4)?,
                        "appearance_theme": row.get::<_, String>(5)?,
                        "ui_font_size": row.get::<_, String>(6)?,
                        "locale": row.get::<_, String>(7)?,
                        "tray_icon": row.get::<_, i64>(8)? != 0,
                        "sidebar_collapsed": row.get::<_, i64>(9)? != 0,
                        "display_open_mode": row.get::<_, String>(10)?,
                        "close_behavior": row.get::<_, String>(11)?,
                        "terminal_app": row.get::<_, String>(12)?,
                        "last_display_id": row.get::<_, Option<i64>>(13)?,
                        "uiState": row.get::<_, Option<String>>(14)?
                            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                        "favorites": row.get::<_, Option<String>>(15)?
                            .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok()),
                        "backup_strategy": row.get::<_, String>(16)?,
                        "backup_frequency": row.get::<_, String>(17)?,
                        "backup_retention_count": row.get::<_, i64>(18)?,
                        "backup_destination_type": row.get::<_, String>(19)?,
                        "backup_local_path": row.get::<_, String>(20)?,
                        "backup_webdav_url": row.get::<_, String>(21)?,
                        "backup_webdav_username": row.get::<_, String>(22)?,
                        "backup_webdav_password": row.get::<_, String>(23)?,
                        "backup_webdav_path": row.get::<_, String>(24)?,
                        "shortcuts": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(25)?).unwrap_or(serde_json::json!({})),
                        "mcp_servers": serde_json::from_str::<serde_json::Value>(&row.get::<_, String>(26)?).unwrap_or(serde_json::json!({})),
                        "insights_status": row.get::<_, String>(27)?,
                        "insights_proxy_port": row.get::<_, Option<String>>(28)?
                            .and_then(|s| if s == "auto" { Some(serde_json::json!("auto")) } else { s.parse::<i64>().ok().map(|n| serde_json::json!(n)) }),
                        "insights_retention_days": row.get::<_, i64>(29)?,
                        "insights_disk_warn_threshold_mb": row.get::<_, i64>(30)?,
                        "insights_store_prompt_preview": row.get::<_, i64>(31)? != 0,
                        "insights_onboarding_shown_at": row.get::<_, Option<String>>(32)?,
                        "insights_last_known_port": row.get::<_, Option<i64>>(33)?,
                        "insights_display_currency": row.get::<_, String>(34)?,
                        "insights_currency_rates": row.get::<_, Option<String>>(35)?
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
        let loaded = get_test(&state)
            .unwrap()
            .expect("settings should exist");

        let loaded_json: serde_json::Value = serde_json::from_str(&loaded).unwrap();
        assert_eq!(loaded_json["theme"], "dark");
        assert_eq!(loaded_json["locale"], "zh-CN");
        assert_eq!(loaded_json["tray_icon"], true);
        assert_eq!(loaded_json["last_display_id"], 123);
    }

    #[test]
    fn export_and_import() {
        let state = make_test_state();
        let test_settings = serde_json::json!({
            "version": 1,
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

        assert_eq!(exported_json["theme"], "light");
        assert_eq!(exported_json["locale"], "en-US");
        assert_eq!(exported_json["insights_display_currency"], "CNY");
    }
}

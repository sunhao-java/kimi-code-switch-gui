#![recursion_limit = "256"]

//! Kimi Code Switch GUI — Tauri 后端入口（薄 Rust 壳）。
//!
//! 架构：业务逻辑（configStore / configSafety / skillsStore 等约 5300 行 TS）
//! 继续跑在前端 renderer，后端只暴露 I/O 和系统集成的原子能力。

mod config_history;
mod env_config_store;
mod fs_access;
mod mcp_servers_store;
mod official_accounts;
mod panel_settings_store;
mod shortcuts;
mod system;
mod tray;
mod usage;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(shortcuts::ShortcutRuntimeState::default())
        .manage(usage::UsageState::default())
        .manage(tray::TrayState::default())
        .invoke_handler(tauri::generate_handler![
            // 文件 I/O
            fs_access::read_text,
            fs_access::write_text,
            fs_access::ensure_dir,
            fs_access::remove_file,
            fs_access::move_file,
            fs_access::copy_dir,
            fs_access::path_exists,
            fs_access::list_dir,
            fs_access::list_dir_typed,
            fs_access::remove_dir,
            fs_access::hostname,
            fs_access::list_subdirs,
            fs_access::ensure_kimi_code_environment_layout,
            fs_access::activate_kimi_code_environment_link,
            // 系统集成
            system::exec_command,
            system::start_kimi_oauth_login,
            system::write_executable,
            system::file_stat,
            system::read_file_slice,
            system::http_request,
            system::run_mcp_stdio_session,
            // 用量洞察 SQLite
            usage::usage_open,
            usage::usage_query,
            usage::usage_exec,
            usage::usage_exec_batch,
            usage::usage_exec_script,
            usage::usage_close,
            usage::migrate_legacy_database,
            // 配置历史
            config_history::init_config_history,
            config_history::capture_snapshot,
            config_history::list_snapshots,
            config_history::get_snapshot_content,
            config_history::restore_snapshot,
            config_history::cleanup_old_snapshots,
            // 面板设置存储
            panel_settings_store::init_panel_settings_store,
            panel_settings_store::get_panel_settings,
            panel_settings_store::save_panel_settings,
            panel_settings_store::export_panel_settings,
            panel_settings_store::import_panel_settings,
            panel_settings_store::migrate_panel_settings_from_toml,
            // MCP 服务器存储
            mcp_servers_store::init_mcp_servers_store,
            mcp_servers_store::migrate_mcp_from_json,
            // 环境级配置存储（Provider / Model）
            env_config_store::init_env_config_store,
            env_config_store::get_env_config,
            env_config_store::save_env_config,
            env_config_store::delete_env_config,
            env_config_store::export_all_env_configs,
            env_config_store::import_all_env_configs,
            env_config_store::migrate_env_config_from_toml,
            // Kimi 官方账号槽位
            official_accounts::init_official_accounts_store,
            official_accounts::list_official_accounts,
            official_accounts::get_official_account_credentials_status,
            official_accounts::create_official_account,
            official_accounts::rename_official_account,
            official_accounts::capture_current_official_account,
            official_accounts::prepare_official_account_login,
            official_accounts::complete_official_account_login,
            official_accounts::activate_official_account,
            official_accounts::delete_official_account,
            // 托盘
            tray::set_tray,
            tray::show_main_window,
            tray::set_dock_icon_visibility,
            // 全局快捷键
            shortcuts::sync_window_toggle_shortcut,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

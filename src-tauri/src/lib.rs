//! Kimi Code Switch GUI — Tauri 后端入口（薄 Rust 壳）。
//!
//! 架构：业务逻辑（configStore / configSafety / skillsStore 等约 5300 行 TS）
//! 继续跑在前端 renderer，后端只暴露 I/O 和系统集成的原子能力。

mod config_history;
mod fs_access;
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
        .manage(usage::UsageState::default())
        .manage(tray::TrayState::default())
        .invoke_handler(tauri::generate_handler![
            // 文件 I/O
            fs_access::read_text,
            fs_access::write_text,
            fs_access::ensure_dir,
            fs_access::remove_file,
            fs_access::path_exists,
            fs_access::list_dir,
            fs_access::list_dir_typed,
            fs_access::remove_dir,
            fs_access::hostname,
            fs_access::list_subdirs,
            // 系统集成
            system::exec_command,
            system::write_executable,
            system::file_stat,
            system::read_file_slice,
            system::http_request,
            // 用量洞察 SQLite
            usage::usage_open,
            usage::usage_query,
            usage::usage_exec,
            usage::usage_exec_batch,
            usage::usage_exec_script,
            usage::usage_close,
            // 配置历史
            config_history::init_config_history,
            config_history::capture_snapshot,
            config_history::list_snapshots,
            config_history::get_snapshot_content,
            config_history::restore_snapshot,
            config_history::cleanup_old_snapshots,
            // 托盘
            tray::set_tray,
            tray::show_main_window,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

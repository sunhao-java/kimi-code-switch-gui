//! Kimi Code Switch GUI — Tauri 后端入口（薄 Rust 壳）。
//!
//! 架构：业务逻辑（configStore / configSafety / skillsStore 等约 5300 行 TS）
//! 继续跑在前端 renderer，后端只暴露 I/O 和系统集成的原子能力。

mod fs_access;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            fs_access::read_text,
            fs_access::write_text,
            fs_access::ensure_dir,
            fs_access::remove_file,
            fs_access::path_exists,
            fs_access::list_dir,
            fs_access::list_dir_typed,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

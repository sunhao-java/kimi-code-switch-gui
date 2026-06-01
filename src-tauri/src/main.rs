// 阻止 Windows release 构建弹出额外的控制台窗口
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    kimi_code_switch_gui_lib::run()
}

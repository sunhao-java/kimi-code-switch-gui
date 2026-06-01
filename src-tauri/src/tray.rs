//! 系统托盘（Tauri v2）。对应 Electron 侧 index.ts 的 Tray + Menu.buildFromTemplate。
//!
//! 动态菜单由前端驱动：前端传菜单结构 JSON，Rust 构建 TrayIcon 菜单；
//! 菜单项点击时 emit `tray://command` 事件（携带 action id）回前端执行。

use std::sync::Mutex;

use serde::Deserialize;
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct TrayState {
    pub icon: Mutex<Option<TrayIcon>>,
}

#[derive(Deserialize)]
pub struct MenuItemSpec {
    /// 点击时回传给前端的 action id（空则为分隔符或不可点）
    pub id: Option<String>,
    pub label: Option<String>,
    #[serde(default)]
    pub separator: bool,
    #[serde(default)]
    pub checked: bool,
    #[serde(default)]
    pub submenu: Vec<MenuItemSpec>,
}

fn build_menu_items<R: tauri::Runtime>(
    app: &AppHandle<R>,
    specs: &[MenuItemSpec],
    builder: MenuBuilder<R, AppHandle<R>>,
) -> tauri::Result<tauri::menu::Menu<R>> {
    let mut builder = builder;
    for spec in specs {
        if spec.separator {
            builder = builder.separator();
            continue;
        }
        let label = spec.label.clone().unwrap_or_default();
        if !spec.submenu.is_empty() {
            let mut sub = SubmenuBuilder::new(app, &label);
            for child in &spec.submenu {
                if child.separator {
                    sub = sub.separator();
                    continue;
                }
                let child_label = child.label.clone().unwrap_or_default();
                let display = if child.checked { format!("✓ {child_label}") } else { child_label };
                let id = child.id.clone().unwrap_or_default();
                let item = MenuItemBuilder::with_id(id, display).build(app)?;
                sub = sub.item(&item);
            }
            builder = builder.item(&sub.build()?);
        } else {
            let id = spec.id.clone().unwrap_or_default();
            let item = MenuItemBuilder::with_id(id, &label).build(app)?;
            builder = builder.item(&item);
        }
    }
    builder.build()
}

/// 创建或更新托盘。enabled=false 时移除托盘。
#[tauri::command]
pub fn set_tray(
    enabled: bool,
    menu: Vec<MenuItemSpec>,
    tooltip: Option<String>,
    app: AppHandle,
    state: tauri::State<TrayState>,
) -> Result<(), String> {
    let mut guard = state.icon.lock().unwrap();

    if !enabled {
        *guard = None; // drop 会移除托盘
        return Ok(());
    }

    let menu_obj = build_menu_items(&app, &menu, MenuBuilder::new(&app)).map_err(|e| e.to_string())?;

    if let Some(tray) = guard.as_ref() {
        tray.set_menu(Some(menu_obj)).map_err(|e| e.to_string())?;
        if let Some(tip) = tooltip {
            tray.set_tooltip(Some(tip)).ok();
        }
        return Ok(());
    }

    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().cloned().ok_or("no default icon")?)
        .tooltip(tooltip.unwrap_or_else(|| "Kimi Code Switch GUI".into()))
        .menu(&menu_obj)
        .on_menu_event(|app, event| {
            let id = event.id().as_ref().to_string();
            if !id.is_empty() {
                app.emit("tray://command", id).ok();
            }
        })
        .build(&app)
        .map_err(|e| e.to_string())?;

    *guard = Some(tray);
    Ok(())
}

/// 显示并聚焦主窗口（托盘"显示窗口"项调用）。
#[tauri::command]
pub fn show_main_window(app: AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("main") {
        win.show().map_err(|e| e.to_string())?;
        win.set_focus().map_err(|e| e.to_string())?;
    }
    Ok(())
}

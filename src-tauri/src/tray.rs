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

#[cfg(test)]
mod tests {
    use super::*;

    // 注：菜单构建（build_menu_items/set_tray）依赖 Tauri runtime 的 AppHandle，
    // 不在单测范围内；这里覆盖前端→Rust 的菜单结构 JSON 解析契约（MenuItemSpec）。

    #[test]
    fn menu_item_spec_parses_minimal_clickable_item() {
        let spec: MenuItemSpec =
            serde_json::from_str(r#"{ "id": "open", "label": "打开" }"#).unwrap();
        assert_eq!(spec.id.as_deref(), Some("open"));
        assert_eq!(spec.label.as_deref(), Some("打开"));
        // 缺省字段：非分隔符、未勾选、无子菜单。
        assert!(!spec.separator);
        assert!(!spec.checked);
        assert!(spec.submenu.is_empty());
    }

    #[test]
    fn menu_item_spec_parses_separator() {
        let spec: MenuItemSpec = serde_json::from_str(r#"{ "separator": true }"#).unwrap();
        assert!(spec.separator);
        assert!(spec.id.is_none());
        assert!(spec.label.is_none());
    }

    #[test]
    fn menu_item_spec_parses_checked_flag() {
        let spec: MenuItemSpec =
            serde_json::from_str(r#"{ "id": "profile-a", "label": "Profile A", "checked": true }"#)
                .unwrap();
        assert!(spec.checked);
        assert_eq!(spec.id.as_deref(), Some("profile-a"));
    }

    #[test]
    fn menu_item_spec_parses_nested_submenu() {
        let json = r#"{
            "label": "Profiles",
            "submenu": [
                { "id": "p1", "label": "One", "checked": true },
                { "separator": true },
                { "id": "p2", "label": "Two" }
            ]
        }"#;
        let spec: MenuItemSpec = serde_json::from_str(json).unwrap();
        assert_eq!(spec.label.as_deref(), Some("Profiles"));
        assert!(spec.id.is_none());
        assert_eq!(spec.submenu.len(), 3);
        assert_eq!(spec.submenu[0].id.as_deref(), Some("p1"));
        assert!(spec.submenu[0].checked);
        assert!(spec.submenu[1].separator);
        assert_eq!(spec.submenu[2].id.as_deref(), Some("p2"));
        assert!(!spec.submenu[2].checked);
    }

    #[test]
    fn menu_spec_parses_full_array() {
        // 顶层是 Vec<MenuItemSpec>，与 set_tray 的 menu 参数同构。
        let json = r#"[
            { "id": "show", "label": "显示窗口" },
            { "separator": true },
            { "id": "quit", "label": "退出" }
        ]"#;
        let menu: Vec<MenuItemSpec> = serde_json::from_str(json).unwrap();
        assert_eq!(menu.len(), 3);
        assert_eq!(menu[0].id.as_deref(), Some("show"));
        assert!(menu[1].separator);
        assert_eq!(menu[2].id.as_deref(), Some("quit"));
    }
}

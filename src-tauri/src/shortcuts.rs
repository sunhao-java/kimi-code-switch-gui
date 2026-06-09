//! 全局快捷键托管。
//!
//! `window.toggle` 这类能力必须在 Rust 主进程侧处理：窗口隐藏后 renderer
//! 的 JS 回调不一定稳定，主进程可以直接 show/hide 主窗口。

use std::sync::Mutex;

use serde::Deserialize;
use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

#[derive(Default)]
pub struct ShortcutRuntimeState {
    inner: Mutex<ShortcutRuntime>,
}

#[derive(Default)]
struct ShortcutRuntime {
    registered_window_toggle: Option<String>,
    close_behavior: CloseBehavior,
    tray_enabled: bool,
    toggling: bool,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, Eq, PartialEq)]
#[serde(rename_all = "kebab-case")]
pub enum CloseBehavior {
    #[default]
    Quit,
    KeepInTray,
}

#[tauri::command]
pub fn sync_window_toggle_shortcut(
    accelerator: Option<String>,
    close_behavior: CloseBehavior,
    tray_enabled: bool,
    app: AppHandle,
    state: tauri::State<ShortcutRuntimeState>,
) -> Result<(), String> {
    let next_accelerator = accelerator
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    {
        let mut runtime = state.inner.lock().unwrap();
        runtime.close_behavior = close_behavior;
        runtime.tray_enabled = tray_enabled;
    }

    let previous_accelerator = {
        let runtime = state.inner.lock().unwrap();
        runtime.registered_window_toggle.clone()
    };

    if previous_accelerator == next_accelerator {
        return Ok(());
    }

    if let Some(previous) = previous_accelerator {
        app.global_shortcut()
            .unregister(previous.as_str())
            .map_err(|err| format!("unregister window.toggle shortcut '{previous}': {err}"))?;
        state.inner.lock().unwrap().registered_window_toggle = None;
    }

    if let Some(next) = next_accelerator {
        app.global_shortcut()
            .on_shortcut(next.as_str(), move |app, _shortcut, event| {
                if event.state != ShortcutState::Pressed {
                    return;
                }
                if let Err(err) = toggle_main_window(app) {
                    eprintln!("[SHORTCUT] window.toggle failed: {err}");
                }
            })
            .map_err(|err| format!("register window.toggle shortcut '{next}': {err}"))?;
        state.inner.lock().unwrap().registered_window_toggle = Some(next);
    }

    Ok(())
}

fn toggle_main_window<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let state = app.state::<ShortcutRuntimeState>();

    {
        let mut runtime = state.inner.lock().unwrap();
        if runtime.toggling {
            return Ok(());
        }
        runtime.toggling = true;
    }

    let result = (|| {
        let Some(window) = app.get_webview_window("main") else {
            return Ok(());
        };
        let is_visible = window.is_visible().map_err(|err| err.to_string())?;
        let (close_behavior, tray_enabled) = {
            let runtime = state.inner.lock().unwrap();
            (runtime.close_behavior, runtime.tray_enabled)
        };

        if is_visible {
            window.hide().map_err(|err| err.to_string())?;
            set_dock_icon_visible(app, !(close_behavior == CloseBehavior::KeepInTray && tray_enabled))?;
            return Ok(());
        }

        if close_behavior == CloseBehavior::KeepInTray && tray_enabled {
            set_dock_icon_visible(app, true)?;
        }
        window.show().map_err(|err| err.to_string())?;
        window.set_focus().map_err(|err| err.to_string())?;
        Ok(())
    })();

    state.inner.lock().unwrap().toggling = false;
    result
}

fn set_dock_icon_visible<R: tauri::Runtime>(app: &AppHandle<R>, visible: bool) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        app.set_activation_policy(if visible {
            tauri::ActivationPolicy::Regular
        } else {
            tauri::ActivationPolicy::Accessory
        })
        .map_err(|err| err.to_string())?;
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (app, visible);
    }
    Ok(())
}

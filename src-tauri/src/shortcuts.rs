//! 全局快捷键托管。
//!
//! `window.toggle` 这类能力必须在 Rust 主进程侧处理：窗口隐藏后 renderer
//! 的 JS 回调不一定稳定，主进程可以直接 show/hide 主窗口。

use std::sync::Mutex;

use tauri::{AppHandle, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// 前端 close_behavior 取值，与 src/shared/types.ts 的 CloseBehavior 对齐。
const CLOSE_BEHAVIOR_KEEP_IN_TRAY: &str = "keep-in-tray";

#[derive(Default)]
pub struct ShortcutRuntimeState {
    inner: Mutex<ShortcutRuntime>,
}

#[derive(Default)]
struct ShortcutRuntime {
    registered_window_toggle: Option<String>,
    close_behavior: String,
    tray_enabled: bool,
    toggling: bool,
}

impl ShortcutRuntime {
    /// 是否应在隐藏窗口时一并隐藏 Dock 图标。
    fn hide_dock_on_close(&self) -> bool {
        self.close_behavior == CLOSE_BEHAVIOR_KEEP_IN_TRAY && self.tray_enabled
    }
}

#[tauri::command]
pub fn sync_window_toggle_shortcut(
    accelerator: Option<String>,
    close_behavior: String,
    tray_enabled: bool,
    app: AppHandle,
    state: tauri::State<ShortcutRuntimeState>,
) -> Result<(), String> {
    let next_accelerator = accelerator
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned);

    let previous_accelerator = {
        let mut runtime = state.inner.lock().expect("shortcut runtime lock poisoned");
        runtime.close_behavior = close_behavior;
        runtime.tray_enabled = tray_enabled;
        runtime.registered_window_toggle.clone()
    };

    if previous_accelerator == next_accelerator {
        return Ok(());
    }

    if let Some(previous) = previous_accelerator {
        app.global_shortcut()
            .unregister(previous.as_str())
            .map_err(|err| format!("unregister window.toggle shortcut '{previous}': {err}"))?;
        state
            .inner
            .lock()
            .expect("shortcut runtime lock poisoned")
            .registered_window_toggle = None;
    }

    if let Some(next) = next_accelerator {
        app.global_shortcut()
            .on_shortcut(next.as_str(), move |app, _shortcut, event| {
                if event.state != ShortcutState::Pressed {
                    return;
                }
                if let Err(err) = toggle_main_window(app) {
                    log::error!("window.toggle shortcut failed: {err}");
                }
            })
            .map_err(|err| format!("register window.toggle shortcut '{next}': {err}"))?;
        state
            .inner
            .lock()
            .expect("shortcut runtime lock poisoned")
            .registered_window_toggle = Some(next);
    }

    Ok(())
}

fn toggle_main_window<R: tauri::Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let state = app.state::<ShortcutRuntimeState>();

    {
        let mut runtime = state.inner.lock().expect("shortcut runtime lock poisoned");
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
        let hide_dock = {
            let runtime = state.inner.lock().expect("shortcut runtime lock poisoned");
            runtime.hide_dock_on_close()
        };

        if is_visible {
            window.hide().map_err(|err| err.to_string())?;
            crate::tray::apply_dock_icon_visibility(app, !hide_dock)?;
            return Ok(());
        }

        if hide_dock {
            crate::tray::apply_dock_icon_visibility(app, true)?;
        }
        window.show().map_err(|err| err.to_string())?;
        window.set_focus().map_err(|err| err.to_string())?;
        Ok(())
    })();

    state.inner.lock().expect("shortcut runtime lock poisoned").toggling = false;
    result
}

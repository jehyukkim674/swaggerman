// OS 전역 단축키 등록/해제. 트리거 시 메인 창을 앞으로 가져오고 프론트에 quick-launch 이벤트를 emit.
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

/// 전역 단축키 등록. 기존 등록은 모두 해제 후 새로 등록한다. 실패 시 Err.
#[tauri::command]
pub fn register_global_shortcut(app: AppHandle, accelerator: String) -> Result<(), String> {
    let gs = app.global_shortcut();
    // 기존 단축키 모두 해제(중복 등록 방지)
    let _ = gs.unregister_all();

    if accelerator.trim().is_empty() {
        return Ok(());
    }

    let app_for_handler = app.clone();
    gs.on_shortcut(accelerator.as_str(), move |_app, _shortcut, event| {
        // 누를 때 1회만(뗄 때 중복 방지)
        if event.state() != ShortcutState::Pressed {
            return;
        }
        // 메인 창("main" 우선, 없으면 첫 창)을 앞으로 + 포커스
        let win = app_for_handler
            .get_webview_window("main")
            .or_else(|| app_for_handler.webview_windows().into_values().next());
        if let Some(w) = win {
            let _ = w.show();
            let _ = w.set_focus();
        }
        let _ = app_for_handler.emit("quick-launch", ());
    })
    .map_err(|e| format!("단축키 등록 실패: {e}"))?;

    Ok(())
}

/// 전역 단축키 모두 해제.
#[tauri::command]
pub fn unregister_global_shortcut(app: AppHandle) -> Result<(), String> {
    app.global_shortcut()
        .unregister_all()
        .map_err(|e| e.to_string())
}

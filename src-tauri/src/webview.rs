//! 关闭浏览器内核的默认行为（specs/014）：发布版关闭默认右键菜单与浏览器快捷键（刷新、打印等），
//! 所有构建关闭网址提示与自动填充，并为本程序页面授予剪贴板读取权限（右键“粘贴”需要，否则内核会弹出
//! “想要查看复制到剪贴板的文本和图像”的询问；用户点“阻止”后该选择会被记住，粘贴就一直失败）。
//! 开发构建保留内核菜单与刷新，便于调试。

use tauri::{Runtime, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::{
    COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ, COREWEBVIEW2_PERMISSION_STATE_ALLOW, ICoreWebView2_13,
    ICoreWebView2Profile4, ICoreWebView2Settings3, ICoreWebView2Settings4,
};
use webview2_com::SetPermissionStateCompletedHandler;
use windows_core::{HSTRING, Interface};

/// 本程序页面的来源（Windows 上 Tauri 的固定地址）
const APP_ORIGIN: &str = "http://tauri.localhost";

pub fn configure<R: Runtime>(win: &WebviewWindow<R>) {
    let release = !cfg!(debug_assertions);
    let _ = win.with_webview(move |wv| {
        // SAFETY: 在 WebView2 所属的 UI 线程中调用（with_webview 保证）；各接口来自同一 controller。
        // 某个接口不受支持时只跳过该项（FR-1401、FR-1407、FR-1408）。
        unsafe {
            let Ok(core) = wv.controller().CoreWebView2() else {
                return;
            };
            // 只授予本程序页面，覆盖之前保存的“阻止”（FR-1402 粘贴）
            if let Ok(profile) = core
                .cast::<ICoreWebView2_13>()
                .and_then(|c| c.Profile()?.cast::<ICoreWebView2Profile4>())
            {
                let done = SetPermissionStateCompletedHandler::create(Box::new(|_| Ok(())));
                let _ = profile.SetPermissionState(
                    COREWEBVIEW2_PERMISSION_KIND_CLIPBOARD_READ,
                    &HSTRING::from(APP_ORIGIN),
                    COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                    &done,
                );
            }
            let Ok(settings) = core.Settings() else {
                return;
            };
            let _ = settings.SetAreDefaultContextMenusEnabled(!release);
            let _ = settings.SetIsStatusBarEnabled(false);
            if let Ok(s3) = settings.cast::<ICoreWebView2Settings3>() {
                let _ = s3.SetAreBrowserAcceleratorKeysEnabled(!release);
            }
            if let Ok(s4) = settings.cast::<ICoreWebView2Settings4>() {
                let _ = s4.SetIsGeneralAutofillEnabled(false);
                let _ = s4.SetIsPasswordAutosaveEnabled(false);
            }
        }
    });
}

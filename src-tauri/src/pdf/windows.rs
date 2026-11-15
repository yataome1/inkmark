//! WebView2 `PrintToPdf`（research.md R3）。

use std::path::Path;
use std::sync::mpsc::Sender;
use tauri::{Runtime, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_7;
use webview2_com::PrintToPdfCompletedHandler;
use windows_core::{HSTRING, Interface};

/// 开始把已加载的页面打印到 `out`；完成后向 `done` 发送是否成功。
pub fn start<R: Runtime>(win: &WebviewWindow<R>, out: &Path, done: Sender<bool>) -> Result<(), String> {
    let out = HSTRING::from(out.as_os_str());
    win.with_webview(move |wv| {
        let tx = done.clone();
        let started = (|| -> windows_core::Result<()> {
            // SAFETY: 在 WebView2 所属的 UI 线程中调用（with_webview 保证），接口均来自同一 controller。
            unsafe {
                let core: ICoreWebView2_7 = wv.controller().CoreWebView2()?.cast()?;
                let handler = PrintToPdfCompletedHandler::create(Box::new(move |res, ok| {
                    let _ = tx.send(res.is_ok() && ok);
                    Ok(())
                }));
                core.PrintToPdf(&out, None, &handler)
            }
        })();
        if started.is_err() {
            let _ = done.send(false);
        }
    })
    .map_err(|e| e.to_string())
}

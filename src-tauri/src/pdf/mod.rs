//! 导出 PDF（FR-014）：隐藏窗口加载导出 HTML，调用 WebView2 `PrintToPdf`（research.md R3）。

use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Runtime, Url, WebviewUrl, WebviewWindowBuilder};
use webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2_7;
use webview2_com::PrintToPdfCompletedHandler;
use windows_core::{HSTRING, Interface};

/// `html_file` 为已写入磁盘的导出 HTML；输出到 `out`。
pub async fn print_to_pdf<R: Runtime>(app: &AppHandle<R>, html_file: &Path, out: &Path) -> Result<(), String> {
    let url = Url::from_file_path(html_file).map_err(|_| "无效的导出路径".to_string())?;
    let (load_tx, load_rx) = mpsc::channel();
    let win = WebviewWindowBuilder::new(app, "pdf-export", WebviewUrl::External(url))
        .visible(false)
        .on_page_load(move |_, p| {
            if matches!(p.event(), PageLoadEvent::Finished) {
                let _ = load_tx.send(());
            }
        })
        .build()
        .map_err(|e| e.to_string())?;

    let result = async {
        wait(load_rx, 20).await.map_err(|_| "加载导出页面超时".to_string())?;
        let (done_tx, done_rx) = mpsc::channel();
        let out = HSTRING::from(out.as_os_str());
        win.with_webview(move |wv| {
            let tx = done_tx.clone();
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
                let _ = done_tx.send(false);
            }
        })
        .map_err(|e| e.to_string())?;
        match wait(done_rx, 60).await {
            Ok(true) => Ok(()),
            _ => Err("生成 PDF 失败".to_string()),
        }
    }
    .await;
    let _ = win.destroy();
    result
}

async fn wait<T: Send + 'static>(rx: mpsc::Receiver<T>, secs: u64) -> Result<T, ()> {
    tauri::async_runtime::spawn_blocking(move || rx.recv_timeout(Duration::from_secs(secs)))
        .await
        .map_err(|_| ())?
        .map_err(|_| ())
}

//! 导出 PDF（FR-014）：隐藏窗口加载导出 HTML，再由平台模块把页面打印到文件（research.md R3；specs/015 plan）。

#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

#[cfg(target_os = "macos")]
use macos::start;
#[cfg(windows)]
use windows::start;

use std::path::Path;
use std::sync::mpsc;
use std::time::Duration;
use tauri::webview::PageLoadEvent;
use tauri::{AppHandle, Runtime, Url, WebviewUrl, WebviewWindowBuilder};

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
        start(&win, out, done_tx)?;
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

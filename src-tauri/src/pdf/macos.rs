//! WKWebView 打印到文件（specs/015 plan 设计要点 5）。

use std::path::Path;
use std::sync::mpsc::Sender;
use tauri::{Runtime, WebviewWindow};

/// TODO(T1503/T1506)：`printOperationWithPrintInfo:` 保存到文件
pub fn start<R: Runtime>(_win: &WebviewWindow<R>, _out: &Path, _done: Sender<bool>) -> Result<(), String> {
    Err("macOS 版尚未支持导出 PDF".into())
}

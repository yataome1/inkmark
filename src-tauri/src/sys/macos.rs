//! macOS 平台实现（specs/015 plan）：调用系统库，不引入依赖。

use objc2::rc::Retained;
use objc2::runtime::{AnyClass, AnyObject, ProtocolObject, Sel};
use objc2::{MainThreadMarker, sel};
use objc2_app_kit::{NSApplication, NSPasteboard, NSPasteboardWriting};
use objc2_foundation::{NSArray, NSString, NSURL};
use serde_json::json;
use std::ffi::{CStr, c_char, c_void};
use std::io;
use std::path::Path;
use std::sync::OnceLock;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};

unsafe extern "C" {
    // libSystem 中的 CommonCrypto
    fn CC_SHA256(data: *const c_void, len: u32, md: *mut u8) -> *mut u8;
    fn sysctlbyname(
        name: *const c_char,
        old: *mut c_void,
        old_len: *mut usize,
        new: *mut c_void,
        new_len: usize,
    ) -> i32;
}

pub fn sha256(bytes: &[u8]) -> io::Result<[u8; 32]> {
    let len = u32::try_from(bytes.len()).map_err(|_| io::Error::other("图片过大"))?;
    let mut out = [0u8; 32];
    // SAFETY: 输入指针与长度一致，输出缓冲区为 SHA-256 的 32 字节
    unsafe { CC_SHA256(bytes.as_ptr().cast(), len, out.as_mut_ptr()) };
    Ok(out)
}

pub fn os_version() -> Option<String> {
    let mut buf = [0u8; 64];
    let mut len = buf.len();
    // SAFETY: 名称以 \0 结尾；缓冲区与长度一致，系统写入以 \0 结尾的字符串
    let rc = unsafe {
        sysctlbyname(
            c"kern.osproductversion".as_ptr(),
            buf.as_mut_ptr().cast(),
            &mut len,
            std::ptr::null_mut(),
            0,
        )
    };
    if rc != 0 {
        return None;
    }
    let version = CStr::from_bytes_until_nul(&buf).ok()?.to_str().ok()?;
    Some(format!("macOS {version}"))
}

/// 复制图片文件：把文件 URL 写入系统剪贴板，可在访达中粘贴（FR-1201，specs/015 US3 场景 4）
pub fn put_files<R: tauri::Runtime>(_window: &tauri::WebviewWindow<R>, paths: &[&Path]) -> Result<(), String> {
    write_files(&NSPasteboard::generalPasteboard(), paths)
}

fn write_files(board: &NSPasteboard, paths: &[&Path]) -> Result<(), String> {
    let urls: Vec<Retained<ProtocolObject<dyn NSPasteboardWriting>>> = paths
        .iter()
        .map(|p| ProtocolObject::from_retained(NSURL::fileURLWithPath(&NSString::from_str(&p.to_string_lossy()))))
        .collect();
    board.clearContents();
    if board.writeObjects(&NSArray::from_retained_slice(&urls)) {
        Ok(())
    } else {
        Err("写入剪贴板失败".into())
    }
}

// ---------------------------------------------------------------- 程序坞“退出”（FR-1508，research.md R8 T1504）

static APP: OnceLock<AppHandle> = OnceLock::new();
/// 主窗口已由“关闭”隐藏（标签都已关闭、无未保存修改）。不能用窗口是否可见判断：
/// ⌘H 隐藏程序、⌘M 最小化后窗口同样不可见，但文档仍开着。
static MAIN_CLOSED: AtomicBool = AtomicBool::new(false);

pub fn set_main_closed(closed: bool) {
    MAIN_CLOSED.store(closed, Ordering::Relaxed);
}

/// NSTerminateCancel = 0，NSTerminateNow = 1
extern "C-unwind" fn should_terminate(_this: &AnyObject, _sel: Sel, _sender: *mut AnyObject) -> usize {
    let Some(win) = APP.get().and_then(|app| app.get_webview_window("main")) else {
        return 1;
    };
    if MAIN_CLOSED.load(Ordering::Relaxed) {
        return 1;
    }
    // 文档仍开着，可能有未保存的修改：取消本次退出，显示窗口，交给前端走与 ⌘Q 相同的确认流程
    let _ = win.show();
    let _ = win.unminimize();
    let _ = win.set_focus();
    let _ = win.emit_to("main", "command", json!({ "cmd": "quit", "arg": null }));
    0
}

/// tao 的应用代理没有实现 `applicationShouldTerminate:`，程序坞“退出”、注销会直接结束进程。
/// 启动时为其补上该方法；已存在时 `class_addMethod` 不覆盖（tao 将来自己实现时以其为准）。
pub fn install_terminate_hook(app: &AppHandle) {
    let _ = APP.set(app.clone());
    let Some(mtm) = MainThreadMarker::new() else {
        return;
    };
    let Some(delegate) = NSApplication::sharedApplication(mtm).delegate() else {
        return;
    };
    let obj: &AnyObject = delegate.as_ref();
    let cls: &AnyClass = obj.class();
    type Handler = extern "C-unwind" fn(&AnyObject, Sel, *mut AnyObject) -> usize;
    // SAFETY: 函数签名与类型编码 `Q@:@`（返回 NSUInteger，参数 self、_cmd、sender）一致
    unsafe {
        objc2::ffi::class_addMethod(
            std::ptr::from_ref(cls).cast_mut(),
            sel!(applicationShouldTerminate:),
            std::mem::transmute::<Handler, objc2::runtime::Imp>(should_terminate),
            c"Q@:@".as_ptr(),
        );
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn write_files_puts_file_urls() {
        let board = NSPasteboard::pasteboardWithUniqueName();
        let a = Path::new("/tmp/inkmark a.png");
        let b = Path::new("/tmp/图片.jpg");
        write_files(&board, &[a, b]).unwrap();
        let items = board.pasteboardItems().unwrap();
        assert_eq!(items.len(), 2);
        let ty = NSString::from_str("public.file-url");
        let first = items.objectAtIndex(0).stringForType(&ty).unwrap().to_string();
        assert_eq!(first, "file:///tmp/inkmark%20a.png");
    }

    #[test]
    fn os_version_is_macos() {
        assert!(os_version().is_some_and(|v| v.starts_with("macOS 1") || v.starts_with("macOS 2")));
    }
}

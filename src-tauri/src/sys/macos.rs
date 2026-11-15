//! macOS 平台实现（specs/015 plan）：调用系统库，不引入依赖。

use std::ffi::{CStr, c_char, c_void};
use std::io;
use std::path::Path;

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

/// TODO(T1505)：NSPasteboard 写入文件 URL
pub fn put_files<R: tauri::Runtime>(_window: &tauri::WebviewWindow<R>, _paths: &[&Path]) -> Result<(), String> {
    Err("macOS 版尚未支持复制图片文件".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn os_version_is_macos() {
        assert!(os_version().is_some_and(|v| v.starts_with("macOS 1") || v.starts_with("macOS 2")));
    }
}

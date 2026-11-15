//! Windows 平台实现（specs/015 plan）：只声明系统函数，不引入依赖。

use std::ffi::c_void;
use std::io;
use std::os::windows::ffi::OsStrExt;
use std::path::Path;
use std::time::Duration;

// ---------------------------------------------------------------- 剪贴板：放入文件（CF_HDROP），与在资源管理器中复制文件相同（specs/012）

const CF_HDROP: u32 = 15;
const GMEM_MOVEABLE: u32 = 0x0002;

#[link(name = "user32")]
unsafe extern "system" {
    fn OpenClipboard(owner: *mut c_void) -> i32;
    fn EmptyClipboard() -> i32;
    fn SetClipboardData(format: u32, memory: *mut c_void) -> *mut c_void;
    fn CloseClipboard() -> i32;
}

#[link(name = "kernel32")]
unsafe extern "system" {
    fn GlobalAlloc(flags: u32, bytes: usize) -> *mut c_void;
    fn GlobalLock(memory: *mut c_void) -> *mut c_void;
    fn GlobalUnlock(memory: *mut c_void) -> i32;
    fn GlobalFree(memory: *mut c_void) -> *mut c_void;
}

/// DROPFILES 结构（pFiles、pt.x、pt.y、fNC、fWide，共 20 字节）+ 每个 UTF-16 路径以 \0 结尾 + 末尾再一个 \0
pub fn drop_files(paths: &[&Path]) -> Vec<u8> {
    let mut out = Vec::new();
    for field in [20i32, 0, 0, 0, 1] {
        out.extend_from_slice(&field.to_le_bytes());
    }
    for p in paths {
        for unit in p.as_os_str().encode_wide().chain(Some(0)) {
            out.extend_from_slice(&unit.to_le_bytes());
        }
    }
    out.extend_from_slice(&[0, 0]);
    out
}

/// 把文件放入剪贴板。以本程序的窗口为所有者：以空句柄打开时，系统会让 SetClipboardData 失败。
pub fn put_files<R: tauri::Runtime>(window: &tauri::WebviewWindow<R>, paths: &[&Path]) -> Result<(), String> {
    let owner: *mut c_void = window.hwnd().map_err(|e| e.to_string())?.0.cast();
    let data = drop_files(paths);
    // 其他程序正占用剪贴板时短暂重试（plan R1）
    let opened = (0..10).any(|i| {
        if i > 0 {
            std::thread::sleep(Duration::from_millis(30));
        }
        // SAFETY: owner 为调用方提供的窗口句柄
        unsafe { OpenClipboard(owner) != 0 }
    });
    if !opened {
        return Err("剪贴板被占用，请重试".into());
    }
    // SAFETY: 剪贴板已打开；内存块大小与写入长度一致，交给剪贴板后由系统释放，失败时自行释放
    let result = unsafe {
        if EmptyClipboard() == 0 {
            Err("无法清空剪贴板".to_string())
        } else {
            let memory = GlobalAlloc(GMEM_MOVEABLE, data.len());
            let target = if memory.is_null() {
                std::ptr::null_mut()
            } else {
                GlobalLock(memory)
            };
            if target.is_null() {
                if !memory.is_null() {
                    GlobalFree(memory);
                }
                Err("内存不足".to_string())
            } else {
                std::ptr::copy_nonoverlapping(data.as_ptr(), target.cast::<u8>(), data.len());
                GlobalUnlock(memory);
                if SetClipboardData(CF_HDROP, memory).is_null() {
                    GlobalFree(memory);
                    Err("无法写入剪贴板".to_string())
                } else {
                    Ok(())
                }
            }
        }
    };
    // SAFETY: 与上面的 OpenClipboard 成对
    unsafe { CloseClipboard() };
    result
}

// ---------------------------------------------------------------- SHA-256

// 由 Windows CNG 计算，不引入依赖（specs/011 plan）
#[link(name = "bcrypt")]
unsafe extern "system" {
    fn BCryptHash(
        algorithm: usize,
        secret: *const u8,
        secret_len: u32,
        input: *const u8,
        input_len: u32,
        output: *mut u8,
        output_len: u32,
    ) -> i32;
}
const BCRYPT_SHA256_ALG_HANDLE: usize = 0x41;

pub fn sha256(bytes: &[u8]) -> io::Result<[u8; 32]> {
    let len = u32::try_from(bytes.len()).map_err(|_| io::Error::other("图片过大"))?;
    let mut out = [0u8; 32];
    // SAFETY: 输入、输出指针与长度一致；SHA-256 伪句柄由系统提供，无需打开或释放
    let status = unsafe {
        BCryptHash(
            BCRYPT_SHA256_ALG_HANDLE,
            std::ptr::null(),
            0,
            bytes.as_ptr(),
            len,
            out.as_mut_ptr(),
            32,
        )
    };
    if status != 0 {
        return Err(io::Error::other(format!("计算哈希失败：{status:#x}")));
    }
    Ok(out)
}

// ---------------------------------------------------------------- 系统版本

#[repr(C)]
struct OsVersionInfo {
    size: u32,
    major: u32,
    minor: u32,
    build: u32,
    platform: u32,
    service_pack: [u16; 128],
}

#[link(name = "ntdll")]
unsafe extern "system" {
    fn RtlGetVersion(info: *mut OsVersionInfo) -> i32;
}

pub fn os_version() -> Option<String> {
    let mut info = OsVersionInfo {
        size: std::mem::size_of::<OsVersionInfo>() as u32,
        major: 0,
        minor: 0,
        build: 0,
        platform: 0,
        service_pack: [0; 128],
    };
    // SAFETY: info 是按 OSVERSIONINFOW 布局初始化的有效结构，size 已设置
    if unsafe { RtlGetVersion(&mut info) } != 0 {
        return None;
    }
    let name = if info.build >= 22000 {
        "11".to_string()
    } else {
        info.major.to_string()
    };
    Some(format!("Windows {name} (内部版本 {})", info.build))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn drop_files_layout() {
        let buf = drop_files(&[Path::new(r"C:\a.gif"), Path::new(r"D:\图.png")]);
        assert_eq!(&buf[..4], &20u32.to_le_bytes(), "pFiles 指向结构之后");
        assert_eq!(&buf[16..20], &1u32.to_le_bytes(), "fWide = 1");
        let units: Vec<u16> = buf[20..].chunks(2).map(|c| u16::from_le_bytes([c[0], c[1]])).collect();
        let text = String::from_utf16(&units).unwrap();
        assert_eq!(text, "C:\\a.gif\0D:\\图.png\0\0");
    }
}

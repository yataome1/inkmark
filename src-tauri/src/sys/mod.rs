//! 平台相关函数（specs/015 plan）：两个平台提供同名、同签名的函数，其余代码不区分平台。
//!
//! - `sha256(bytes) -> io::Result<[u8; 32]>`
//! - `os_version() -> Option<String>`：如“Windows 11 (内部版本 22631)”“macOS 15.8.2”
//! - `put_files(window, paths) -> Result<(), String>`：把文件放入剪贴板
//!
//! 仅 macOS：`install_terminate_hook(app)`，程序坞“退出”先交给前端确认（FR-1508）；
//! `set_main_closed(bool)`，主窗口是否已由“关闭”隐藏；`paste()`，右键菜单“粘贴”

#[cfg(windows)]
mod windows;
#[cfg(windows)]
pub use windows::*;

#[cfg(target_os = "macos")]
mod macos;
#[cfg(target_os = "macos")]
pub use macos::*;

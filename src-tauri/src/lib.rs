//! Inkmark 后端：窗口、单实例、菜单、文件与设置命令（specs/002-tauri-migration/plan.md）。

mod bundled;
mod clipboard;
mod fileops;
mod menu;
mod pdf;
mod settings;

use serde::Serialize;
use serde_json::{Map, Value, json};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, Theme, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_opener::OpenerExt;

const REPO_URL: &str = "https://github.com/yataome1/inkmark";

struct AppState {
    settings: Mutex<settings::Settings>,
    initial_files: Mutex<Vec<String>>,
    /// 当前文件是否已收藏、当前文件能否收藏（已保存），决定“文件”菜单的文字与可用状态
    favorite_menu: Mutex<(bool, bool)>,
    tab_menu: Mutex<menu::TabMenu>,
}

#[derive(Serialize)]
struct Doc {
    path: String,
    content: String,
}

type CmdResult<T> = Result<T, String>;

fn err(e: impl std::fmt::Display) -> String {
    e.to_string()
}

/// 命令行参数中所有存在的 Markdown 文件（FR-001、FR-812）。
fn files_from_args(args: &[String], cwd: &Path) -> Vec<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(|a| cwd.join(a))
        .filter(|p| fileops::is_markdown(p) && p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
        .collect()
}

/// 内置文档的释放位置；随卸载时“删除应用程序数据”一并清除（specs/013 FR-1302）
fn help_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .app_local_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("help")
}

fn refresh_menu(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (recent, theme, restore_tabs) = {
        let s = state.settings.lock().unwrap();
        (s.recent(), s.theme().to_string(), s.restore_tabs())
    };
    let favorite = *state.favorite_menu.lock().unwrap();
    let tab = *state.tab_menu.lock().unwrap();
    let _ = menu::sync(app, &recent, &theme, favorite, tab, restore_tabs);
}

/// 只授权当前文档所在目录给 asset 协议，用于显示相对路径图片（宪章 V）。
fn allow_doc_dir(app: &AppHandle, doc: &Path) {
    if let Some(dir) = doc.parent() {
        let _ = app.asset_protocol_scope().allow_directory(dir, true);
    }
}

/// 内置文档不进入“最近打开”（FR-1305）
fn remember(app: &AppHandle, state: &State<AppState>, p: &Path) {
    if !bundled::contains(&help_dir(app), p) {
        let _ = state.settings.lock().unwrap().add_recent(&p.to_string_lossy());
    }
    allow_doc_dir(app, p);
    refresh_menu(app);
}

fn theme_of(name: &str) -> Option<Theme> {
    match name {
        "light" => Some(Theme::Light),
        "dark" => Some(Theme::Dark),
        _ => None,
    }
}

// ---------------------------------------------------------------- 命令（IPC 契约见 plan.md）

#[tauri::command]
fn app_ready(state: State<AppState>) -> Vec<String> {
    std::mem::take(&mut *state.initial_files.lock().unwrap())
}

#[tauri::command]
fn read_file(app: AppHandle, state: State<AppState>, path: String) -> CmdResult<Doc> {
    let p = PathBuf::from(&path);
    let content = fileops::read_text(&p).map_err(err)?;
    remember(&app, &state, &p);
    Ok(Doc { path, content })
}

#[tauri::command]
fn save_file(app: AppHandle, state: State<AppState>, path: String, content: String) -> CmdResult<String> {
    let p = PathBuf::from(&path);
    fileops::write_atomic(&p, content.as_bytes()).map_err(err)?;
    remember(&app, &state, &p);
    Ok(path)
}

#[tauri::command]
fn path_info(paths: Vec<String>) -> Vec<fileops::PathInfo> {
    fileops::path_info(&paths)
}

#[tauri::command]
fn set_favorite_menu(app: AppHandle, state: State<AppState>, favorited: bool, enabled: bool) {
    let changed = {
        let mut current = state.favorite_menu.lock().unwrap();
        std::mem::replace(&mut *current, (favorited, enabled)) != (favorited, enabled)
    };
    if changed {
        refresh_menu(&app);
    }
}

#[tauri::command]
fn set_tab_menu(app: AppHandle, state: State<AppState>, tab_menu: menu::TabMenu) {
    let changed = std::mem::replace(&mut *state.tab_menu.lock().unwrap(), tab_menu) != tab_menu;
    if changed {
        refresh_menu(&app);
    }
}

/// 释放并读取使用指南（guide）或示例文档（demo）；不加入最近打开（specs/013）
#[tauri::command]
fn open_bundled(app: AppHandle, name: String) -> CmdResult<Doc> {
    let dir = help_dir(&app);
    let (path, content) = bundled::extract(&dir, &name, &app.package_info().version.to_string()).map_err(err)?;
    let _ = app.asset_protocol_scope().allow_directory(&dir, true);
    Ok(Doc {
        path: path.to_string_lossy().into_owned(),
        content,
    })
}

/// 只允许已存在的 Markdown 文件，不能借此打开任意路径（宪章 V）。
#[tauri::command]
fn reveal_path(app: AppHandle, path: String) -> CmdResult<()> {
    let p = Path::new(&path);
    if !(fileops::is_markdown(p) || fileops::is_image(p)) || !p.is_file() {
        return Err("不是 Markdown 或图片文件".into());
    }
    app.opener().reveal_item_in_dir(p).map_err(err)
}

#[derive(Serialize)]
struct AppInfo {
    version: String,
    tauri: &'static str,
    webview2: Option<String>,
    windows: Option<String>,
}

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

fn windows_version() -> Option<String> {
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

#[tauri::command]
fn app_info(app: AppHandle) -> AppInfo {
    AppInfo {
        version: app.package_info().version.to_string(),
        tauri: tauri::VERSION,
        webview2: tauri::webview_version().ok(),
        windows: windows_version(),
    }
}

/// 只能打开固定的项目地址（specs/009 FR-906）。
fn link_url(kind: &str) -> Option<String> {
    let path = match kind {
        "home" => "",
        "changelog" => "/blob/main/CHANGELOG.md",
        "issues" => "/issues/new/choose",
        "releases" => "/releases",
        _ => return None,
    };
    Some(format!("{REPO_URL}{path}"))
}

#[tauri::command]
fn open_link(app: AppHandle, kind: String) -> CmdResult<()> {
    let url = link_url(&kind).ok_or("未知链接")?;
    app.opener().open_url(url, None::<&str>).map_err(err)
}

#[tauri::command]
fn list_dir(dir: String) -> CmdResult<Vec<fileops::Entry>> {
    fileops::list_dir(Path::new(&dir)).map_err(err)
}

// ---------------------------------------------------------------- 图片文件夹（specs/011）

fn default_image_dir(app: &AppHandle) -> PathBuf {
    app.path()
        .local_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir())
        .join("inkmark-images")
}

/// 当前图片文件夹与是否为默认位置
fn image_dir(app: &AppHandle) -> (PathBuf, bool) {
    let custom = app.state::<AppState>().settings.lock().unwrap().image_folder();
    match custom {
        Some(p) => (PathBuf::from(p), false),
        None => (default_image_dir(app), true),
    }
}

/// 保存图片前取得可用的文件夹：默认位置自动创建，用户设置的位置必须已存在
fn usable_image_dir(app: &AppHandle) -> CmdResult<PathBuf> {
    let (dir, default) = image_dir(app);
    if default {
        std::fs::create_dir_all(&dir).map_err(err)?;
    } else if !dir.is_dir() {
        return Err(format!("图片文件夹不可用：{}", dir.display()));
    }
    Ok(dir)
}

fn store_image(app: &AppHandle, name: &str, bytes: &[u8]) -> CmdResult<String> {
    let full = fileops::save_image(&usable_image_dir(app)?, name, bytes).map_err(err)?;
    let _ = app.asset_protocol_scope().allow_file(&full);
    Ok(fileops::file_url(&full))
}

#[tauri::command]
fn save_image(app: AppHandle, name: String, bytes: Vec<u8>) -> CmdResult<String> {
    store_image(&app, &name, &bytes)
}

#[tauri::command]
fn save_image_from_path(app: AppHandle, src_path: String) -> CmdResult<String> {
    let src = Path::new(&src_path);
    if !fileops::is_image(src) {
        return Err("不是图片文件".into());
    }
    let name = src
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    store_image(&app, &name, &std::fs::read(src).map_err(err)?)
}

/// 文档中的本地图片：解析（含自动查找）后授权，返回实际路径。只接受图片扩展名。
#[tauri::command]
fn allow_image(app: AppHandle, path: String) -> CmdResult<String> {
    let found = fileops::resolve_image(Path::new(&path), &image_dir(&app).0).ok_or("找不到图片")?;
    app.asset_protocol_scope().allow_file(&found).map_err(err)?;
    Ok(found.to_string_lossy().into_owned())
}

/// 只解析不授权：导出 HTML、PDF 时改写图片地址
#[tauri::command]
fn resolve_image(app: AppHandle, path: String) -> Option<String> {
    fileops::resolve_image(Path::new(&path), &image_dir(&app).0).map(|p| p.to_string_lossy().into_owned())
}

// ---------------------------------------------------------------- 图片右键菜单（specs/012）

/// 解析为实际存在的图片文件（含 011 的自动查找），否则报错（FR-1203）
fn found_image(app: &AppHandle, path: &str) -> CmdResult<PathBuf> {
    fileops::resolve_image(Path::new(path), &image_dir(app).0).ok_or_else(|| "找不到图片".to_string())
}

/// 读取图片原始字节，前端转为 PNG 写入剪贴板
#[tauri::command]
fn read_image(app: AppHandle, path: String) -> CmdResult<tauri::ipc::Response> {
    let bytes = std::fs::read(found_image(&app, &path)?).map_err(err)?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// 把图片文件本身放入剪贴板（复制图片文件）
#[tauri::command]
fn copy_image_file(app: AppHandle, window: tauri::WebviewWindow, path: String) -> CmdResult<()> {
    let file = found_image(&app, &path)?;
    let owner = window.hwnd().map_err(err)?;
    clipboard::put_files(owner.0.cast(), &[&file])
}

/// 图片另存为：只写入图片扩展名的目标；与原图相同时不操作
#[tauri::command]
fn save_image_as(app: AppHandle, src: String, dest: String) -> CmdResult<()> {
    let from = found_image(&app, &src)?;
    let to = PathBuf::from(dest);
    if !fileops::is_image(&to) {
        return Err("目标不是图片文件".into());
    }
    if to.exists() && std::fs::canonicalize(&from).ok() == std::fs::canonicalize(&to).ok() {
        return Ok(());
    }
    std::fs::copy(&from, &to).map(|_| ()).map_err(err)
}

#[tauri::command]
fn open_image(app: AppHandle, path: String) -> CmdResult<()> {
    let file = found_image(&app, &path)?;
    app.opener()
        .open_path(file.to_string_lossy(), None::<&str>)
        .map_err(err)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImageFolderInfo {
    path: String,
    is_default: bool,
    exists: bool,
    count: usize,
}

#[tauri::command]
fn image_folder(app: AppHandle) -> ImageFolderInfo {
    let (dir, is_default) = image_dir(&app);
    ImageFolderInfo {
        path: dir.to_string_lossy().into_owned(),
        is_default,
        exists: dir.is_dir(),
        count: fileops::count_images(&dir),
    }
}

/// 更改图片文件夹；path 为 None 时恢复默认。可选复制已有图片，原文件不删（FR-1105）
#[tauri::command]
fn set_image_folder(app: AppHandle, path: Option<String>, copy: bool) -> CmdResult<(usize, usize)> {
    let (old, _) = image_dir(&app);
    let target = path.clone().map_or_else(|| default_image_dir(&app), PathBuf::from);
    std::fs::create_dir_all(&target).map_err(err)?;
    let probe = target.join(format!(".inkmark-write-test-{}", std::process::id()));
    std::fs::write(&probe, b"").map_err(|e| format!("无法写入该文件夹：{e}"))?;
    let _ = std::fs::remove_file(&probe);
    let counts = if copy && old != target {
        fileops::copy_images(&old, &target).map_err(err)?
    } else {
        (0, 0)
    };
    let mut patch = Map::new();
    patch.insert("imageFolder".into(), json!(path));
    app.state::<AppState>()
        .settings
        .lock()
        .unwrap()
        .update(patch)
        .map_err(err)?;
    let _ = app.asset_protocol_scope().allow_directory(&target, false);
    Ok(counts)
}

#[tauri::command]
fn open_image_folder(app: AppHandle) -> CmdResult<()> {
    let dir = usable_image_dir(&app)?;
    app.opener().open_path(dir.to_string_lossy(), None::<&str>).map_err(err)
}

/// 导出可分享副本：把图片复制到 <文件名>.assets，返回每项的相对地址；找不到的为 None（FR-1106）
#[tauri::command]
fn copy_share_images(app: AppHandle, target: String, paths: Vec<String>) -> CmdResult<Vec<Option<String>>> {
    let target = Path::new(&target);
    let stem = target
        .file_stem()
        .map(|s| s.to_string_lossy().into_owned())
        .unwrap_or_default();
    let folder = format!("{stem}.assets");
    let dir = target.parent().ok_or("无效的路径")?.join(&folder);
    let lib = image_dir(&app).0;
    let mut used = std::collections::HashMap::new();
    let mut created = false;
    let mut out = Vec::with_capacity(paths.len());
    for p in paths {
        let Some(src) = fileops::resolve_image(Path::new(&p), &lib) else {
            out.push(None);
            continue;
        };
        if !created {
            std::fs::create_dir_all(&dir).map_err(err)?;
            created = true;
        }
        let name = fileops::copy_into(&src, &dir, &mut used).map_err(err)?;
        out.push(Some(format!(
            "{}/{}",
            fileops::encode_segment(&folder),
            fileops::encode_segment(&name)
        )));
    }
    Ok(out)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportResult {
    /// same：已在图片文件夹；imported：已收入；exists：同内容已存在；missing：找不到
    status: &'static str,
    url: Option<String>,
}

/// 收入图片文件夹：按内容哈希复制，返回新地址（FR-1110）
#[tauri::command]
fn import_images(app: AppHandle, paths: Vec<String>) -> CmdResult<Vec<ImportResult>> {
    let lib = usable_image_dir(&app)?;
    let mut out = Vec::with_capacity(paths.len());
    for p in paths {
        let Some(src) = fileops::resolve_image(Path::new(&p), &lib) else {
            out.push(ImportResult {
                status: "missing",
                url: None,
            });
            continue;
        };
        if src.parent() == Some(lib.as_path()) {
            out.push(ImportResult {
                status: "same",
                url: None,
            });
            continue;
        }
        let bytes = std::fs::read(&src).map_err(err)?;
        let name = fileops::hash_name(
            &bytes,
            &src.extension().map(|e| e.to_string_lossy()).unwrap_or_default(),
        )
        .map_err(err)?;
        let existed = lib.join(&name).exists();
        let full = fileops::save_image(&lib, &src.to_string_lossy(), &bytes).map_err(err)?;
        let _ = app.asset_protocol_scope().allow_file(&full);
        out.push(ImportResult {
            status: if existed { "exists" } else { "imported" },
            url: Some(fileops::file_url(&full)),
        });
    }
    Ok(out)
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Value {
    state.settings.lock().unwrap().value().clone()
}

#[tauri::command]
fn set_settings(app: AppHandle, state: State<AppState>, patch: Map<String, Value>) -> CmdResult<Value> {
    let refresh = ["theme", "recent", "restoreTabs"]
        .iter()
        .any(|k| patch.contains_key(*k));
    let value = {
        let mut s = state.settings.lock().unwrap();
        s.update(patch).map_err(err)?;
        s.value().clone()
    };
    if refresh {
        refresh_menu(&app);
    }
    Ok(value)
}

#[tauri::command]
fn export_html(path: String, html: String) -> CmdResult<()> {
    fileops::write_atomic(Path::new(&path), html.as_bytes()).map_err(err)
}

#[tauri::command]
async fn export_pdf(app: AppHandle, html: String, out: String) -> CmdResult<()> {
    let tmp = std::env::temp_dir().join(format!("inkmark-export-{}.html", std::process::id()));
    std::fs::write(&tmp, html).map_err(err)?;
    let result = pdf::print_to_pdf(&app, &tmp, Path::new(&out)).await;
    let _ = std::fs::remove_file(&tmp);
    result
}

// ---------------------------------------------------------------- 启动

fn on_menu(app: &AppHandle, id: &str) {
    if let Some(kind) = id.strip_prefix("link:") {
        if let Some(url) = link_url(kind) {
            let _ = app.opener().open_url(url, None::<&str>);
        }
        return;
    }
    let (cmd, arg) = id.split_once(':').map_or((id, None), |(c, a)| (c, Some(a)));
    let _ = app.emit_to("main", "command", json!({ "cmd": cmd, "arg": arg }));
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
            // FR-002：第二次启动时把文件交给已运行实例
            if let Some(win) = app.get_webview_window("main") {
                let _ = win.unminimize();
                let _ = win.set_focus();
            }
            let files = files_from_args(&argv, Path::new(&cwd));
            if !files.is_empty() {
                let _ = app.emit_to("main", "open-file", files);
            }
        }))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            app_ready,
            read_file,
            save_file,
            list_dir,
            path_info,
            set_favorite_menu,
            set_tab_menu,
            open_bundled,
            reveal_path,
            app_info,
            open_link,
            save_image,
            save_image_from_path,
            allow_image,
            resolve_image,
            image_folder,
            set_image_folder,
            open_image_folder,
            copy_share_images,
            import_images,
            read_image,
            copy_image_file,
            save_image_as,
            open_image,
            get_settings,
            set_settings,
            export_html,
            export_pdf,
        ])
        .on_menu_event(|app, e| on_menu(app, e.id().as_ref()))
        .setup(|app| {
            let config_dir = app.path().config_dir()?;
            let settings = settings::Settings::load(config_dir.join("Inkmark").join("settings.json"));
            let theme = theme_of(settings.theme());
            let args: Vec<String> = std::env::args().collect();
            let cwd = std::env::current_dir().unwrap_or_default();
            app.manage(AppState {
                settings: Mutex::new(settings),
                initial_files: Mutex::new(files_from_args(&args, &cwd)),
                favorite_menu: Mutex::new((false, false)),
                tab_menu: Mutex::new(menu::TabMenu::default()),
            });

            let handle = app.handle().clone();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::App("index.html".into()))
                .title("Inkmark")
                .inner_size(1200.0, 800.0)
                .min_inner_size(600.0, 400.0)
                .theme(theme)
                // 宪章 V：窗口不可被导航离开应用页面；http(s) 链接交给系统浏览器
                .on_navigation(move |url| {
                    let internal = url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost");
                    if !internal && matches!(url.scheme(), "http" | "https") {
                        let _ = handle.opener().open_url(url.as_str(), None::<&str>);
                    }
                    internal
                })
                .build()?;
            app.set_menu(menu::build(app.handle())?)?;
            let (images, _) = image_dir(app.handle());
            if images.is_dir() {
                let _ = app.asset_protocol_scope().allow_directory(&images, false);
            }
            refresh_menu(app.handle());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Inkmark");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn link_url_only_accepts_known_kinds() {
        assert_eq!(link_url("releases"), Some(format!("{REPO_URL}/releases")));
        assert_eq!(link_url("https://example.com"), None);
    }

    #[test]
    fn files_from_args_keeps_existing_markdown() {
        let dir = std::env::temp_dir().join(format!("inkmark-args-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.md"), "").unwrap();
        std::fs::write(dir.join("b.md"), "").unwrap();
        let args: Vec<String> = ["inkmark.exe", "--flag", "missing.md", "a.md", "b.md"]
            .map(String::from)
            .into();
        let expected = ["a.md", "b.md"].map(|f| dir.join(f).to_string_lossy().into_owned());
        assert_eq!(files_from_args(&args, &dir), expected);
        assert!(files_from_args(&args[..3], &dir).is_empty());
    }
}

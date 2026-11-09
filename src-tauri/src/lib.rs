//! Inkmark 后端：窗口、单实例、菜单、文件与设置命令（specs/002-tauri-migration/plan.md）。

mod fileops;
mod menu;
mod pdf;
mod settings;

use serde::Serialize;
use serde_json::{Map, Value, json};
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager, State, Theme, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_opener::OpenerExt;

const REPO_URL: &str = "https://github.com/yataome1/inkmark";

struct AppState {
    settings: Mutex<settings::Settings>,
    initial_file: Mutex<Option<String>>,
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

/// 命令行参数中第一个存在的 Markdown 文件（FR-001）。
fn file_from_args(args: &[String], cwd: &Path) -> Option<String> {
    args.iter()
        .skip(1)
        .filter(|a| !a.starts_with('-'))
        .map(|a| cwd.join(a))
        .find(|p| fileops::is_markdown(p) && p.is_file())
        .map(|p| p.to_string_lossy().into_owned())
}

fn sample_path(app: &AppHandle) -> String {
    app.path()
        .resource_dir()
        .map(|d| d.join("samples").join("demo.md").to_string_lossy().into_owned())
        .unwrap_or_default()
}

fn refresh_menu(app: &AppHandle) {
    let state = app.state::<AppState>();
    let (recent, theme) = {
        let s = state.settings.lock().unwrap();
        (s.recent(), s.theme().to_string())
    };
    let favorite = *state.favorite_menu.lock().unwrap();
    let tab = *state.tab_menu.lock().unwrap();
    if let Ok(m) = menu::build(app, &recent, &theme, &sample_path(app), favorite, tab) {
        let _ = app.set_menu(m);
    }
}

/// 只授权当前文档所在目录给 asset 协议，用于显示相对路径图片（宪章 V）。
fn allow_doc_dir(app: &AppHandle, doc: &Path) {
    if let Some(dir) = doc.parent() {
        let _ = app.asset_protocol_scope().allow_directory(dir, true);
    }
}

fn remember(app: &AppHandle, state: &State<AppState>, p: &Path) {
    let _ = state.settings.lock().unwrap().add_recent(&p.to_string_lossy());
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
fn app_ready(state: State<AppState>) -> Option<String> {
    state.initial_file.lock().unwrap().take()
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

#[tauri::command]
fn sample_doc(app: AppHandle) -> String {
    sample_path(&app)
}

/// 只允许已存在的 Markdown 文件，不能借此打开任意路径（宪章 V）。
#[tauri::command]
fn reveal_path(app: AppHandle, path: String) -> CmdResult<()> {
    let p = Path::new(&path);
    if !fileops::is_markdown(p) || !p.is_file() {
        return Err("不是 Markdown 文件".into());
    }
    app.opener().reveal_item_in_dir(p).map_err(err)
}

#[tauri::command]
fn list_dir(dir: String) -> CmdResult<Vec<fileops::Entry>> {
    fileops::list_dir(Path::new(&dir)).map_err(err)
}

fn store_image(app: &AppHandle, doc_path: Option<String>, name: &str, bytes: &[u8]) -> CmdResult<String> {
    let doc = doc_path.map(PathBuf::from);
    let (src, full) = fileops::save_image(doc.as_deref(), name, bytes, &std::env::temp_dir()).map_err(err)?;
    let _ = app.asset_protocol_scope().allow_file(&full);
    Ok(src)
}

#[tauri::command]
fn save_image(app: AppHandle, doc_path: Option<String>, name: String, bytes: Vec<u8>) -> CmdResult<String> {
    store_image(&app, doc_path, &name, &bytes)
}

#[tauri::command]
fn save_image_from_path(app: AppHandle, doc_path: Option<String>, src_path: String) -> CmdResult<String> {
    let src = Path::new(&src_path);
    if !fileops::is_image(src) {
        return Err("不是图片文件".into());
    }
    let name = src
        .file_name()
        .map(|n| n.to_string_lossy().into_owned())
        .unwrap_or_default();
    store_image(&app, doc_path, &name, &std::fs::read(src).map_err(err)?)
}

/// 文档中以绝对路径引用的本地图片：只允许图片扩展名。
#[tauri::command]
fn allow_image(app: AppHandle, path: String) -> CmdResult<()> {
    let p = Path::new(&path);
    if !fileops::is_image(p) {
        return Err("不是图片文件".into());
    }
    app.asset_protocol_scope().allow_file(p).map_err(err)
}

#[tauri::command]
fn get_settings(state: State<AppState>) -> Value {
    state.settings.lock().unwrap().value().clone()
}

#[tauri::command]
fn set_settings(app: AppHandle, state: State<AppState>, patch: Map<String, Value>) -> CmdResult<Value> {
    let refresh = patch.contains_key("theme") || patch.contains_key("recent");
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
    match id {
        menu::ABOUT => {
            app.dialog()
                .message(format!(
                    "受 Typora 启发的本地 Markdown 查看与编辑器。\nTauri {} · CodeMirror\n{REPO_URL}",
                    tauri::VERSION
                ))
                .title(format!("关于 Inkmark {}", app.package_info().version))
                .show(|_| {});
        }
        menu::HOMEPAGE => {
            let _ = app.opener().open_url(REPO_URL, None::<&str>);
        }
        _ => {
            let (cmd, arg) = id.split_once(':').map_or((id, None), |(c, a)| (c, Some(a)));
            let _ = app.emit_to("main", "command", json!({ "cmd": cmd, "arg": arg }));
        }
    }
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
            if let Some(f) = file_from_args(&argv, Path::new(&cwd)) {
                let _ = app.emit_to("main", "open-file", f);
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
            sample_doc,
            reveal_path,
            save_image,
            save_image_from_path,
            allow_image,
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
                initial_file: Mutex::new(file_from_args(&args, &cwd)),
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
    fn file_from_args_picks_existing_markdown() {
        let dir = std::env::temp_dir().join(format!("inkmark-args-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        std::fs::write(dir.join("a.md"), "").unwrap();
        let args: Vec<String> = ["inkmark.exe", "--flag", "missing.md", "a.md"].map(String::from).into();
        assert_eq!(
            file_from_args(&args, &dir),
            Some(dir.join("a.md").to_string_lossy().into_owned())
        );
        assert_eq!(file_from_args(&args[..3], &dir), None);
    }
}

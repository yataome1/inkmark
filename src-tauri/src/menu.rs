//! 中文应用菜单（FR-012、FR-015、FR-017）。
//!
//! 快捷键按“逻辑快捷键”书写（`Mod` 为 Windows 的 Ctrl / macOS 的 ⌘，见 `src/platform-keys.js`），
//! 按键统一由前端 `app.js` 的 KEYMAP 处理：
//! - Windows：WebView2 拥有焦点时注册的菜单快捷键不会触发（research.md R2），只以 `文字\t快捷键` 显示。
//! - macOS：设为真实快捷键，系统菜单栏才显示 ⌘ 符号；网页 preventDefault 的按键不会再触发菜单
//!   （specs/015 research.md R8），网页未处理的按键落到菜单，与点击菜单效果相同。
//!
//! 菜单 id 形如 `命令` 或 `命令:参数`，由 lib.rs 转为前端的 `command` 事件。
//!
//! 菜单栏只在启动时创建一次：替换菜单栏会让 Windows 先移除再加回菜单，窗口内容区随之跳动，
//! 之后的变化都由 `sync` 原地更新。

use serde::Deserialize;
use tauri::menu::{
    CheckMenuItemBuilder, Menu, MenuBuilder, MenuItem, MenuItemBuilder, MenuItemKind, PredefinedMenuItem, Submenu,
    SubmenuBuilder,
};
use tauri::{AppHandle, Runtime};

/// 随标签状态变化的菜单启用状态（specs/008 FR-823）。
#[derive(Clone, Copy, Default, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TabMenu {
    has_doc: bool,
    any_dirty: bool,
    can_close_others: bool,
    can_reopen: bool,
}

/// macOS 例外表，与 `src/platform-keys.js` 的 MAC 相同（test/shortcuts.test.js 检查）；键为规范写法
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
const MAC_KEYS: &[(&str, &str)] = &[
    ("Mod+H", "Alt+Mod+F"),
    ("Mod+Y", "Shift+Mod+Z"),
    ("Shift+Mod+1", "Ctrl+Mod+1"),
    ("Shift+Mod+2", "Ctrl+Mod+2"),
    ("Shift+Mod+3", "Ctrl+Mod+3"),
    ("Shift+Mod+Q", "Alt+Mod+Q"),
    ("Shift+Mod+`", "Ctrl+`"),
    ("Alt+Shift+5", "Ctrl+Shift+`"),
    ("F1", "Shift+Mod+/"),
    ("F11", "Ctrl+Mod+F"),
    ("Alt+1", "Ctrl+1"),
    ("Alt+2", "Ctrl+2"),
    ("Alt+3", "Ctrl+3"),
    ("Alt+4", "Ctrl+4"),
    ("Alt+5", "Ctrl+5"),
    ("Alt+6", "Ctrl+6"),
    ("Alt+7", "Ctrl+7"),
    ("Alt+8", "Ctrl+8"),
    ("Alt+9", "Ctrl+9"),
];

/// 修饰键按 Ctrl、Alt、Shift、Mod 排序
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn canonical(combo: &str) -> String {
    let mut parts: Vec<&str> = combo.split('+').collect();
    let key = parts.pop().unwrap_or_default();
    let mut out: Vec<&str> = ["Ctrl", "Alt", "Shift", "Mod"]
        .into_iter()
        .filter(|m| parts.contains(m))
        .collect();
    out.push(key);
    out.join("+")
}

/// macOS 菜单快捷键：先按例外表替换，再把 Mod 写成 Cmd（muda 的写法）
#[cfg_attr(not(target_os = "macos"), allow(dead_code))]
fn mac_accelerator(shortcut: &str) -> String {
    let c = canonical(shortcut);
    let mapped = MAC_KEYS.iter().find(|(k, _)| *k == c).map_or(c.as_str(), |(_, v)| v);
    mapped
        .split('+')
        .map(|p| if p == "Mod" { "Cmd" } else { p })
        .collect::<Vec<_>>()
        .join("+")
}

fn item<R: Runtime>(app: &AppHandle<R>, id: &str, label: &str, shortcut: &str) -> tauri::Result<MenuItem<R>> {
    if shortcut.is_empty() {
        return MenuItemBuilder::with_id(id, label).build(app);
    }
    #[cfg(target_os = "macos")]
    return MenuItemBuilder::with_id(id, label)
        .accelerator(mac_accelerator(shortcut))
        .build(app);
    #[cfg(not(target_os = "macos"))]
    MenuItemBuilder::with_id(id, format!("{label}\t{}", shortcut.replace("Mod", "Ctrl"))).build(app)
}

/// 菜单标题：访问键 `(&F)` 只在 Windows 上加
fn title(text: &str, key: char) -> String {
    if cfg!(windows) {
        format!("{text}(&{key})")
    } else {
        text.to_string()
    }
}

fn fill_recent<R: Runtime>(app: &AppHandle<R>, menu: &Submenu<R>, recent: &[String]) -> tauri::Result<()> {
    if recent.is_empty() {
        return menu.append(&MenuItemBuilder::new("（无）").enabled(false).build(app)?);
    }
    for p in recent {
        menu.append(&item(app, &format!("open-path:{p}"), p, "")?)?;
    }
    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&item(app, "clear-recent", "清除最近打开", "")?)
}

/// 最近文件没有变化时不动子菜单。
fn sync_recent<R: Runtime>(app: &AppHandle<R>, menu: &Submenu<R>, recent: &[String]) -> tauri::Result<()> {
    let current: Vec<String> = menu
        .items()?
        .iter()
        .filter_map(|k| k.id().as_ref().strip_prefix("open-path:").map(String::from))
        .collect();
    if current == recent {
        return Ok(());
    }
    while !menu.items()?.is_empty() {
        menu.remove_at(0)?;
    }
    fill_recent(app, menu, recent)
}

fn flatten<R: Runtime>(items: Vec<MenuItemKind<R>>, out: &mut Vec<MenuItemKind<R>>) -> tauri::Result<()> {
    for kind in items {
        if let MenuItemKind::Submenu(s) = &kind {
            flatten(s.items()?, out)?;
        }
        out.push(kind);
    }
    Ok(())
}

/// 原地更新最近文件、收藏文字，以及各项的启用和勾选状态；状态未变的项不动。
pub fn sync<R: Runtime>(
    app: &AppHandle<R>,
    recent: &[String],
    theme: &str,
    (favorited, can_favorite): (bool, bool),
    tab: TabMenu,
    restore_tabs: bool,
) -> tauri::Result<()> {
    let Some(menu) = app.menu() else {
        return Ok(());
    };
    let enabled = |id: &str| match id {
        "save" | "save-as" | "import-images" | "close-tab" | "close-all" | "find" | "replace" | "source-mode"
        | "menu-export" | "menu-paragraph" | "menu-format" => Some(tab.has_doc),
        "save-all" => Some(tab.any_dirty),
        "close-others" | "menu-tabs" => Some(tab.can_close_others),
        "reopen-tab" => Some(tab.can_reopen),
        "toggle-favorite-current" => Some(can_favorite),
        _ => None,
    };
    let mut all = Vec::new();
    flatten(menu.items()?, &mut all)?;
    for kind in &all {
        let id: &str = kind.id().as_ref();
        match kind {
            MenuItemKind::MenuItem(m) => {
                if let Some(on) = enabled(id).filter(|on| m.is_enabled().is_ok_and(|now| now != *on)) {
                    m.set_enabled(on)?;
                }
                if id == "toggle-favorite-current" {
                    let label = if favorited {
                        "取消收藏当前文件"
                    } else {
                        "收藏当前文件"
                    };
                    if m.text()? != label {
                        m.set_text(label)?;
                    }
                }
            }
            MenuItemKind::Submenu(m) => {
                if let Some(on) = enabled(id).filter(|on| m.is_enabled().is_ok_and(|now| now != *on)) {
                    m.set_enabled(on)?;
                }
                if id == "menu-recent" {
                    sync_recent(app, m, recent)?;
                }
            }
            MenuItemKind::Check(m) => {
                let checked = if id == "toggle-restore-tabs" {
                    restore_tabs
                } else {
                    id.strip_prefix("theme:") == Some(theme)
                };
                if m.is_checked()? != checked {
                    m.set_checked(checked)?;
                }
            }
            _ => {}
        }
    }
    Ok(())
}

/// 启动时创建一次；状态由随后的 `sync` 填入。
pub fn build<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<Menu<R>> {
    let i = |id: &str, label: &str, shortcut: &str| item(app, id, label, shortcut);
    let sep = || PredefinedMenuItem::separator(app);

    let recent_menu = SubmenuBuilder::with_id(app, "menu-recent", "最近打开").build()?;
    fill_recent(app, &recent_menu, &[])?;

    let file = SubmenuBuilder::new(app, title("文件", 'F'))
        .item(&i("new", "新建", "Mod+N")?)
        .item(&i("open", "打开…", "Mod+O")?)
        .item(&i("open-folder", "打开文件夹…", "Mod+Shift+O")?)
        .item(&recent_menu)
        .item(&MenuItemBuilder::with_id("toggle-favorite-current", "收藏当前文件").build(app)?)
        .item(&sep()?)
        .item(&i("image-folder", "图片文件夹…", "")?)
        .item(&i("import-images", "收入图片文件夹", "")?)
        .item(&sep()?)
        .item(&i("save", "保存", "Mod+S")?)
        .item(&i("save-as", "另存为…", "Mod+Shift+S")?)
        .item(&i("save-all", "全部保存", "Mod+Alt+S")?)
        .item(&sep()?)
        .item(&i("close-tab", "关闭标签", "Mod+W")?)
        .item(&i("close-others", "关闭其他标签", "")?)
        .item(&i("close-all", "关闭全部标签", "")?)
        .item(&i("reopen-tab", "重新打开关闭的标签", "Mod+Shift+T")?)
        .item(&CheckMenuItemBuilder::with_id("toggle-restore-tabs", "启动时恢复上次的标签").build(app)?)
        .item(&sep()?)
        .item(
            &SubmenuBuilder::with_id(app, "menu-export", "导出")
                .item(&i("export-html", "HTML…", "")?)
                .item(&i("export-pdf", "PDF…", "")?)
                .item(&i("export-share", "可分享副本…", "")?)
                .build()?,
        )
        .build()?;
    // macOS 的“退出”在应用菜单中（FR-1505）
    #[cfg(not(target_os = "macos"))]
    {
        file.append(&sep()?)?;
        file.append(&i("quit", "退出", "")?)?;
    }

    let edit = SubmenuBuilder::new(app, title("编辑", 'E'));
    // macOS 菜单栏的撤销、重做：自定义项走前端命令，与编辑器撤销历史一致（plan 设计要点 2）
    #[cfg(target_os = "macos")]
    let edit = edit
        .item(&i("undo", "撤销", "Mod+Z")?)
        .item(&i("redo", "重做", "Mod+Y")?)
        .item(&sep()?);
    let edit = edit
        .item(&PredefinedMenuItem::cut(app, Some("剪切"))?)
        .item(&PredefinedMenuItem::copy(app, Some("复制"))?)
        .item(&PredefinedMenuItem::paste(app, Some("粘贴"))?)
        .item(&PredefinedMenuItem::select_all(app, Some("全选"))?)
        .item(&sep()?)
        .item(&i("find", "查找", "Mod+F")?)
        .item(&i("replace", "替换", "Mod+H")?)
        .build()?;

    let mut paragraph = SubmenuBuilder::with_id(app, "menu-paragraph", title("段落", 'P'));
    for n in 1..=6 {
        paragraph = paragraph.item(&i(
            &format!("heading:{n}"),
            &format!("{n} 级标题"),
            &format!("Mod+{n}"),
        )?);
    }
    let paragraph = paragraph
        .item(&i("paragraph", "段落", "Mod+0")?)
        .item(&sep()?)
        .item(&i("table", "表格", "Mod+T")?)
        .item(&i("code-block", "代码块", "Mod+Shift+K")?)
        .item(&i("math-block", "公式块", "Mod+Shift+M")?)
        .item(&sep()?)
        .item(&i("quote", "引用", "Mod+Shift+Q")?)
        .item(&i("ordered-list", "有序列表", "Mod+Shift+[")?)
        .item(&i("list", "无序列表", "Mod+Shift+]")?)
        .item(&i("check", "任务列表", "Mod+Shift+X")?)
        .item(&sep()?)
        .item(&i("line", "水平分割线", "Mod+Shift+-")?)
        .build()?;

    let format = SubmenuBuilder::with_id(app, "menu-format", title("格式", 'O'))
        .item(&i("bold", "加粗", "Mod+B")?)
        .item(&i("italic", "斜体", "Mod+I")?)
        .item(&i("underline", "下划线", "Mod+U")?)
        .item(&i("strike", "删除线", "Alt+Shift+5")?)
        .item(&i("inline-code", "行内代码", "Mod+Shift+`")?)
        .item(&i("link", "超链接", "Mod+K")?)
        .build()?;

    let mut tabs = SubmenuBuilder::with_id(app, "menu-tabs", "标签")
        .item(&i("next-tab", "下一个标签", "Ctrl+Tab")?)
        .item(&i("prev-tab", "上一个标签", "Ctrl+Shift+Tab")?)
        .item(&i("move-tab:1", "向右移动标签", "Ctrl+Shift+PageDown")?)
        .item(&i("move-tab:-1", "向左移动标签", "Ctrl+Shift+PageUp")?)
        .item(&sep()?);
    for n in 1..=8 {
        tabs = tabs.item(&i(
            &format!("goto-tab:{n}"),
            &format!("第 {n} 个标签"),
            &format!("Alt+{n}"),
        )?);
    }
    let tabs = tabs.item(&i("goto-tab:9", "最后一个标签", "Alt+9")?).build()?;

    let view = SubmenuBuilder::new(app, title("视图", 'V'))
        .item(&i("source-mode", "源代码模式", "Mod+/")?)
        .item(&sep()?)
        .item(&i("toggle-sidebar", "显示/隐藏侧边栏", "Mod+Shift+L")?)
        .item(&i("sidebar-outline", "大纲", "Mod+Shift+1")?)
        .item(&i("sidebar-favorites", "收藏", "Mod+Shift+2")?)
        .item(&i("sidebar-files", "文件树", "Mod+Shift+3")?)
        .item(&sep()?)
        .item(&i("focus-mode", "专注模式", "F8")?)
        .item(&i("typewriter-mode", "打字机模式", "F9")?)
        .item(&i("fullscreen", "全屏", "F11")?)
        .item(&sep()?)
        .item(&tabs)
        .item(&sep()?)
        .item(&i("zoom-in", "放大", "Mod+=")?)
        .item(&i("zoom-out", "缩小", "Mod+-")?)
        .item(&i("zoom-reset", "实际大小", "Mod+Shift+9")?)
        .build()?;

    let mut themes = SubmenuBuilder::new(app, title("主题", 'T'));
    for (value, label) in [("system", "跟随系统"), ("light", "浅色"), ("dark", "深色")] {
        themes = themes.item(&CheckMenuItemBuilder::with_id(format!("theme:{value}"), label).build(app)?);
    }

    let help = SubmenuBuilder::new(app, title("帮助", 'H'))
        .item(&i("open-bundled:guide", "使用指南", "")?)
        .item(&i("open-bundled:demo", "Markdown 示例文档", "")?)
        .item(&i("shortcuts", "键盘快捷键", "F1")?)
        .item(&sep()?)
        .item(&i("link:changelog", "更新日志", "")?)
        .item(&i("link:issues", "报告问题", "")?)
        .item(&i("link:releases", "获取新版", "")?)
        .item(&i("link:home", "项目主页", "")?)
        .item(&sep()?)
        .item(&i("third-party", "第三方声明", "")?);
    // macOS 的“关于”在应用菜单中（FR-1505）
    #[cfg(not(target_os = "macos"))]
    let help = help.item(&i("about", "关于 Inkmark", "")?);
    let help = help.build()?;

    let menu = MenuBuilder::new(app);
    #[cfg(target_os = "macos")]
    let menu = menu.item(
        &SubmenuBuilder::new(app, "Inkmark")
            .item(&i("about", "关于 Inkmark", "")?)
            .item(&sep()?)
            .item(&PredefinedMenuItem::hide(app, Some("隐藏 Inkmark"))?)
            .item(&PredefinedMenuItem::hide_others(app, Some("隐藏其他"))?)
            .item(&PredefinedMenuItem::show_all(app, Some("全部显示"))?)
            .item(&sep()?)
            // 不用系统预置的“退出”：它直接结束进程，跳过未保存确认（宪章 IV）
            .item(
                &MenuItemBuilder::with_id("quit", "退出 Inkmark")
                    .accelerator("Cmd+Q")
                    .build(app)?,
            )
            .build()?,
    );
    let menu = menu.items(&[&file, &edit, &paragraph, &format, &view, &themes.build()?]);
    #[cfg(target_os = "macos")]
    let menu = menu.item(
        &SubmenuBuilder::new(app, "窗口")
            .item(&PredefinedMenuItem::minimize(app, Some("最小化"))?)
            .item(&PredefinedMenuItem::maximize(app, Some("缩放"))?)
            .build()?,
    );
    menu.item(&help).build()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mac_accelerator_maps_mod_and_exceptions() {
        assert_eq!(canonical("Mod+Shift+K"), "Shift+Mod+K");
        assert_eq!(mac_accelerator("Mod+Shift+K"), "Shift+Cmd+K");
        assert_eq!(mac_accelerator("Mod+H"), "Alt+Cmd+F");
        assert_eq!(mac_accelerator("Mod+Shift+1"), "Ctrl+Cmd+1");
        assert_eq!(mac_accelerator("Alt+9"), "Ctrl+9");
        assert_eq!(mac_accelerator("Ctrl+Tab"), "Ctrl+Tab");
        assert_eq!(mac_accelerator("F8"), "F8");
    }
}

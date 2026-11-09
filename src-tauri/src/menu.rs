//! 中文应用菜单（FR-012、FR-015、FR-017）。
//!
//! WebView2 拥有焦点时注册的菜单快捷键不会触发（research.md R2），因此所有快捷键只以
//! `文字\t快捷键` 的形式显示，按键统一由前端 `app.js` 的 KEYMAP 处理。
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

fn item<R: Runtime>(app: &AppHandle<R>, id: &str, label: &str, shortcut: &str) -> tauri::Result<MenuItem<R>> {
    let text = if shortcut.is_empty() {
        label.to_string()
    } else {
        format!("{label}\t{shortcut}")
    };
    MenuItemBuilder::with_id(id, text).build(app)
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
        "save" | "save-as" | "close-tab" | "close-all" | "find" | "replace" | "source-mode" | "menu-export"
        | "menu-paragraph" | "menu-format" => Some(tab.has_doc),
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
pub fn build<R: Runtime>(app: &AppHandle<R>, sample: &str) -> tauri::Result<Menu<R>> {
    let i = |id: &str, label: &str, shortcut: &str| item(app, id, label, shortcut);
    let sep = || PredefinedMenuItem::separator(app);

    let recent_menu = SubmenuBuilder::with_id(app, "menu-recent", "最近打开").build()?;
    fill_recent(app, &recent_menu, &[])?;

    let file = SubmenuBuilder::new(app, "文件(&F)")
        .item(&i("new", "新建", "Ctrl+N")?)
        .item(&i("open", "打开…", "Ctrl+O")?)
        .item(&i("open-folder", "打开文件夹…", "Ctrl+Shift+O")?)
        .item(&recent_menu)
        .item(&MenuItemBuilder::with_id("toggle-favorite-current", "收藏当前文件").build(app)?)
        .item(&sep()?)
        .item(&i("save", "保存", "Ctrl+S")?)
        .item(&i("save-as", "另存为…", "Ctrl+Shift+S")?)
        .item(&i("save-all", "全部保存", "Ctrl+Alt+S")?)
        .item(&sep()?)
        .item(&i("close-tab", "关闭标签", "Ctrl+W")?)
        .item(&i("close-others", "关闭其他标签", "")?)
        .item(&i("close-all", "关闭全部标签", "")?)
        .item(&i("reopen-tab", "重新打开关闭的标签", "Ctrl+Shift+T")?)
        .item(&CheckMenuItemBuilder::with_id("toggle-restore-tabs", "启动时恢复上次的标签").build(app)?)
        .item(&sep()?)
        .item(
            &SubmenuBuilder::with_id(app, "menu-export", "导出")
                .item(&i("export-html", "HTML…", "")?)
                .item(&i("export-pdf", "PDF…", "")?)
                .build()?,
        )
        .item(&sep()?)
        .item(&i("quit", "退出", "")?)
        .build()?;

    let edit = SubmenuBuilder::new(app, "编辑(&E)")
        .item(&PredefinedMenuItem::cut(app, Some("剪切"))?)
        .item(&PredefinedMenuItem::copy(app, Some("复制"))?)
        .item(&PredefinedMenuItem::paste(app, Some("粘贴"))?)
        .item(&PredefinedMenuItem::select_all(app, Some("全选"))?)
        .item(&sep()?)
        .item(&i("find", "查找", "Ctrl+F")?)
        .item(&i("replace", "替换", "Ctrl+H")?)
        .build()?;

    let mut paragraph = SubmenuBuilder::with_id(app, "menu-paragraph", "段落(&P)");
    for n in 1..=6 {
        paragraph = paragraph.item(&i(
            &format!("heading:{n}"),
            &format!("{n} 级标题"),
            &format!("Ctrl+{n}"),
        )?);
    }
    let paragraph = paragraph
        .item(&i("paragraph", "段落", "Ctrl+0")?)
        .item(&sep()?)
        .item(&i("table", "表格", "Ctrl+T")?)
        .item(&i("code-block", "代码块", "Ctrl+Shift+K")?)
        .item(&i("math-block", "公式块", "Ctrl+Shift+M")?)
        .item(&sep()?)
        .item(&i("quote", "引用", "Ctrl+Shift+Q")?)
        .item(&i("ordered-list", "有序列表", "Ctrl+Shift+[")?)
        .item(&i("list", "无序列表", "Ctrl+Shift+]")?)
        .item(&i("check", "任务列表", "Ctrl+Shift+X")?)
        .item(&sep()?)
        .item(&i("line", "水平分割线", "Ctrl+Shift+-")?)
        .build()?;

    let format = SubmenuBuilder::with_id(app, "menu-format", "格式(&O)")
        .item(&i("bold", "加粗", "Ctrl+B")?)
        .item(&i("italic", "斜体", "Ctrl+I")?)
        .item(&i("underline", "下划线", "Ctrl+U")?)
        .item(&i("strike", "删除线", "Alt+Shift+5")?)
        .item(&i("inline-code", "行内代码", "Ctrl+Shift+`")?)
        .item(&i("link", "超链接", "Ctrl+K")?)
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

    let view = SubmenuBuilder::new(app, "视图(&V)")
        .item(&i("source-mode", "源代码模式", "Ctrl+/")?)
        .item(&sep()?)
        .item(&i("toggle-sidebar", "显示/隐藏侧边栏", "Ctrl+Shift+L")?)
        .item(&i("sidebar-outline", "大纲", "Ctrl+Shift+1")?)
        .item(&i("sidebar-favorites", "收藏", "Ctrl+Shift+2")?)
        .item(&i("sidebar-files", "文件树", "Ctrl+Shift+3")?)
        .item(&sep()?)
        .item(&i("focus-mode", "专注模式", "F8")?)
        .item(&i("typewriter-mode", "打字机模式", "F9")?)
        .item(&i("fullscreen", "全屏", "F11")?)
        .item(&sep()?)
        .item(&tabs)
        .item(&sep()?)
        .item(&i("zoom-in", "放大", "Ctrl+=")?)
        .item(&i("zoom-out", "缩小", "Ctrl+-")?)
        .item(&i("zoom-reset", "实际大小", "Ctrl+Shift+9")?)
        .build()?;

    let mut themes = SubmenuBuilder::new(app, "主题(&T)");
    for (value, label) in [("system", "跟随系统"), ("light", "浅色"), ("dark", "深色")] {
        themes = themes.item(&CheckMenuItemBuilder::with_id(format!("theme:{value}"), label).build(app)?);
    }

    let help = SubmenuBuilder::new(app, "帮助(&H)")
        .item(&i(&format!("open-path:{sample}"), "Markdown 示例文档", "")?)
        .item(&i("shortcuts", "键盘快捷键", "F1")?)
        .item(&sep()?)
        .item(&i("link:changelog", "更新日志", "")?)
        .item(&i("link:issues", "报告问题", "")?)
        .item(&i("link:releases", "获取新版", "")?)
        .item(&i("link:home", "项目主页", "")?)
        .item(&sep()?)
        .item(&i("third-party", "第三方声明", "")?)
        .item(&i("about", "关于 Inkmark", "")?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&file, &edit, &paragraph, &format, &view, &themes.build()?, &help])
        .build()
}

//! 中文应用菜单（FR-012、FR-015、FR-017）。
//!
//! WebView2 拥有焦点时注册的菜单快捷键不会触发（research.md R2），因此所有快捷键只以
//! `文字\t快捷键` 的形式显示，按键统一由前端 `app.js` 的 KEYMAP 处理。
//! 菜单 id 形如 `命令` 或 `命令:参数`，由 lib.rs 转为前端的 `command` 事件。

use serde::Deserialize;
use tauri::menu::{
    CheckMenuItemBuilder, Menu, MenuBuilder, MenuItem, MenuItemBuilder, PredefinedMenuItem, SubmenuBuilder,
};
use tauri::{AppHandle, Runtime};

pub const ABOUT: &str = "about";
pub const HOMEPAGE: &str = "homepage";

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

pub fn build<R: Runtime>(
    app: &AppHandle<R>,
    recent: &[String],
    theme: &str,
    sample: &str,
    (favorited, can_favorite): (bool, bool),
    tab: TabMenu,
) -> tauri::Result<Menu<R>> {
    let i = |id: &str, label: &str, shortcut: &str| item(app, id, label, shortcut);
    let when = |enabled: bool, id: &str, label: &str, shortcut: &str| -> tauri::Result<MenuItem<R>> {
        let m = item(app, id, label, shortcut)?;
        m.set_enabled(enabled)?;
        Ok(m)
    };
    let sep = || PredefinedMenuItem::separator(app);

    let mut recent_menu = SubmenuBuilder::new(app, "最近打开");
    if recent.is_empty() {
        recent_menu = recent_menu.item(&MenuItemBuilder::new("（无）").enabled(false).build(app)?);
    } else {
        for p in recent {
            recent_menu = recent_menu.item(&i(&format!("open-path:{p}"), p, "")?);
        }
        recent_menu = recent_menu.item(&sep()?).item(&i("clear-recent", "清除最近打开", "")?);
    }

    let file = SubmenuBuilder::new(app, "文件(&F)")
        .item(&i("new", "新建", "Ctrl+N")?)
        .item(&i("open", "打开…", "Ctrl+O")?)
        .item(&i("open-folder", "打开文件夹…", "Ctrl+Shift+O")?)
        .item(&recent_menu.build()?)
        .item(
            &MenuItemBuilder::with_id(
                "toggle-favorite-current",
                if favorited {
                    "取消收藏当前文件"
                } else {
                    "收藏当前文件"
                },
            )
            .enabled(can_favorite)
            .build(app)?,
        )
        .item(&sep()?)
        .item(&when(tab.has_doc, "save", "保存", "Ctrl+S")?)
        .item(&when(tab.has_doc, "save-as", "另存为…", "Ctrl+Shift+S")?)
        .item(&when(tab.any_dirty, "save-all", "全部保存", "Ctrl+Alt+S")?)
        .item(&sep()?)
        .item(&when(tab.has_doc, "close-tab", "关闭标签", "Ctrl+W")?)
        .item(&when(tab.can_close_others, "close-others", "关闭其他标签", "")?)
        .item(&when(tab.has_doc, "close-all", "关闭全部标签", "")?)
        .item(&when(
            tab.can_reopen,
            "reopen-tab",
            "重新打开关闭的标签",
            "Ctrl+Shift+T",
        )?)
        .item(&sep()?)
        .item(
            &SubmenuBuilder::new(app, "导出")
                .enabled(tab.has_doc)
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
        .item(&when(tab.has_doc, "find", "查找", "Ctrl+F")?)
        .item(&when(tab.has_doc, "replace", "替换", "Ctrl+H")?)
        .build()?;

    let mut paragraph = SubmenuBuilder::new(app, "段落(&P)").enabled(tab.has_doc);
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

    let format = SubmenuBuilder::new(app, "格式(&O)")
        .enabled(tab.has_doc)
        .item(&i("bold", "加粗", "Ctrl+B")?)
        .item(&i("italic", "斜体", "Ctrl+I")?)
        .item(&i("underline", "下划线", "Ctrl+U")?)
        .item(&i("strike", "删除线", "Alt+Shift+5")?)
        .item(&i("inline-code", "行内代码", "Ctrl+Shift+`")?)
        .item(&i("link", "超链接", "Ctrl+K")?)
        .build()?;

    let mut tabs = SubmenuBuilder::new(app, "标签")
        .enabled(tab.can_close_others)
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
        .item(&when(tab.has_doc, "source-mode", "源代码模式", "Ctrl+/")?)
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
        themes = themes.item(
            &CheckMenuItemBuilder::with_id(format!("theme:{value}"), label)
                .checked(theme == value)
                .build(app)?,
        );
    }

    let help = SubmenuBuilder::new(app, "帮助(&H)")
        .item(&i(&format!("open-path:{sample}"), "Markdown 示例文档", "")?)
        .item(&i(HOMEPAGE, "项目主页", "")?)
        .item(&i(ABOUT, "关于 Inkmark", "")?)
        .build()?;

    MenuBuilder::new(app)
        .items(&[&file, &edit, &paragraph, &format, &view, &themes.build()?, &help])
        .build()
}

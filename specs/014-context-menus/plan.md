# 实施计划：统一右键菜单与屏蔽浏览器内核默认行为

**分支**: `014-context-menus` | **规格**: [spec.md](spec.md)

## 摘要

内核行为在源头关闭：窗口创建后通过 WebView2 设置接口，在发布版中关闭默认右键菜单和浏览器快捷键，在所有构建中关闭网址提示与自动填充。前端新增 `src/edit-menu.js`，在文档上统一接管右键：编辑区、输入框、有选中文字的其他区域分别显示 Inkmark 菜单，已有的标签、文件树、收藏、表格、图片菜单不变。菜单项由纯函数生成，可单元测试。不新增依赖。

## 调研结论

| 问题 | 结论 | 依据 |
|---|---|---|
| 关闭默认菜单的方式 | `ICoreWebView2Settings::SetAreDefaultContextMenusEnabled(false)` 对整个页面生效，包括输入框和对话框；比在每处 `preventDefault` 更可靠 | WebView2 文档 |
| 刷新、打印等快捷键 | `ICoreWebView2Settings3::SetAreBrowserAcceleratorKeysEnabled(false)` 关闭刷新（F5、Ctrl+R）、打印、查找、开发者工具、前进后退等浏览器快捷键；不影响剪切、复制、粘贴、撤销、全选、方向键等编辑键。页面中的 `keydown` 仍照常收到，Inkmark 自己的快捷键（`KEYMAP`）不受影响 | WebView2 文档 |
| 网址提示、输入历史 | `SetIsStatusBarEnabled(false)`、`ICoreWebView2Settings4::SetIsGeneralAutofillEnabled(false)`、`SetIsPasswordAutosaveEnabled(false)` | WebView2 文档 |
| 调用位置 | 已有先例：`pdf.rs` 用 `with_webview` 取得 controller 调用 `PrintToPdf`。`webview2-com`、`windows-core` 已是依赖 | `pdf.rs`、`Cargo.toml` |
| 开发构建 | 用 `cfg!(debug_assertions)` 区分：开发构建保留默认菜单（含“检查”）和刷新，便于调试 | 规格“澄清” |
| 后退、前进 | 应用只加载一次页面，没有可后退的历史；关闭浏览器快捷键后 `Alt+←/→` 不再处理，鼠标侧键实测确认无反应 | — |
| 右键时公式展开 | 行内公式部件 `ignoreEvent()` 为 false，右键按下时编辑器会把光标移入并展开源码；块级公式、图表部件只处理左键 | `live-preview.js` |
| 图表复制为图片 | Mermaid 默认用 `foreignObject` 排版文字，画到画布会被视为跨源而无法导出。复制为图片时另行渲染一份关闭 HTML 标签的 SVG（源码前加 `%%{init: {"htmlLabels": false}}%%`）再转 PNG；实施时先做原型验证 | Chromium 画布安全规则 |
| 剪切、复制 | 在编辑区执行 `document.execCommand('cut'/'copy')` 会触发 CodeMirror 自己的剪贴板处理，结果与 `Ctrl+X`、`Ctrl+C` 相同（复制的是 Markdown 原文） | CodeMirror |
| 粘贴 | 网页不能用 `execCommand('paste')`。用 `navigator.clipboard.read()`：有图片时走现有 `uploadImages`（规格 011），否则 `readText()` 后以 `input.paste` 事件插入；012 的验收已确认 WebView2 中可读剪贴板 | `app.js` |

## 技术上下文

| 项 | 选择 |
|---|---|
| 涉及进程 | 前端、Rust |
| 新增依赖 | 无（NFR-1401） |
| 测试 | `node --test`：菜单项生成（各场景的项目、顺序、启用状态）；CDP 驱动验收：真实右键、`Shift+F10`、按键；内核快捷键与菜单需人工确认一次（CDP 发送的按键不经过浏览器快捷键处理） |

## 宪章检查

| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ 取代 012 的 FR-1204，同步修改 012 规格 |
| II 离线 | ✅ |
| III Markdown 唯一真相 | ✅ 菜单命令走编辑器自身的撤销、剪贴板处理 |
| IV 不丢数据 | ✅ 关闭会直接丢失修改的“刷新” |
| V 安全默认 | ✅ 收紧内核能力；不新增前端权限 |
| VI 简单 | ✅ 内核行为在一处设置关闭；菜单复用 `ContextMenu` |
| VII 轻量 | ✅ 无依赖 |

## 变更文件

```
src-tauri/src/webview.rs   新：窗口创建后设置 WebView2（菜单、快捷键、网址提示、自动填充、剪贴板读取权限）
src-tauri/src/lib.rs       改：setup 中调用 webview::configure
src/edit-menu.js           新：右键分派、菜单项生成（纯函数）、Shift+F10 与菜单键、公式与图表的右键按下拦截
src/image-menu.js          改：导出 toPng 供图表复制为图片使用，增加可选背景色
src/editor.js              改：暴露 undo、redo、canUndo、canRedo、selectAll、pasteText
src/app.js                 改：接入 EditMenu；把 Ctrl+单击打开链接的逻辑提取为 openLink 复用
src/contextmenu.js         改：更新文件头说明；有打开的模态对话框时把菜单放进对话框（R4）
src/index.html             改：引入 edit-menu.js
test/edit-menu.test.js     新
specs/012-image-menu/spec.md  改：FR-1204 注明由 014 FR-1401 取代
```

## 设计要点

### WebView2 设置（FR-1401、FR-1407、FR-1408）

```rust
pub fn configure<R: Runtime>(win: &WebviewWindow<R>) {
    let release = !cfg!(debug_assertions);
    let _ = win.with_webview(move |wv| unsafe {
        // Settings → Settings3 / Settings4 依次 cast
        s.SetAreDefaultContextMenusEnabled(!release);
        s3.SetAreBrowserAcceleratorKeysEnabled(!release);
        s.SetIsStatusBarEnabled(false);
        s4.SetIsGeneralAutofillEnabled(false);
        s4.SetIsPasswordAutosaveEnabled(false);
    });
}
```

失败时（极旧的 WebView2 不支持某个接口）跳过该项，不影响启动。

### 右键分派

在 `document` 上以冒泡方式监听 `contextmenu`。已有菜单（标签、文件树、收藏、表格、图片）在各自元素上处理并 `preventDefault`，这里跳过 `defaultPrevented` 的事件：

1. 目标在编辑区内 → 编辑区菜单；
2. 目标是文本输入框 → 输入框菜单；
3. 其他区域有选中文字 → 只有“复制”；
4. 否则不显示。发布版内核菜单已关闭；开发构建在此情况下保留内核菜单。

### 编辑区菜单（FR-1402、FR-1403）

纯函数 `items(ctx)`，`ctx` 含 `hasSelection`、`canUndo`、`canRedo`、`readOnly`、`link`、`math`、`mermaid`，返回菜单描述（标签、快捷键、是否禁用、命令名）。顺序：

```
[打开链接、复制链接地址] / [复制公式] / [复制图表源码、复制为图片]   ← 按右键位置，可无
—
撤销 Ctrl+Z、重做 Ctrl+Y
—
剪切 Ctrl+X、复制 Ctrl+C、粘贴 Ctrl+V
—
全选 Ctrl+A
```

- 只读时撤销、重做、剪切、粘贴禁用。
- 链接取 `.im-link` 的 `data-href`；“打开链接”与 `Ctrl+单击` 相同（http(s) 交给系统浏览器，Markdown 文件在新标签打开）。
- 公式取 `.im-math` 的 `data-source`（LaTeX 源码，不含 `$`）；图表取 `.im-mermaid` 的 `data-source`。
- 复制为图片：另行渲染关闭 HTML 标签的 SVG，经 `toPng` 转为 2 倍尺寸的 PNG，背景填编辑区背景色（深色主题下粘贴到其他程序仍可读），写入剪贴板。

### 右键不移动光标、不展开（用户故事 1 场景 8）

与 012 相同：在编辑区以捕获方式拦截右键按下，目标为公式、图表、目录时 `preventDefault` 并停止传播。正文文字的右键按下不拦截，由内核按常规处理（在选区内右键保持选区）。

### 输入框菜单（FR-1404）

撤销（`execCommand('undo')`）| 剪切、复制（`execCommand`）、粘贴（`readText` 后 `setRangeText`，并派发 `input` 事件以刷新查找结果）| 全选（`select()`）。

### 键盘打开（FR-1406）

编辑区有焦点时，`Shift+F10` 或 `ContextMenu` 键在光标位置（`coordsAtPos`）打开编辑区菜单，并阻止内核默认处理。

## IPC 契约变更

无。

## 实施阶段

1. **实测与原型**：运行当前发布版，确认排查表第 8、9 项；验证图表关闭 HTML 标签后可转 PNG。
2. **后端**：`webview.rs`。
3. **前端**：`edit-menu.js`、编辑器命令、`openLink`、`toPng` 背景色；单元测试。
4. **验证与文档**：CDP 验收；人工确认内核快捷键与菜单（发布版）；回归 011、012、表格菜单；CHANGELOG；012 规格注记。

## 风险

- **R1 关闭浏览器快捷键的范围**：若某个编辑相关按键也被关闭，验收会发现。应对：用键盘快捷键列表逐个回归；必要时改为在页面中拦截刷新与打印。
- **R2 图表转图片**：关闭 HTML 标签后少数图表的文字换行与原图略有差异。应对：在 plan 中接受，规格只要求复制为图片。
- **R3 剪贴板读取权限**：实测 WebView2 会对 `clipboard.read()` 弹出权限询问，点“阻止”后被记住，粘贴将一直失败。应对：`webview.rs` 启动时用 `ICoreWebView2Profile4::SetPermissionState` 只为 `http://tauri.localhost` 授予剪贴板读取（覆盖之前保存的选择），不弹出询问。
- **R4 模态对话框**：模态对话框打开时页面其余部分不可点击，菜单放在页面底层会点不到。应对：`contextmenu.js` 在有打开的对话框时把菜单插入该对话框。

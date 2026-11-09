# 实施计划：多标签

**分支**: `008-multi-tabs` | **规格**: [spec.md](spec.md)

## 摘要

窗口只保留一个 `EditorView`，每个标签保存一份 CodeMirror `EditorState`，切换时用 `view.setState` 换入。`EditorState` 自带文档、选区和撤销历史，未激活的标签不占用 DOM，内存只随文本增长。`app.js` 中“当前文档”的状态改为指向当前标签，现有命令大多不用改。标签栏、起始页各为一个新模块，可测试的逻辑放进纯函数模块。Rust 只增加菜单状态、打开多个文件和“在资源管理器中显示”。

## 调研结论

| 问题 | 结论 | 依据 |
|---|---|---|
| 每个标签一个 `EditorView`，还是共用一个 | 共用一个。多个 View 切换更快，但每个标签都常驻 DOM 和图表，难以满足 NFR-802 | 规格 006：`EditorState` 为不可变对象，可保存后换入 |
| 切换后恢复滚动位置 | 用 `view.scrollSnapshot()`，它按文档位置记录，不受高度估算影响 | 随包的 `vendor/cm.js` 已包含该接口 |
| 切换时图表是否重新渲染 | 不重新渲染。`svgDone` 按源码和主题缓存，小部件同步显示 | `live-preview.js` |
| 查找栏跟随切换 | 用 `Finder.refresh`，不滚动、不移动光标；`Finder.search` 会滚动到第一个匹配，不能用 | `find.js` |
| 保存前检查目标路径 | 现有 `api.saveAs` 选路径后立即写入，无法拦截，需拆成“选路径”和“写入”两步 | `platform.js` |
| 在资源管理器中显示 | `app.opener().reveal_item_in_dir`，由 Rust 命令调用，不开放前端权限 | `tauri-plugin-opener` 2.7.2 |
| 标签拖动 | Pointer Events，与收藏排序一致；Tauri 接管了 HTML5 拖放 | 规格 002、003 |

## 技术上下文

| 项 | 选择 |
|---|---|
| 涉及进程 | 前端为主；Rust 增加 2 个命令，修改菜单、启动参数 |
| 新增依赖 | 无（NFR-803） |
| 体积影响 | 新增源码约 30KB，安装包体积基本不变 |
| 测试 | `node --test`：标签纯函数；`cargo test`：多文件参数、设置默认值；CDP 驱动验收 |

## 宪章检查

| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ 本规格取代 001 中“打开文件替换当前文档”的行为，实现时同步在 001 的相关需求处注明 |
| II 离线 | ✅ 图标用字符 |
| III Markdown 唯一真相 | ✅ 编辑状态仍为 Markdown 原文；各标签独立保留 BOM 与换行符 |
| IV 不丢数据 | ✅ 所有关闭路径统一经过 `confirmLeave`；写文件仍走 `write_atomic` |
| V 安全默认 | ✅ `read_file` 时才授权目录，懒加载标签同样如此；`reveal_path` 只接受存在的 Markdown 文件；不新增前端权限 |
| VI 简单 | ✅ 只新增 1 个配置项；不做多窗口、分屏、固定标签 |
| VII 轻量 | ✅ 无新依赖 |

## 变更文件

```
src/
├── tab-utils.js     新：纯函数——同名区分、未命名编号、关闭后的下一个标签、移动、路径规范化（samePath）
├── tabs.js          新：标签数据与标签栏界面——渲染、切换、拖动、溢出滚动、连续关闭时冻结宽度、键盘访问
├── start-page.js    新：起始页
├── editor.js        改：load 改为 createDoc / activate，saved 与 source 移入文档对象
├── app.js           改：state 指向当前标签；打开、关闭、保存流程；KEYMAP；会话
├── live-preview.js  改：切换时重置 jump、dragging
├── platform.js      改：拆分另存为、汇总询问、复制路径、新 IPC
├── index.html       改：#tabbar、#start-page、新脚本
├── styles.css       改：标签栏、起始页
src-tauri/src/
├── lib.rs           改：多文件参数、set_tab_menu、reveal_path
├── menu.rs          改：文件菜单、视图→标签子菜单、按状态启用
├── settings.rs      改：默认值 tabs、restoreTabs
test/tab-utils.test.js   新
README.md、CHANGELOG.md
```

## 设计要点

### 文档模型

```js
// editor.js
createDoc(text)  → { state, saved, source, scroll, theme }  // 不显示
activate(doc)    // 把当前 View 的状态存回旧文档，换入 doc
docText(doc), isDocDirty(doc)                               // 操作未激活的文档，用于全部保存
```

- `activate` 的顺序：保存旧文档的 `view.state` 和 `view.scrollSnapshot()`；`view.setState(doc.state)`；派发滚动快照；按全局状态重新配置专注和打字机模式。
- `mode`、`focusConf`、`typewriterConf` 三个 Compartment 由所有文档共用。`source` 按文档保存；专注、打字机为全局，只在激活时同步。
- 主题变化只刷新当前文档。未激活文档记录渲染时的主题，激活时不一致才派发 `LivePreview.refresh`。
- 切换前关闭表格尺寸选择器，并清除 `live-preview.js` 模块级的 `jump`、`dragging`，避免影响下一个文档。

### 标签与 app.js

```js
tab = { id, kind: 'doc' | 'start', path, untitledNo, format, doc /* 懒加载前为 null */, dirty }
```

- `state.path`、`state.format`、`state.dirty` 改为读写当前标签的访问器，导出、图片、收藏等代码不用改。
- 同一文件：`tab-utils.pathKey(p)` 统一为反斜杠、解析 `.` 和 `..`、转小写后比较，不访问磁盘；`D:\b.md` 与 `D:\a\b.md` 的键不同。保存到标签上的路径仍是解析后的原大小写路径，键只用于比较。
- `openPath` 依次执行：按 `pathKey` 查找已打开标签（命中则切换、滚动到可见并短暂高亮，结束）→ 读文件 → 复用起始页或唯一的空白标签，否则新建。打开请求排队执行，避免连续打开时交错。
- 切换后立即刷新大纲和字数，不等待防抖；查找栏打开时 `Finder.refresh`，关闭时 `Finder.clear`。
- 对话框期间由 `busy` 标志阻止关闭和切换。

### 关闭与保存

- 所有关闭路径（单个、批量、关闭全部、退出）都先算出受影响的未保存标签：0 个直接关闭；1 个切换过去并用现有询问；2 个及以上用 `confirmDiscardAll(names)`。
- 选择“全部保存”时，先保存已有路径的，再逐个处理未命名；任何取消或失败都中止本次关闭。全部成功后才关闭标签，所以取消时标签都还在。
- 独立的“全部保存”命令遇到写入失败时继续处理其余文件，遇到另存为取消时跳过其余未命名标签，两种情况都不关闭标签。
- `saveTab(tab)` 是唯一的保存入口：捕获写入错误，另存为时先用 `api.askSavePath` 选路径，目标的 `pathKey` 属于其他标签时不写入，调用 `api.confirmSaveConflict(name)`，按“选择其他位置 / 切换到该标签 / 取消”处理，确认不冲突后才 `api.saveFile`。Windows 的“是否替换”提示在选路径时已出现，无法提前拦截，此时文件尚未写入。

### 标签栏

- `#tabbar` 放在 `#main` 顶部，位于侧边栏右侧；侧边栏属于窗口，不随标签变化。
- 宽度：弹性分配到最小宽度后 `overflow-x: auto`，当前标签 `scrollIntoView`。
- 连续关闭：鼠标在标签栏内关闭标签时，把其余标签宽度固定为当前像素值，`pointerleave` 时解除（FR-824）。
- 同名区分：`tab-utils.labels(paths)` 为重名的文件逐级向上取目录名，直到可以区分。
- 可访问性：`role="tablist"` / `role="tab"`、`aria-selected`，方向键在标签间移动。

### 起始页

`#start-page` 与 `#editor` 同级，互斥显示。显示编辑器后调用 `view.requestMeasure()`。最近文件和收藏用现有的 `settings.recent`、`settings.favorites` 与 `path_info` 检查是否存在。依赖文档的命令在 `run` 中拦截，菜单同步禁用。

### 会话

`settings.tabs = { paths, active }`，标签增删、排序、切换后防抖 300ms 写入。恢复时用 `path_info` 过滤不存在的文件，只读取当前标签；其余标签在首次激活时读取，读取失败时提示并关闭该标签。

### 快捷键（KEYMAP 与 menu.rs 一致）

新增：`Ctrl+KeyW`、`Ctrl+Shift+KeyT`、`Ctrl+Tab`、`Ctrl+Shift+Tab`、`Ctrl+PageDown`、`Ctrl+PageUp`、`Ctrl+Shift+PageDown`、`Ctrl+Shift+PageUp`、`Alt+Digit1..9`、`Ctrl+Alt+KeyS`。`视图 → 标签` 子菜单列出切换、移动和跳转项。

## IPC 契约变更

| 方法 | 方向 | 说明 |
|---|---|---|
| `app_ready` | 前端 → Rust | 返回值由单个路径改为路径数组（FR-812） |
| `open-file` 事件 | Rust → 前端 | 载荷由单个路径改为路径数组 |
| `set_tab_menu(state)` | 前端 → Rust | 新增：全部保存、关闭类、重新打开、是否有文档等启用状态，以及恢复设置的勾选；状态变化时才重建菜单 |
| `sample_doc()` | 前端 → Rust | 新增：起始页“查看示例文档”的路径 |
| `reveal_path(path)` | 前端 → Rust | 新增：在资源管理器中显示，仅限存在的 Markdown 文件 |
| `set_settings` | 前端 → Rust | `restoreTabs` 变化时刷新菜单 |

设置新增：`tabs: { paths: [], active: 0 }`、`restoreTabs: true`。

## 实施阶段

1. **标签基础（US1）**：`editor.js` 文档模型、`tab-utils.js`、标签栏、打开入口。结束时实测 NFR-801、NFR-802。
2. **关闭与保存（US2、US6）**：关闭流程、汇总询问、全部保存、文件菜单。
3. **起始页（US5）**。
4. **整理标签（US3）**：拖动、右键菜单、快捷键、溢出、连续关闭。
5. **会话恢复（US4）**：恢复、懒加载、多文件参数。
6. **验证与文档**：`checklist.md`、README、CHANGELOG，并在 001 的相关需求处注明变更。

## 风险

- **R1 切换性能**：`setState` 会重建编辑区 DOM，含大量图表的文档可能超过 100ms。应对：阶段 1 结束时用 1150 行文档实测；不达标时，为最近使用的少量标签保留独立的 `EditorView`，并更新本计划。
- **R2 滚动恢复**：图表和图片的实际高度与估算不同，可能导致位置漂移。应对：使用 `scrollSnapshot`，并沿用 `jumpTo` 对异步渲染的处理，用长文档验证。
- **R3 模块级状态串扰**：`find.js`、`live-preview.js`、`table.js` 的模块级变量原本假定只有一份文档。应对：切换时统一重置，验收时覆盖切换后查找、表格编辑、大纲跳转。
- **R4 全部不保存的误操作**：汇总询问里选错会一次丢弃多个文件。应对：对话框列出文件名，按钮文字明确；不提供“不再询问”。
- **R5 复制路径**：`navigator.clipboard` 在 WebView2 中的可用性待确认。应对：阶段 4 实测，不可用时改由 Rust 命令写剪贴板，并更新 IPC 契约。
- **R6 菜单重建频率**：未保存状态变化可能频繁触发重建。应对：只在启用状态实际变化时重建，与现有收藏菜单做法一致。

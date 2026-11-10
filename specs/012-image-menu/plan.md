# 实施计划：编辑区图片的右键菜单

**分支**: `012-image-menu`（基于 `011-images-zoom`，需用到其中的图片解析） | **规格**: [spec.md](spec.md)

## 摘要

在编辑区上以捕获方式拦截图片的右键事件，阻止浏览器内核菜单与编辑器移动光标，改为显示现有的 `ContextMenu`。针对文件的操作统一先经后端解析（规格 011 的 `resolve_image`，含自动查找）再执行。“复制图片”由后端读取原图，前端转成 PNG 写入剪贴板；“复制图片文件”由后端调用 Windows 剪贴板接口放入文件（`CF_HDROP`）。不新增依赖。

## 调研结论

| 问题 | 结论 | 依据 |
|---|---|---|
| 图片为何出现内核菜单 | 编辑区除表格外未拦截 `contextmenu`，WebView2 显示默认菜单 | `app.js`、`table.js` |
| 右键会移动光标 | 图片小部件 `ignoreEvent()` 返回 false，右键按下时编辑器会把光标移入图片并展开源码 | `live-preview.js` |
| 前端不能直接读图片内容 | 图片通过 `asset.localhost` 显示，CSP 的 `connect-src` 不含它，且画到画布会被视为跨源 | `tauri.conf.json` |
| 剪贴板图片格式 | 网页剪贴板接口只接受 `image/png`；用后端读出的字节生成同源 Blob，经 `createImageBitmap`（SVG 用 `<img>`）画到画布转 PNG | Chromium |
| 放入文件 | Windows 剪贴板格式 `CF_HDROP`：`DROPFILES` 结构 + UTF-16 路径 + 两个结束符，用 `OpenClipboard`、`SetClipboardData` 等系统函数，声明外部函数即可 | Win32；规格 012 已实测粘贴文件可保留原 GIF |
| 在资源管理器中显示 | 现有 `reveal_path` 只接受 Markdown 文件，放宽为 Markdown 或图片 | `lib.rs` |

## 技术上下文

| 项 | 选择 |
|---|---|
| 涉及进程 | 前端、Rust |
| 新增依赖 | 无（NFR-1201） |
| 测试 | `cargo test`：`DROPFILES` 缓冲区构造；CDP 驱动验收（真实右键、读回剪贴板、系统剪贴板文件列表） |

## 宪章检查

| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅ |
| II 离线 | ✅ 网络图片只能复制地址，不发请求 |
| III Markdown 唯一真相 | ✅ 菜单操作不修改文档 |
| IV 不丢数据 | ✅ 另存为只写入用户选择的新文件；与原图相同时不操作 |
| V 安全默认 | ✅ 不新增前端权限；文件类命令都先解析，只接受图片扩展名 |
| VI 简单 | ✅ 复用 `ContextMenu` 与 011 的解析 |
| VII 轻量 | ✅ 无依赖 |

## 变更文件

```
src-tauri/src/clipboard.rs  新：put_files（CF_HDROP）、drop_files 缓冲区构造与测试
src-tauri/src/lib.rs        改：found_image 辅助、read_image、copy_image_file、save_image_as、
                            open_image；reveal_path 接受图片
src/image-menu.js           新：拦截右键与右键按下、菜单项与启用状态、复制为 PNG
src/app.js、platform.js、index.html
```

## 设计要点

### 拦截

在 `#editor` 上以捕获方式监听：
- `mousedown`：右键按在 `img.im-image` 上时 `preventDefault` + `stopPropagation`，编辑器不移动光标、不展开源码。
- `contextmenu`：目标是 `img.im-image` 时 `preventDefault`，显示菜单；其他位置不处理，保持系统菜单（FR-1204）。

### 菜单与启用状态

1. 读 `img.dataset.source`（文档中写的地址）。
2. `Render.resolveImage(src, 文档目录)`：网络或 data 地址 → 只有“复制图片地址”可用；本地路径 → `api.resolveImage(path)`，找不到 → 只有“复制图片地址”可用。
3. 找到时全部可用，文件类操作使用解析出的实际路径（FR-1203）。

### 各项实现

| 菜单项 | 实现 |
|---|---|
| 复制图片 | `read_image(path)` 返回字节 → Blob → 解码画到画布（SVG 按图片显示尺寸）→ PNG → `navigator.clipboard.write` |
| 复制图片文件 | `copy_image_file(path)` → `clipboard::put_files` |
| 图片另存为… | 保存对话框（按原扩展名过滤，默认原文件名）→ `save_image_as(src, dest)`；目标与原图相同则不操作 |
| 复制图片地址 | `navigator.clipboard.writeText(src)` |
| 在资源管理器中显示 | `reveal_path(path)` |
| 用默认程序打开 | `open_image(path)` → `opener().open_path` |

完成后在状态栏提示结果，失败时提示原因。

### 后端统一检查

`found_image(app, path)`：`resolve_image` 解析，找不到或非图片扩展名返回错误。`read_image`、`copy_image_file`、`save_image_as`、`open_image` 都先经过它。

## IPC 契约变更

| 方法 | 方向 | 说明 |
|---|---|---|
| `read_image(path)` | 前端 → Rust | 新增：返回解析后图片的字节 |
| `copy_image_file(path)` | 前端 → Rust | 新增：把图片文件放入系统剪贴板 |
| `save_image_as(src, dest)` | 前端 → Rust | 新增：复制图片到用户选择的位置 |
| `open_image(path)` | 前端 → Rust | 新增：用默认程序打开 |
| `reveal_path(path)` | 前端 → Rust | 改：除 Markdown 外也接受图片 |

## 实施阶段

1. **后端**：`clipboard.rs`、图片类命令、`reveal_path` 放宽、Rust 测试。
2. **前端**：拦截、菜单、复制为 PNG、另存为。
3. **验证与文档**：验收（会覆盖系统剪贴板）、回归、CHANGELOG。

## 风险

- **R1 剪贴板被占用**：其他程序正占用剪贴板时 `OpenClipboard` 会失败。应对：短暂重试几次，仍失败则提示“剪贴板被占用，请重试”。
- **R2 大图片复制**：几十 MB 的图片经 IPC 传输较慢。应对：只在用户点击时读取，不预读。
- **R3 动态 GIF**：“复制图片”只有第一帧，已在规格中说明，需要原文件时用“复制图片文件”。

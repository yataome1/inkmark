# 实施计划：图片统一存放与缩放记忆

**分支**: `011-images-zoom` | **规格**: [spec.md](spec.md)

## 摘要

图片保存改由 Rust 计算 SHA-256 内容哈希命名，写入图片文件夹（默认 `%LOCALAPPDATA%\inkmark-images`，可在设置中更改），以 `file:///` 绝对地址插入。图片显示与导出时统一经 Rust 的 `resolve_image` 解析：原路径存在则用原路径，不存在且是哈希名时到图片文件夹按文件名查找。新增图片文件夹对话框、“导出可分享副本”和反向的“收入图片文件夹”。缩放改为每次变化写入设置，启动时恢复；`Ctrl+滚轮` 在前端处理。

## 调研结论

| 问题 | 结论 | 依据 |
|---|---|---|
| SHA-256 来源 | `sha2` 只是 `tauri-codegen`（编译期）的依赖，不在程序中；改用 Windows CNG 的 `BCryptHash`（`BCRYPT_SHA256_ALG_HANDLE` 伪句柄，Windows 10 起），声明一个外部函数 | `cargo tree -i sha2`，2026-11-10 |
| 哈希名格式 | SHA-256 前 32 位十六进制（128 位）+ 小写扩展名，正则 `^[0-9a-f]{32}\.(png|jpe?g|gif|webp|bmp|svg)$` | 个人使用场景下碰撞概率可忽略 |
| 默认位置 | `app.path().local_data_dir()` 即 `%LOCALAPPDATA%`，拼接 `inkmark-images` | Tauri 2 |
| WebView2 自带缩放 | 未开启（`zoom_hotkeys_enabled` 默认 false），`Ctrl+滚轮` 由前端处理不冲突 | `lib.rs` |
| 导出中的图片 | `renderDocument` 保留原地址；HTML 不设基准地址，PDF 以文档目录为基准 | `render.js`、`app.js` |
| 文档中的图片引用 | 从编辑器语法树取 `Image` 节点的 `URL` 子节点，位置精确，便于改写 | `@lezer/markdown` |

## 技术上下文

| 项 | 选择 |
|---|---|
| 涉及进程 | Rust（图片、设置、菜单）、前端 |
| 新增依赖 | 无（NFR-1101） |
| 测试 | `cargo test`：哈希命名、解析与查找、复制；`node --test`：缩放步进与范围、图片引用改写；CDP 验收 |

## 宪章检查

| 原则 | 结论 |
|---|---|
| I 规格先行 | ✅；同时在 001 的 FR-011 处注明被取代 |
| II 离线 | ✅ 网络图片不下载 |
| III Markdown 唯一真相 | ✅ 自动查找不改写文档；只有用户粘贴图片和导出副本时生成内容 |
| IV 不丢数据 | ✅ 文档写入走 `write_atomic`；更改图片文件夹只复制不删除 |
| V 安全默认 | ✅ asset 协议只授权图片文件夹与已打开文档目录；`resolve_image` 只返回图片扩展名的文件 |
| VI 简单 | ✅ 只新增图片文件夹一个设置项（规格要求） |
| VII 轻量 | ✅ 无依赖 |

## 变更文件

```
src-tauri/src/fileops.rs   改：sha256_hex（CNG）、hash_name、save_image 改为写入图片文件夹、resolve_image、copy_images
src-tauri/src/lib.rs       改：image_dir、image_folder / set_image_folder / open_image_folder、
                           allow_image 改为返回解析后的路径、copy_share_images、import_images、启动时授权图片文件夹
src-tauri/src/settings.rs  改：默认值 imageFolder: null、zoom: 1
src-tauri/src/menu.rs      改：文件 → 图片文件夹…、收入图片文件夹；导出 → 可分享副本…
src/image-folder.js        新：图片文件夹对话框
src/app.js                 改：imageUrl 使用解析后的路径；导出时改写图片地址；导出可分享副本；收入图片文件夹；
                           缩放保存与恢复、Ctrl+滚轮
src/platform.js、index.html、styles.css、shortcuts.js
test/zoom.test.js          新（缩放步进纯函数放在 text-utils.js）
specs/001-inkmark-mvp/spec.md   改：FR-011 注明被 011 取代
```

## 设计要点

### 图片保存

`save_image(dir, name, bytes)`：取扩展名（无则按 `png`），文件名 `hash_name(bytes, ext)`；文件已存在则不再写入；返回 `file_url(full)`。原来按文档目录决定位置的逻辑删除。图片文件夹不存在时：默认位置自动创建；用户设置的位置不存在则报错“图片文件夹不可用”。

### 图片解析（显示与导出共用）

```
resolve_image(path) -> Option<PathBuf>
  path 是图片扩展名且存在 → path
  文件名匹配哈希名，且 image_dir/文件名 存在 → 该文件
  否则 → None
```

- `allow_image(path)` 改为先 `resolve_image`，授权后返回解析出的路径；前端 `imageUrl` 用返回值生成 asset 地址。相对路径仍由 `Render.resolveImage` 按文档目录转为绝对路径后走同一流程。
- 导出 HTML、PDF：`renderDocument` 之后遍历 `<img>`，本地地址经 `resolve_image` 解析，找到的改写为 `file:///` 绝对地址。

### 图片文件夹设置

- 设置项 `imageFolder`（`null` 表示默认位置）。
- 对话框（应用内 `<dialog>`）：显示当前路径与是否为默认位置；按钮“更改…”“打开文件夹”“恢复默认”“关闭”。
- 更改：选择文件夹 → 测试写入 → 若原文件夹有图片，询问是否复制 → `set_image_folder(path, copy)` 返回复制与跳过数量。只复制顶层的图片文件，同名跳过，原文件不删。
- 每次设置或启动时，用 `allow_directory(dir, false)` 授权 asset 协议。

### 导出可分享副本

1. 选择目标 `.md` 路径（系统保存对话框会询问覆盖同名文档）。
2. 从语法树收集所有 `Image` 节点的地址与位置；网络地址跳过。
3. `copy_share_images(target, srcs)`：建立 `<文件名>.assets`（已存在时先询问），逐个解析并复制，重名时加序号，返回每项的相对路径或缺失标记。
4. 按位置从后往前替换地址，写入目标文件；状态栏提示复制与缺失数量。不改动原文档。

### 收入图片文件夹

1. 从语法树收集 `Image` 节点的地址与位置；网络地址跳过。相对地址按文档目录转为绝对路径；未保存的文档只处理绝对路径。
2. `import_images(paths)`：逐个解析；已在图片文件夹中的跳过；其余按内容哈希写入图片文件夹（已存在则不写），返回新的 `file:///` 地址或缺失标记。
3. 前端在一个事务中按位置替换所有地址（`isolateHistory`，一步撤销），不保存文件；状态栏提示收入、已存在、缺失数量。
4. “导出可分享副本”与“收入图片文件夹”共用图片引用收集与按位置替换的函数（放入 `text-utils.js`，可单元测试）。

### 缩放

- `stepZoom(current, direction)` 与范围限制作为纯函数放入 `text-utils.js`，菜单、快捷键、滚轮共用。
- `setZoom` 调用 `webview.setZoom` 后，防抖 300ms 写入 `zoom` 设置。启动时读取，无效值按 1。
- `Ctrl+滚轮`：在 `window` 上以捕获、非被动方式监听 `wheel`，`ctrlKey` 时 `preventDefault`；按 `deltaMode` 换算为像素后累计，绝对值达到 100 缩放一档并清零。

## IPC 契约变更

| 方法 | 方向 | 说明 |
|---|---|---|
| `save_image`、`save_image_from_path` | 前端 → Rust | 参数去掉 `doc_path`；返回图片文件夹中的 `file:///` 地址 |
| `allow_image(path)` | 前端 → Rust | 返回值改为解析后的路径（含自动查找） |
| `resolve_image(path)` | 前端 → Rust | 新增：只解析不授权，导出使用 |
| `image_folder()` | 前端 → Rust | 新增：`{ path, isDefault, exists, count }` |
| `set_image_folder(path, copy)` | 前端 → Rust | 新增：`path` 为 `null` 时恢复默认；返回 `{ copied, skipped }` |
| `open_image_folder()` | 前端 → Rust | 新增：在资源管理器中打开 |
| `copy_share_images(target, srcs)` | 前端 → Rust | 新增：返回每个地址对应的相对路径或 `null` |
| `import_images(paths)` | 前端 → Rust | 新增：收入图片文件夹，返回每个路径对应的新地址、`"exists"` 或 `null` |
| `set_settings` | 前端 → Rust | 新增键 `imageFolder`、`zoom` |

## 实施阶段

1. **图片存放与解析（US1、US2）**：CNG 哈希、保存、解析、授权、导出改写、Rust 测试。
2. **图片文件夹设置（US3）**：命令、对话框、菜单。
3. **导出可分享副本与收入图片文件夹（US4、US7）**。
4. **缩放（US5、US6）**。
5. **验证与文档**：完整回归、README、CHANGELOG、001 注明。

## 风险

- **R1 只识别 Markdown 图片语法**：`<img src>` HTML 标签和引用式图片定义 `[id]: path` 不在导出副本的改写范围内，导出后保留原地址；显示不受影响。
- **R2 CNG 伪句柄**：要求 Windows 10 及以上，项目只支持 Windows 11，满足。
- **R3 同步盘未就绪**：图片文件夹在同步盘上而同步未完成时，自动查找会失败，按图片丢失显示，同步完成后重新打开即可。
- **R4 旧的临时目录图片**：此前未命名文档的图片存在 `%TEMP%\inkmark-images`，路径存在时照常显示，不迁移。

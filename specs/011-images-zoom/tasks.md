# 任务清单：图片统一存放与缩放记忆

**输入**: [spec.md](spec.md)、[plan.md](plan.md)

## 阶段 1：图片存放与解析（US1、US2）

- [x] T1101 [US1] `fileops.rs`：CNG SHA-256、哈希命名、`save_image` 写入图片文件夹；Rust 测试
- [x] T1102 [US2] `fileops.rs`：`resolve_image` 自动查找；Rust 测试
- [x] T1103 [US1] `lib.rs`：`image_dir`、启动时授权、`allow_image` 返回解析路径、`resolve_image` 命令
- [x] T1104 [US1] `app.js`：粘贴与拖入改用新命令；`imageUrl` 使用解析路径；导出 HTML、PDF 改写图片地址

## 阶段 2：图片文件夹设置（US3）

- [x] T1105 [US3] `image_folder`、`set_image_folder`、`open_image_folder`；设置默认值
- [x] T1106 [US3] `src/image-folder.js` 对话框、菜单项

## 阶段 3：导出可分享副本与收入图片文件夹（US4、US7）

- [x] T1107 [US4] `copy_share_images`；前端收集图片引用、改写并写入；菜单项
- [x] T1113 [US7] `import_images`；前端一步撤销的地址替换；菜单项；图片引用收集与替换的单元测试

## 阶段 4：缩放（US5、US6）

- [x] T1108 [US5] 缩放步进纯函数与测试；`Ctrl+滚轮`；快捷键列表
- [x] T1109 [US6] 缩放保存与启动恢复

## 阶段 5：验证与文档

- [x] T1110 `npm run lint`、`npm test`、`cargo fmt --check`、`cargo clippy`、`cargo test`
- [x] T1111 按验收场景验证，记录于 `checklist.md`；多标签与“关于”回归
- [x] T1112 README、CHANGELOG；001 的 FR-011 注明被取代

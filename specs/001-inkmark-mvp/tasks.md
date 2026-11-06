# 任务清单：Inkmark MVP

**输入**: [spec.md](spec.md)、[plan.md](plan.md)
**格式**: `[ID] [P?] [Story] 描述` —— `[P]` 表示可与同阶段其他 `[P]` 任务并行（不同文件、无依赖）。

## 阶段 1：初始化
- [x] T001 初始化 npm 工程，安装 electron、electron-builder、vditor@3.11.2（锁定版本）
- [x] T002 [P] 配置 `package.json` 脚本（start / test / dist）与 electron-builder（NSIS x64 + portable、`.md` 文件关联）
- [x] T003 [P] 添加 `.gitignore`、`LICENSE`(MIT)、`README.md`、应用图标 `build/icon.ico`；ESLint/Prettier/EditorConfig、CI、Issue/PR 模板、`AGENTS.md` 全局约束

## 阶段 2：基础设施（阻塞所有用户故事）
- [x] T004 `src/main/store.js` 设置读写
- [x] T005 `src/main/fileops.js` 读文件、原子写入、目录列表、图片保存
- [x] T006 `src/preload/index.js` 按 IPC 契约暴露 `window.inkmark`
- [x] T007 `src/main/index.js` 窗口创建（安全选项、阻止导航）、单实例、IPC 注册、关闭拦截
- [x] T008 `src/renderer/text-utils.js` 字数统计、大纲解析纯函数 + `test/text-utils.test.js`

## 阶段 3：用户故事 1 + 2 —— 查看与编辑保存 (P1) 🎯 MVP
- [x] T009 [US1] `index.html` / `styles.css` 基础布局（侧边栏、编辑区、状态栏）
- [x] T010 [US1] `app.js` 离线初始化 Vditor（IR 模式、隐藏工具栏、本地 cdn、中文）
- [x] T011 [US1] 打开文件：命令行参数、单实例转发、拖放、菜单；相对图片 linkBase
- [x] T012 [US2] 新建 / 保存 / 另存为、dirty 标记、标题栏
- [x] T013 [US2] 未保存确认（关闭、打开、新建）
- [x] T014 [US2] `menu.js` 中文菜单；渲染进程快捷键分发（FR-012）与 `Ctrl+/` 源码模式
- [x] T015 [P] [US1] `resources/samples/demo.md` 覆盖全部渲染元素

## 阶段 4：用户故事 3–6 (P2)
- [x] T016 [US3] 侧边栏切换、大纲（点击定位、随编辑更新）
- [x] T017 [US3] 打开文件夹与文件树（懒加载）
- [x] T018 [US4] 专注模式、打字机模式、全屏、状态栏字数
- [x] T019 [US5] 主题：浅色 / 深色 / 跟随系统，持久化
- [x] T020 [US6] 图片粘贴/拖入保存到 `assets/`

## 阶段 5：用户故事 7–9 (P3)
- [x] T021 [US7] 查找栏与全部替换
- [x] T022 [US8] 导出 HTML / PDF
- [x] T023 [US9] 最近文件菜单；`Ctrl+单击` 链接

## 阶段 6：验证与发布
- [x] T024 运行 `npm test`；按 spec 验收场景逐条验证，记录于 `checklist.md`
- [ ] T025 `npm run dist` 生成 Windows x64 安装包与便携版
- [ ] T026 git 初始化、提交、推送到 GitHub

## 依赖
阶段 1 → 阶段 2 → 阶段 3 → 阶段 4/5（彼此独立）→ 阶段 6。

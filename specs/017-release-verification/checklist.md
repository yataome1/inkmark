# 验收检查：发布文件的校验和与构建证明

**版本**: 分支 `017-release-verification`（基于 `main` 362407e） | **日期**: 2026-11-15 | **环境**: macOS 15（Apple 芯片）

发布流程只在推送版本标签时运行，PR 中无法执行。下表中“发布后”的项要等下一个版本发布后核对。

| 场景 | 方式 | 结果 | 备注 |
|---|---|---|---|
| US1-1 每个安装文件旁有 `.sha256` | 发布后 | ⏳ | |
| US1-2 macOS 上 `shasum -a 256 -c` 显示 OK | 本地 + 发布后 | ✅ / ⏳ | 本地用与 `release-mac` 相同的命令生成并核对：OK |
| US1-3 Windows 上 PowerShell 核对显示 True | 发布后 | ⏳ | 本机无 PowerShell；Windows 任务写出的格式（小写哈希、两个空格、文件名、LF）已用同格式文件在 macOS 上以 `shasum -c` 核对：OK |
| US1-4 改动一个字节后核对失败 | 本地 | ✅ | 追加 1 字节后 `shasum -c` 报 FAILED，退出码 1 |
| US2-1 `gh attestation verify` 通过并给出提交 | 发布后 | ⏳ | |
| US2-2 内容不同的同名文件核对失败 | 发布后 | ⏳ | |
| US2-3 Attestations 页面可见 | 发布后 | ⏳ | |
| US3-1 README、README.en 有核对方法 | 审阅 | ✅ | “核对下载的文件” / “Verifying downloads” |
| US3-2 使用指南有核对方法 | 审阅 | ✅ | 常见问题“怎么确认下载的安装文件可信？”；菜单路径测试通过 |
| NFR-1702 安装文件不变 | 审阅 | ✅ | 新步骤都在体积检查之后，只读取安装文件 |

## 检查

- `npm run lint`、`npm test`（81 项）通过；`ci.yml` YAML 语法检查通过。
- `cargo fmt --check`、`cargo clippy --all-targets -- -D warnings`、`cargo test`（22 项）通过（macOS）；本规格未修改 Rust 代码。

## 使用指南

- [x] 本特性是否改变了使用指南中描述的操作？是：常见问题新增核对方法
- [x] 已同步更新英文版 `README.en.md`

## 未通过 / 未验证项

- 发布相关的场景（US1-1、US1-3、US2 全部）要等下一个版本发布后核对。

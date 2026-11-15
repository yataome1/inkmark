# 验收检查：发布文件的校验和与构建证明

**版本**: 实现于分支 `017-release-verification`（PR #3）；发布后核对 v0.9.1（提交 8684a2d） | **日期**: 2026-11-15 | **环境**: macOS 15（Apple 芯片）

发布流程只在推送版本标签时运行，PR 中无法执行；“发布后”的项在 v0.9.1 发布后核对。本机网络环境拦截 `.exe` 下载（返回 403 拦截页），两个 Windows 安装文件无法下载到本机，改为核对 GitHub 记录的文件摘要。

| 场景 | 方式 | 结果 | 备注 |
|---|---|---|---|
| US1-1 每个安装文件旁有 `.sha256` | 发布后 | ✅ | v0.9.1 Release 共 6 个文件：3 个安装文件各有同名 `.sha256` |
| US1-2 macOS 上 `shasum -a 256 -c` 显示 OK | 发布后 | ✅ | 下载 `Inkmark-0.9.1-universal.dmg` 与其 `.sha256`：OK |
| US1-3 Windows 上 PowerShell 核对显示 True | 发布后 | ⏳ | 未在 Windows 上执行。两个 `.exe` 的 `.sha256` 内容与 GitHub 为该文件记录的 SHA-256 摘要一致；格式（小写哈希、两个空格、文件名）与 macOS 相同 |
| US1-4 改动一个字节后核对失败 | 发布后 | ✅ | v0.9.1 的 `.dmg` 追加 1 字节后 `shasum -c` 报 FAILED，退出码 1 |
| US2-1 `gh attestation verify` 通过并给出提交 | 发布后 | ✅ / ⏳ | `.dmg`：通过，来源 `yataome1/inkmark`、`refs/tags/v0.9.1`、提交 8684a2d、`ci.yml`。两个 `.exe` 未能下载，未执行该命令；按 GitHub 记录的摘要查询，各有 1 条构建证明 |
| US2-2 内容不同的同名文件核对失败 | 发布后 | ✅ | 改动 1 字节的 `.dmg`：`gh attestation verify` 退出码 1（找不到该摘要的证明） |
| US2-3 Attestations 页面可见 | 发布后 | ✅ | 仓库 Attestations 页面列出 v0.9.1 的两条证明：`.dmg`（1 个文件）、两个 `.exe`（2 个文件），均由 `ci.yml@refs/tags/v0.9.1` 生成 |
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

- US1-3：未在 Windows 上用 PowerShell 实际核对。
- US2-1：两个 `.exe` 未在本机执行 `gh attestation verify`（无法下载），只确认了 GitHub 上存在对应摘要的构建证明。

# 安全策略

## 支持的版本

仅最新发布版本接收安全修复。

## 报告漏洞

请**不要**通过公开 Issue 报告安全漏洞。请使用 GitHub 的 [私密漏洞报告](https://github.com/yataome1/inkmark/security/advisories/new)，并附上：

- 受影响的版本
- 复现步骤（如能触发问题的 Markdown 文件）
- 可能造成的影响

我们会在 7 天内回复。

## 安全设计

- 渲染进程启用 `contextIsolation` 与 `sandbox`，禁用 `nodeIntegration`，仅通过 preload 暴露最小接口。
- 页面设置 CSP，禁止加载远程脚本。
- 应用窗口禁止导航；文档中的 http(s) 链接只在系统浏览器打开。
- 不收集任何遥测数据，不进行网络请求。

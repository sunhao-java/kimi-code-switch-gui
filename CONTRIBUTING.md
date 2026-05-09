# Contributing to Kimi Code Switch GUI

感谢你愿意参与 `Kimi Code Switch GUI` 的开发。这个项目服务于 `kimi-code-cli` 用户，核心目标是让配置管理更安全、更清晰、更适合长期维护。

本文档说明如何准备环境、提交变更、运行验证，以及什么样的贡献更容易被合并。

## 可以贡献什么

欢迎以下类型的贡献：

- 修复配置读写、预览、Diff、备份、恢复、MCP 或 Skills 管理中的问题。
- 改进交互体验、视觉一致性、无障碍访问和多语言文案。
- 增加配置安全检查、边界场景测试和错误提示。
- 补充 README、使用指南、故障排查和开发文档。
- 优化构建、测试、发布流程。

如果你计划做较大的功能或架构调整，建议先创建 Issue 说明背景、目标和方案，避免重复工作或方向不一致。

## 开发环境

要求：

- Node.js 22
- npm 10+
- macOS 或 Windows

安装依赖：

```bash
npm ci
```

启动桌面开发环境：

```bash
npm run dev:electron
```

仅启动前端开发服务器：

```bash
npm run dev
```

## 项目结构

```text
src/main/       Electron 主进程、窗口生命周期、托盘、IPC、备份、更新检查
src/preload/    preload bridge，向渲染进程暴露受控 API
src/renderer/   React UI、样式、页面状态和交互逻辑
src/shared/     配置模型、序列化、状态转换、校验和单元测试
resources/      应用图标与托盘资源
```

通常：

- UI 变更主要在 `src/renderer/src/`。
- 配置模型、解析、序列化和校验变更主要在 `src/shared/`。
- Electron 窗口、托盘、文件访问和 IPC 变更主要在 `src/main/` 与 `src/preload/`。

## 开发流程

建议按下面步骤工作：

1. 从最新 `master` 创建分支。
2. 明确本次变更只解决一个问题或一组强相关问题。
3. 先阅读相邻实现，保持现有代码风格。
4. 修改代码。
5. 补充或更新测试。
6. 运行验证命令。
7. 提交 Pull Request。

示例：

```bash
git checkout master
git pull
git checkout -b feat/appearance-theme
```

## 代码风格

项目使用 TypeScript、React 和 Electron。请保持以下约定：

- 2 空格缩进。
- 使用分号。
- 使用双引号。
- React 组件和类型使用 PascalCase。
- 工具函数使用 camelCase。
- 公共/shared API 尽量保留明确类型。
- 优先小函数和直接实现，避免过早抽象。
- 遵循现有文件命名和模块边界。

业务逻辑尽量放在可测试的 shared 层或独立函数中，渲染层负责组合 UI 和交互。

## 测试要求

提交前至少运行：

```bash
npm test
npm run build
```

涉及 `src/shared/` 的变更，应尽量补充单元测试，尤其是：

- 配置解析和默认值。
- TOML / JSON 序列化。
- 状态转换。
- 引用校验。
- 错误和边界条件。

涉及 UI 的变更，应至少完成本地手动验证，并在 PR 中说明验证过的场景。

## 配置与安全注意事项

不要提交以下内容：

- 真实 API Key。
- WebDAV 密码。
- 私有 MCP Header。
- 个人机器上的 `~/.kimi/` 配置文件。
- `out/`、`release/` 等构建产物。

预览出来的 TOML / JSON 可能包含敏感配置。提交 Issue 或截图时，请先脱敏。

## Pull Request 指南

PR 描述建议包含：

- 变更目的。
- 主要实现点。
- 影响范围。
- 测试结果，例如 `npm test`、`npm run build`。
- UI 变更截图或录屏。
- 相关 Issue 链接。

推荐格式：

```markdown
## Summary
- ...

## Test
- [ ] npm test
- [ ] npm run build

## Screenshots
...
```

## Commit Message

推荐使用 Conventional Commit 风格：

- `feat:` 新功能
- `fix:` 修复问题
- `docs:` 文档变更
- `style:` 纯样式或格式调整
- `refactor:` 重构
- `test:` 测试
- `chore:` 工程维护

示例：

```bash
git commit -m "feat: add appearance theme selector"
git commit -m "fix: prevent light theme startup flash"
git commit -m "docs: add contributing guide"
```

## Issue 建议

提交 Bug 时，请尽量提供：

- 操作系统和版本。
- 应用版本。
- 安装方式：Homebrew、手动安装或开发构建。
- 复现步骤。
- 实际结果和期望结果。
- 截图、日志或脱敏后的配置片段。

提交功能建议时，请说明：

- 具体使用场景。
- 目前的痛点。
- 期望的交互或输出。
- 是否会影响现有配置文件格式。

## 发布协作

发布由维护者处理。版本 tag 使用三段式格式：

```text
vX.Y.Z
```

发布前通常需要：

1. 更新 `CHANGELOG.md`。
2. 更新 README 中的当前版本。
3. 更新应用关于页版本相关内容。
4. 运行测试和构建。
5. 创建版本 tag 并推送。

## 行为准则

请保持讨论聚焦事实、问题和可验证方案。不同意见应围绕代码质量、用户价值、维护成本和安全性展开。

不接受人身攻击、歧视、骚扰、泄露隐私或发布敏感凭据。

# Kimi Code Switch GUI

`Kimi Code Switch GUI` 是面向 `kimi-code-cli` 用户的桌面配置工作台。它把分散在多个 TOML / JSON 文件里的 Provider、Model、Profile、MCP Server、Skills、快捷键、备份和面板偏好，收敛成一个可视化操作界面，帮助用户更安全、更高效地维护本地 AI 编程工作流。

这个项目的目标不是简单替代表单编辑器，而是降低长期维护 `kimi-code-cli` 配置的成本：

- 减少手改配置文件带来的格式错误和引用错误。
- 让多 Provider、多模型、多 Profile 的切换变成明确的业务操作。
- 在写入前提供预览、Diff 和配置体检，避免“改完才发现不可用”。
- 把 MCP、Skills、快捷键和备份这些高频配套能力统一到一个桌面入口。

## 适合谁使用

如果你有下面任意需求，这个工具会比较合适：

- 同时维护多个 `kimi-code-cli` Provider，例如官方 API、网关、代理或内部服务。
- 经常在不同模型、不同默认参数、不同 Profile 之间切换。
- 需要统一管理 MCP Server，而不是手工编辑 `~/.kimi/mcp.json`。
- 希望快速查看本机 Skills 来源、启用状态、覆盖关系和详情内容。
- 希望为 CLI 配置建立本地或 WebDAV 备份，并能在出错时回滚。
- 希望用桌面应用完成配置预览、差异检查、快捷键管理、状态栏切换和更新检查。

## 核心能力

### 配置工作台

- 管理 `providers`、`models`、`profiles` 和 `mcpServers`。
- 激活 Profile 时同步更新主配置默认项。
- 支持新增、克隆、删除、重命名和引用关系校验。
- 自动生成并维护：
  - `~/.kimi/config.toml`
  - `~/.kimi/config.profiles.toml`
  - `~/.kimi/config.panel.toml`
  - `~/.kimi/mcp.json`

### 安全写入与可观测性

- 写入前可预览 TOML / JSON 输出。
- 支持配置 Diff 查看和内容复制。
- 内置配置体检，用于发现引用缺失、冲突和潜在风险。
- 对外部文件变更进行快照检测，避免覆盖其他工具正在修改的配置。

### MCP 与 Skills 管理

- 支持导入 MCP JSON。
- 支持测试 MCP 服务、触发授权和重置授权。
- 支持查看 Skills 来源、启用状态、覆盖关系和详细内容。
- Skills 支持网格 / 列表视图、搜索、复制和自适应分页。

### 备份与恢复

- 支持手动备份、定时备份、修改后备份。
- 支持本地目录和 WebDAV 作为备份目标。
- 备份内容覆盖主配置、Profile、面板设置、MCP 配置和快捷键。
- 支持查看、删除和恢复备份记录。

### 桌面体验

- 支持中文 / 英文双语界面。
- 支持外观模式、主题配色、字体大小、启动显示器策略等偏好设置。
- 支持状态栏 / 托盘入口，可快速切换 Profile、语言和外观模式。
- 支持全局快捷键和窗口快捷键录制、启停、重置与冲突提示。
- 关于页支持检查 GitHub Release 更新，并根据 Homebrew / 手动安装 / 开发构建给出不同提示。

## 配置文件说明

### `config.toml`

`kimi-code-cli` 主配置文件，保存当前生效的默认模型、Provider、Model 定义以及其他 CLI 配置。

### `config.profiles.toml`

保存所有可切换的 Profile，以及当前激活的 `active_profile`。

### `config.panel.toml`

保存 GUI 面板自身设置，例如语言、外观模式、主题配色、字体大小、配置路径、托盘开关、关闭行为、显示器打开策略、备份策略和快捷键。

### `mcp.json`

保存 MCP Server 定义，包括远程 `url` / `headers`，或本地 `command` / `args` / `env` 配置。

## 技术栈

- Electron
- React 18
- TypeScript
- Vite / electron-vite
- Vitest
- electron-builder

## 目录结构

```text
.
├── src/main                # Electron 主进程、窗口、托盘、IPC、备份和发布检查
├── src/preload             # preload bridge，暴露安全 API 给渲染进程
├── src/renderer            # React UI、样式、i18n、页面交互
├── src/shared              # 配置模型、序列化、状态转换、校验和单元测试
├── resources               # 应用图标与托盘资源
└── .github/workflows       # GitHub Release 工作流
```

## 环境要求

- Node.js 22
- npm 10+
- macOS 或 Windows

> macOS 安装包建议在 macOS 上构建，Windows 安装包建议在 Windows 上构建。

## 本地运行

安装依赖：

```bash
npm ci
```

启动 Electron 开发环境：

```bash
npm run dev:electron
```

仅启动前端开发服务器：

```bash
npm run dev
```

## 测试与构建

运行单元测试并生成覆盖率：

```bash
npm test
```

监听模式：

```bash
npm run test:watch
```

构建应用：

```bash
npm run build
```

生成发行产物：

```bash
npm run dist
```

按平台构建：

```bash
npm run dist:mac
npm run dist:win
```

默认输出目录为 `release/`。

## 发布流程

仓库内置 [`.github/workflows/release.yml`](.github/workflows/release.yml)。

推送形如 `v1.0.0` 的 tag 后，工作流会：

1. 安装依赖并运行测试。
2. 创建或复用同名 GitHub Release。
3. 在 macOS runner 上构建 `dmg` / `zip`。
4. 在 Windows runner 上构建 `nsis` / `portable`。
5. 生成 SHA256 校验文件。
6. 上传 workflow artifact。
7. 将安装包和校验文件发布到 GitHub Release。

## 参与开发

如果你希望修复问题、补充功能或改进文档，请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 当前版本

- 应用版本：`1.1.1`
- 变更记录见 [CHANGELOG.md](CHANGELOG.md)

## 许可证

MIT

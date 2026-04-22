# Kimi Code Switch GUI

`Kimi Code Switch GUI` 是一个面向 `kimi-code-cli` 的桌面配置控制台。它不是简单把 TOML 文件搬进表单，而是把 `Provider`、`Model`、`Profile`、`MCP Server` 和面板设置统一收敛到一个可视化工作台里，适合长期维护多套配置、频繁切换默认模型、排查配置差异以及管理本地 / WebDAV 备份。

应用会同时管理和生成以下四个配置文件：

- `~/.kimi/config.toml`
- `~/.kimi/config.profiles.toml`
- `~/.kimi/config.panel.toml`
- `~/.kimi/mcp.json`

项目延续了 `kimi-code-switch` 的配置语义，并在桌面侧补齐了实时保存、配置预览、Diff 查看、状态栏快捷操作、显示器打开策略、MCP 导入与测试、备份恢复和双语界面等能力。

## 功能概览

- 管理 `providers`、`models`、`profiles`、`mcpServers`
- 激活 Profile 时同步更新主配置默认项
- 预览 `config.toml`、`config.profiles.toml`、`config.panel.toml`、`mcp.json`
- 查看配置差异，并在查看面板中直接复制文件内容
- 导入 MCP JSON，测试 MCP 服务，触发授权或重置授权
- 设置备份策略，支持本地目录和 WebDAV 备份、查看、删除、恢复
- 支持主题、语言、配置路径、关闭行为、显示器启动策略等面板设置
- 可选状态栏 / 托盘图标，支持快捷操作与 Profile 快速切换
- 中文 / 英文双语界面
- 关于页内置 GitHub、Issue、博客、版本历史等信息
- 基于 `electron-builder` 生成 macOS / Windows 安装包
- GitHub Actions 在推送 `v*` tag 后自动测试、构建并发布 Release

## 适用场景

- 本地维护多套 `kimi-code-cli` Provider 配置
- 在不同模型之间快速切换默认配置
- 为不同使用习惯准备独立 Profile
- 在写入配置前先确认 TOML / JSON 输出和变更 Diff
- 需要统一管理 MCP 配置，而不是手工维护 `mcp.json`
- 希望通过桌面应用而不是手改配置文件来管理 CLI 设置
- 希望给当前配置建立本地或远端备份，并在需要时回滚

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
├── src/main                # Electron 主进程
├── src/preload             # preload API
├── src/renderer            # React 渲染进程
├── src/shared              # 配置模型、序列化、预览与测试
├── resources               # 应用图标与托盘资源
└── .github/workflows       # Release 工作流
```

## 环境要求

- Node.js 22
- npm 10+
- macOS 或 Windows（开发阶段在 macOS 上打包 macOS 安装包，在 Windows 上打包 Windows 安装包）

## 本地开发

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

## 测试

运行单元测试并生成覆盖率：

```bash
npm test
```

监听模式：

```bash
npm run test:watch
```

## 打包

构建应用：

```bash
npm run build
```

构建全部发行产物：

```bash
npm run dist
```

仅构建 macOS：

```bash
npm run dist:mac
```

仅构建 Windows：

```bash
npm run dist:win
```

默认输出目录为 `release/`。

## 发布流程

仓库内置了 [`.github/workflows/release.yml`](.github/workflows/release.yml)。

推送形如 `v1.0.0` 的 tag 后，工作流会执行：

1. 在 Ubuntu 上安装依赖并运行测试
2. 创建或复用同名 GitHub Release
3. 在 macOS runner 上构建 `dmg` / `zip`
4. 在 Windows runner 上构建 `nsis` / `portable`
5. 生成 SHA256 校验文件
6. 上传 workflow artifact
7. 将安装包和校验文件发布到 GitHub Release

## 配置文件说明

### `config.toml`

主配置文件，保存当前生效的默认模型、Provider、Model 定义以及其他 CLI 配置。

### `config.profiles.toml`

保存所有可切换的 Profile，以及当前激活的 `active_profile`。

### `config.panel.toml`

保存 GUI 面板本身的设置，包括：

- 配置路径
- Profile 路径
- MCP 配置路径
- 语言
- 主题
- 托盘开关
- 关闭行为
- 窗口打开显示器策略
- 备份策略与备份目标

### `mcp.json`

保存 MCP Server 定义，包括远程 `url` / `headers`，或本地 `command` / `args` / `env` 配置。

## 当前版本

- 应用版本：`1.0.3`
- 变更记录见 [CHANGELOG.md](CHANGELOG.md)

## 许可证

MIT

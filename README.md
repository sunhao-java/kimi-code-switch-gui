# Kimi Code Switch GUI

`Kimi Code Switch GUI` 是一个基于 Electron + React + TypeScript 的桌面工具，用来可视化管理 `kimi-code-cli` 的配置文件，重点解决多 Provider、多 Model、多 Profile 的切换和校验问题。

它围绕以下三个文件工作：

- `~/.kimi/config.toml`
- `~/.kimi/config.profiles.toml`
- `~/.kimi/config.panel.toml`

项目延续了 `kimi-code-switch` 的配置语义，并补上了桌面图形界面、预览 Diff、状态栏快捷切换、双语界面和安装包发布流程。

## 功能概览

- 管理 `providers`、`models`、`profiles`
- 激活 Profile 时同步更新主配置默认项
- 预览三份 TOML 文件的生成结果和 Diff
- 中文 / 英文双语界面
- 支持主题、配置路径、Profile 路径、关闭行为等面板设置
- 可选状态栏 / 托盘图标，并支持直接切换 Profile
- 记忆上次显示器，或按活动显示器 / 随机显示器打开窗口
- 关于页内置 GitHub、Issue、作者博客外链
- 基于 `electron-builder` 生成 macOS / Windows 安装包
- GitHub Actions 在推送 `v*` tag 后自动测试、构建并发布 Release

## 适用场景

- 本地维护多套 `kimi-code-cli` Provider 配置
- 在不同模型之间快速切换默认配置
- 为不同使用习惯准备独立 Profile
- 在写入配置前先确认 TOML 输出和变更 Diff
- 希望通过桌面应用而不是手改配置文件来管理 CLI 设置

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

推送形如 `v0.1.0` 的 tag 后，工作流会执行：

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
- 语言
- 主题
- 托盘开关
- 关闭行为
- 窗口打开显示器策略

## 当前版本

- 应用版本：`0.1.0`
- 变更记录见 [CHANGELOG.md](CHANGELOG.md)

## 许可证

MIT

# 变更日志

本文件记录项目的重要变更。

格式参考 Keep a Changelog，当前项目采用 `major.minor.patch` 版本号方案。

## [1.0.1] - 2026-04-21

### 变更

- 优化设置页分组、顶部统计卡片、首页总览列表和自定义下拉展示样式。
- 增强 MCP 管理流程，支持 JSON 导入、启用/禁用持久化、面板保留与配置文件过滤。
- 替换应用、托盘和前端展示用品牌 Logo 资源，统一为新的透明亮色/暗色图片，并重建 macOS `icon.icns`。
- Homebrew cask 生成脚本新增 macOS 隔离属性导致的启动异常提示。

## [1.0.0] - 2026-04-20

### 修复

- 修复 GitHub Actions 发布流程中 `electron-builder` 因 tag 构建触发隐式发布而导致 macOS 和 Windows 安装包任务失败的问题。
- 调整 Release 工作流中的 GitHub Release 认证与仓库定位方式，避免 `gh release` 依赖本地 `.git` 上下文。

### 新增

- 初始版本 Electron 桌面应用，用于管理 `kimi-code-cli` 配置文件。
- Provider、Model、Profile 的可视化编辑与管理流程。
- 激活 Profile 时自动将默认项同步回 `config.toml`。
- 对 `config.toml`、`config.profiles.toml`、`config.panel.toml` 的预览支持。
- 在保存前查看配置变更 Diff。
- 中文和英文双语界面支持。
- 状态栏 / 托盘集成，并可直接切换 Profile。
- 基于记忆显示器、当前活动显示器或随机显示器的窗口打开策略。
- 关于页中的仓库、Issue 和作者链接。
- 面向 macOS 和 Windows 的 Electron Builder 安装包构建能力。
- 基于 `v*` 标签触发的 GitHub Actions 发布流水线。

### 测试

- 为共享配置存储逻辑补充了 Vitest 覆盖。

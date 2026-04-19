# 变更日志

本文件记录项目的重要变更。

格式参考 Keep a Changelog，当前项目采用 `major.minor.patch` 版本号方案。

## [1.0.0] - 2026-04-19

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

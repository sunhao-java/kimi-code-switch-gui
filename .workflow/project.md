# Project: kimi-code-switch-gui

## What This Is

Tauri v2 (Rust + 系统 WebView) 桌面应用，为 kimi-code-cli 提供可视化配置管理界面。用户可以通过 GUI 管理 providers、models、profiles、MCP servers、skills，无需手动编辑 TOML 配置文件。面向使用 kimi-cli 的开发者。

## Core Value

让开发者一键切换 kimi-cli 的 provider/model/profile 配置，所见即所得地管理复杂的多环境 AI 编码工具链。

## Requirements

### Validated

- [x] TOML 配置文件读写（config.toml, config.profiles.toml, config.panel.toml, mcp.json）
- [x] Provider/Model/Profile CRUD 管理
- [x] MCP Server 配置管理
- [x] Skills 扫描与展示
- [x] 多语言支持（zh-CN, en-US, ja-JP, de-DE, es-ES, zh-TW）
- [x] 暗色/亮色主题 + 4 种主题色
- [x] 全局搜索 + 快捷键系统
- [x] Profile 快速切换 + 在终端打开
- [x] 配置导入/导出
- [x] 变更历史记录
- [x] 备份与恢复（本地 + WebDAV）
- [x] 用量洞察 Dashboard（日志解析 + SQLite 存储 + 趋势/分组/会话分析）

### Active

- [ ] 趋势图升级为 recharts 交互式图表
- [ ] 成本估算（基于 provider 定价）
- [ ] Tray 菜单洞察快捷入口

### Out of Scope

- 云端数据上报 — 隐私优先，所有数据本地存储
- 多用户/团队维度 — 单用户桌面工具
- 持久化 Prompt/Response 全文 — 存储成本过高
- 替代 Provider 官方账单 — 仅做使用量参考

## Context

项目采用薄 Rust 壳 + 前端业务逻辑架构：`src-tauri` 暴露 Rust 命令（文件 IO、系统集成、SQLite、托盘），`src/renderer` 是 React SPA 及其 Tauri 适配层，`src/shared` 承载零依赖的纯业务逻辑。配置文件存储在 `~/.kimi/` 目录。使用 `@iarna/toml` 解析 TOML，用量数据由 Rust 后端经 `rusqlite` 存入 SQLite。UI 使用自定义 CSS 变量系统（tokens.css + components.css + layout.css），不依赖 Tailwind。

## Constraints

- **平台**: macOS 优先（Terminal/iTerm2 集成），Windows 基础支持
- **性能**: 启动时间 < 2s，配置保存 < 500ms
- **兼容性**: 不破坏 kimi-cli 的配置格式，GUI 写入的 TOML 必须被 CLI 正确解析
- **隐私**: 零网络上报，所有数据留在本地

## Tech Stack

- **Runtime**: Tauri v2 + Rust + 系统 WebView
- **Frontend**: React 18 + TypeScript 5.8
- **Build**: Tauri CLI + Vite (vite.config.ts → dist/)
- **Storage**: @iarna/toml (配置) + Rust rusqlite (用量，SQLite 由 Rust 后端提供)
- **Icons**: Lucide React
- **Test**: Vitest + jsdom

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| 日志解析替代 MITM 代理 | 不影响系统网络配置，零侵入 | 已实施 |
| 纯函数 configStore | 可测试性 + 无副作用 | 已实施 |
| FileAccess 抽象 | 测试时用内存 FS，生产用真实 FS | 已实施 |
| CSS 变量系统 | 主题切换简单，不引入 Tailwind 依赖 | 已实施 |
| 薄 Rust 壳 + 前端业务逻辑 | Rust 仅暴露 IO/系统集成原语，src/shared 业务逻辑在渲染层复用 | 已实施 |

## Stakeholders

- kimi-cli 用户（开发者）

---
*Last updated: 2026-05-24 after initialization*

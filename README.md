# Kimi Code Switch GUI

面向 `kimi-code-cli` 的桌面配置工作台。它把 Provider、Model、Profile、MCP、Skills、快捷键、备份和面板偏好集中到一个可视化界面里，减少手写 TOML / JSON 配置的风险。

![总览](docs/images/总览.png)

## 为什么需要它

`kimi-code-cli` 的能力很强，但长期维护多套 Provider、模型和 Profile 时，配置文件会逐渐变复杂。这个工具的目标是把“改配置文件”变成明确、可预览、可回滚的桌面操作。

- 不再手动修改多个配置文件，降低格式错误和引用错误。
- 一处维护 Provider、Model、Profile、MCP Server 和 Skills。
- 写入前可预览、看 Diff、做配置体检，避免覆盖外部修改。
- 支持本地 / WebDAV 备份，出错时可以恢复。
- 支持状态栏、快捷键、主题、语言、更新检查和在终端打开 Kimi。

## 核心页面

### Profiles

管理不同工作场景下的默认模型、Thinking、YOLO、Plan Mode、Thinking Stream 和 Skills 合并策略。激活 Profile 后会同步更新 `kimi-code-cli` 主配置。

![Profiles](docs/images/Profiles.png)

常用能力：

- 新增、克隆、删除、重命名 Profile。
- 一键激活 Profile。
- 测试当前 Profile 连通性。
- 在顶部“当前激活”区域直接用已激活 Profile 打开 Kimi。
- 在 Profiles 列表行悬浮后，可用被点击的 Profile 打开 Kimi，不会改变当前激活状态。

### Providers

集中维护所有模型供应方，例如 Kimi 官方 API、OpenAI 兼容网关、内部代理或其他兼容服务。

![Providers](docs/images/Providers.png)

常用能力：

- 配置 Provider 类型、Base URL 和 API Key。
- 支持新增、克隆、删除和重命名。
- 删除前检查是否仍被 Model 引用。

### Models

将模型定义从 Provider 中拆出来独立维护，便于多个 Profile 复用同一模型。

![Models](docs/images/Models.png)

常用能力：

- 配置 Provider、模型 ID、上下文长度和能力标签。
- 自动维护模型命名规则。
- 删除前检查是否仍被 Profile 或当前默认模型引用。

### MCP

可视化维护 `~/.kimi/mcp.json`，支持远程 MCP 和本地命令式 MCP。

![MCP](docs/images/MCP.png)

常用能力：

- 支持 `streamable-http`、`sse`、`stdio`。
- 支持导入 MCP JSON。
- 支持测试连接、触发授权、重置授权。
- 支持 headers、command、args、env 等配置。

### Skills

扫描本机 Skills 来源，查看启用状态、覆盖关系和具体内容。

![Skills](docs/images/Skills.png)

常用能力：

- 支持技能名称、描述检索。
- 支持网格 / 列表视图。
- 列表模式会根据可视区域自动分页。
- 可查看 Skill 内容、路径来源和覆盖关系。

### 设置

设置页收纳界面偏好、快捷键、备份、配置体检等全局能力。

![设置](docs/images/设置.png)

常用能力：

- 语言、外观模式、主题配色、字体大小。
- 状态栏图标、关闭按钮行为、启动显示器策略。
- 终端应用选择：系统终端或 iTerm2。
- 全局快捷键和窗口内快捷键录制、启停、冲突提示。
- 本地 / WebDAV 备份，支持手动、定时、修改后备份。
- 配置体检，发现缺失引用、风险配置和路径问题。

## 配置文件

应用会维护下面几类文件：

```text
~/.kimi/config.toml
~/.kimi/config.profiles.toml
~/.kimi/.panel/config.panel.toml
~/.kimi/mcp.json
```

说明：

- `config.toml`：`kimi-code-cli` 主配置，保存当前生效的默认模型、Provider、Model 和其他 CLI 配置。
- `config.profiles.toml`：保存所有 Profile，以及当前激活的 `active_profile`。
- `config.panel.toml`：保存 GUI 自身设置，例如语言、主题、快捷键、备份策略和终端应用。
- `mcp.json`：保存 MCP Server 定义。

## 终端启动

应用支持从界面直接打开 Kimi：

- 顶部“当前激活”卡片里的终端按钮：使用当前已激活的 Profile。
- Profiles 列表行里的终端按钮：使用鼠标悬浮行对应的 Profile，不改变当前激活 Profile。
- 终端类型可在设置页选择 `系统终端` 或 `iTerm2`。

启动时会生成临时配置文件，并执行：

```bash
kimi --config-file <临时配置文件>
```

临时配置位于：

```text
~/.kimi/.panel/tmp/terminal/
```

## 备份与恢复

支持两类备份目标：

- 本地目录。
- WebDAV 远端目录。

支持三种备份策略：

- 手动备份。
- 定时自动备份。
- 修改后自动备份。

备份文件包含主配置、Profiles、面板设置、MCP 配置和快捷键。恢复前会创建回滚点，避免误恢复后无法回退。

## 安装与运行

### 环境要求

- Node.js 22+
- npm 10+
- macOS 或 Windows

### 本地开发

```bash
npm ci
npm run dev:electron
```

### 测试

```bash
npm test
```

### 构建

```bash
npm run build
```

### 打包

```bash
npm run dist
```

按平台打包：

```bash
npm run dist:mac
npm run dist:win
```

构建产物默认输出到 `release/`。

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
├── src/main                # Electron 主进程、窗口、托盘、IPC、备份和更新检查
├── src/preload             # preload bridge，暴露安全 API 给渲染进程
├── src/renderer            # React UI、样式、i18n、页面交互
├── src/shared              # 配置模型、序列化、状态转换、校验和单元测试
├── docs/images             # README 截图资源
├── resources               # 应用图标与托盘资源
└── .github/workflows       # GitHub Release 工作流
```

## 发布流程

仓库内置 [`.github/workflows/release.yml`](.github/workflows/release.yml)。

推送形如 `v1.1.5` 的 tag 后，工作流会安装依赖、运行测试、构建 macOS / Windows 安装包、生成 SHA256 校验文件，并上传到 GitHub Release。

## 当前版本

- 应用版本：`1.1.5`
- 变更记录：[CHANGELOG.md](CHANGELOG.md)

## 参与开发

贡献代码前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

MIT

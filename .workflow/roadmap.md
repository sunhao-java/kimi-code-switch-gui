# Roadmap: kimi-code-switch-gui

## Overview

v2.0.0 完成 Electron→Tauri v2 架构重写后，产品进入"巩固地基 → 解除分发摩擦 → 增值与抗上游漂移"的演进路径。本 roadmap 分三个里程碑：先补齐迁移引入的质量盲区与陈旧文档（对内堵风险），再消除 macOS 未签名导致的获客摩擦并兑现 Insights 成本估算（对外解摩擦），最后做 Insights 交互升级与上游兼容韧性（长期价值）。每个里程碑遵循最小 phase 原则，单 phase 内用 wave DAG 并行推进。

## Roadmap Decisions

| # | Decision | Choice | Source |
|---|----------|--------|--------|
| 1 | Mode | Create（无现存 roadmap） | code |
| 2 | Requirement scope | Phased（三里程碑，按影响×紧迫排序） | user |
| 3 | Decomposition strategy | Progressive（MVP=善后 → Usable=分发+成本 → Refined=增值+韧性），层映射到 Milestone | user |
| 4 | Milestone boundaries | M1 善后 / M2 分发+Insights一期 / M3 Insights二期+韧性 | user |
| 5 | Phases per milestone | 各 1 phase（同关注点、可并行，无硬依赖触发拆分） | default(min-phase) |
| 6 | 文档同步范围 | project.md + specs/arch 均陈旧（仍写 Electron），并入 M1 | code |

## Milestones

### Milestone 1: 迁移善后 (v2.0.x)
**Target**: 补齐 v2.0.0 Tauri 迁移引入的测试盲区、命令桥验证缺口与陈旧文档，把地基夯实。
**Status**: active

#### Phases

- [ ] **Phase 1: 迁移层质量加固** — 适配层补测+覆盖率门禁扩展+命令桥集成测试+知识文档同步

#### Phase Details

##### Phase 1: 迁移层质量加固
**Goal**: 消除迁移引入的质量风险——让前端适配层与 Rust 命令桥有测试保护，并修正与现实矛盾的项目知识文档。
**Depends on**: Nothing (first phase)
**Requirements**: REQ-101, REQ-102, REQ-103
**Success Criteria** (what must be TRUE):
  1. `src/renderer/src/tauri/*` 适配层（usageDb/webdav/backup/tray/cli/terminal/fileSnapshots 等）有单元测试，覆盖率门禁从仅 `configStore.ts` 扩展到 `src/renderer/src/tauri/**`
  2. 23 个 Rust tauri 命令具备可运行的集成/契约测试，迁移正确性不再只靠手测
  3. `.workflow/project.md` 与 `.workflow/specs/` 架构约束更新为 Tauri v2 架构（不再出现 Electron/electron-vite/IPC/preload 描述）
  4. `npm test` 全绿，新门禁在 CI 的 test job 中生效

---

### Milestone 2: 分发体验 + Insights 一期 (v2.1)
**Target**: 解除 macOS 未签名导致的"已损坏"获客摩擦，并把 Insights 从"看用量"升级为"看花费"。
**Status**: planned

#### Phases

- [ ] **Phase 1: 签名公证 + 成本估算** — macOS 公证/签名、Windows 签名、provider 定价成本估算

#### Phase Details

##### Phase 1: 签名公证 + 成本估算
**Goal**: 让安装包开箱即用（无安全劝退），并给用量数据加上金额维度。
**Depends on**: Milestone 1 Phase 1（在加固后的地基上改 CI 与新增功能）
**Requirements**: REQ-201, REQ-202, REQ-203
**Success Criteria** (what must be TRUE):
  1. macOS DMG 经签名 + 公证（notarization），用户首次打开不再出现"已损坏"提示，homebrew cask 可移除 xattr 去隔离的 caveat
  2. Windows 安装包经签名（若用户盘子需要），SmartScreen 警告消除
  3. Insights 新增成本估算：基于各 provider 定价表，把 token 用量换算为金额并在仪表盘展示
  4. release.yml 增加签名/公证步骤且 CI 通过；成本估算遵循"零网络上报、本地计算"约束

---

### Milestone 3: Insights 二期 + 上游韧性 (v2.2)
**Target**: 提升 Insights 交互体验，并增强对 kimi-code-cli 上游配置演进的兼容韧性。
**Status**: planned

#### Phases

- [ ] **Phase 1: Insights 增强 + 上游兼容韧性** — recharts 交互图、tray 洞察入口、配置漂移探测、CLI 版本探测、provider 健康巡检

#### Phase Details

##### Phase 1: Insights 增强 + 上游兼容韧性
**Goal**: 把 Insights 做到交互级体验，并堵住"CLI 升级后 GUI 静默落后"的长期业务风险。
**Depends on**: Milestone 2 Phase 1（成本估算落地后趋势图一并升级）
**Requirements**: REQ-301, REQ-302, REQ-303, REQ-304, REQ-305
**Success Criteria** (what must be TRUE):
  1. 趋势图由纯 CSS 柱状升级为 recharts 交互式图表（hover/缩放/图例），适配多配色与暗亮主题
  2. 系统托盘菜单新增洞察快捷入口，可直达 Insights 子页
  3. 配置格式漂移探测：当 `~/.kimi/` 出现 GUI 不认识的新字段时，提示用户而非静默丢弃
  4. About/体检页显示检测到的 kimi-code-cli 版本与兼容状态
  5. Provider 连通性批量健康巡检，一次性看出哪些 provider 不可用

---

## Scope Decisions

- **In scope**: 迁移层测试加固、命令桥集成测试、知识文档同步、macOS 公证/签名、Windows 签名、成本估算、recharts 交互图、tray 洞察入口、配置漂移探测、CLI 版本探测、provider 健康巡检
- **Deferred**: 成本估算的多币种/历史定价回溯（一期先做当前定价）；recharts 之外的高级可视化（热力图等）
- **Out of scope**（继承 project.md，不变）: 云端数据上报（隐私优先，全本地）、多用户/团队维度统计、持久化 Prompt/Response 全文、替代 provider 官方账单

## Requirements Traceability

| REQ-ID | 描述 | 来源 | Phase |
|--------|------|------|-------|
| REQ-101 | 迁移层（src/renderer/src/tauri/**）补单测 + 覆盖率门禁扩展 | review(新增) | M1·P1 |
| REQ-102 | 23 个 Rust tauri 命令集成/契约测试 | review(新增) | M1·P1 |
| REQ-103 | 同步陈旧文档 project.md + specs/arch 到 Tauri 架构 | review(新增) | M1·P1 |
| REQ-201 | macOS 公证 + 签名 | review(新增) | M2·P1 |
| REQ-202 | Windows 签名 | review(新增) | M2·P1 |
| REQ-203 | 成本估算（基于 provider 定价） | project.md Active / deferred | M2·P1 |
| REQ-301 | 趋势图升级 recharts 交互式 | project.md Active / deferred | M3·P1 |
| REQ-302 | Tray 菜单洞察快捷入口 | project.md Active / deferred | M3·P1 |
| REQ-303 | 配置格式漂移探测 | review(新增) | M3·P1 |
| REQ-304 | kimi-cli 版本探测 + 兼容性提示 | review(新增) | M3·P1 |
| REQ-305 | Provider 连通性批量健康巡检 | review(新增) | M3·P1 |

> 最高 ROI 建议：先做 REQ-101（对内堵质量风险）+ REQ-201（对外解获客摩擦）。

## Progress

| Milestone | Phase | Status | Completed |
|-----------|-------|--------|-----------|
| 1. 迁移善后 (v2.0.x) | 1. 迁移层质量加固 | Not started | - |
| 2. 分发体验 + Insights 一期 (v2.1) | 1. 签名公证 + 成本估算 | Not started | - |
| 3. Insights 二期 + 上游韧性 (v2.2) | 1. Insights 增强 + 上游兼容韧性 | Not started | - |

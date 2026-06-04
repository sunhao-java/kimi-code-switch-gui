# Provider/Model/Profile 添加流程简化 - 产品设计方案

**生成时间**: 2026-06-04  
**场景**: kimi-code-switch-gui 配置管理优化

---

## §1. 问题定位与目标

### 当前痛点

1. **添加顺序混乱** — 用户可能先添加 Model，但 Provider 不存在，导致引用错误
2. **数据关系不直观** — Provider → Model → Profile 的依赖链在 UI 上没有体现
3. **重复劳动** — 多个 Model 共享同一个 Provider 配置时需要重复输入相同信息
4. **删除风险** — 删除 Provider 时未检查是否被 Model 引用，导致数据损坏

### 目标

- **引导式顺序添加** — Provider → Model → Profile 的流程引导，依赖项为空时禁用添加按钮
- **多对多关系可视化** — 让用户看到哪些 Model 使用了哪个 Provider，哪些 Profile 使用了哪个 Model
- **数据复用/聚合** — Profile 作为 Model + 系统配置的聚合，而非重复配置
- **引用完整性校验** — 删除前检测引用，有引用则阻止并显示引用列表

---

## §2. 核心概念与术语

| 术语 | 定义 | 别名 | 类别 |
|------|------|------|------|
| Provider | AI 服务提供商配置（API endpoint、认证方式） | 供应商 | core |
| Model | 模型配置（model ID、所属 Provider、参数） | 模型 | core |
| Profile | 运行配置（active Model + CLI 偏好 + MCP 服务器） | 配置文件 | core |
| 引导式添加 | UI 按依赖顺序引导用户完成添加流程 | Guided Flow | technical |
| 多对多关系 | 一个 Provider 可被多个 Model 引用，一个 Model 可被多个 Profile 引用 | Many-to-Many | technical |
| 引用完整性 | 删除时检测下游引用，有引用则阻止删除 | Referential Integrity | technical |
| 关系可视化 | 在卡片上显示引用计数、徽标、点击跳转 | Relationship Visualization | technical |

---

## §3. 非目标（不纳入范围）

1. **不改 CLI 配置文件格式** — kimi-code-cli 的 TOML 文件格式保持不变，GUI 只是更智能的编辑器
2. **不引入新的数据存储** — 不引入数据库或 JSON 中间格式，继续读写 TOML
3. **不支持批量导入** — 一次添加多个 Provider/Model 的批量导入功能不在此次范围
4. **不自动迁移旧配置** — 已有配置文件保持原样，新的引导流程只影响新增场景

---

## §4. 产品经理视角 - 用户体验设计

### PM-01: 空状态引导 (MUST)
**决策**: 当 Provider 列表为空时，Model/Profile 添加按钮禁用，并显示 tooltip 提示"请先添加 Provider"  
**理由**: 避免用户创建无效引用，减少错误操作  
**影响**: TabPanels.tsx 添加按钮 disabled 逻辑

### PM-02: 添加流程推荐 (SHOULD)
**决策**: Provider 添加成功后，自动弹出提示"是否继续添加 Model？"；Model 添加成功后，自动弹出提示"是否继续添加 Profile？"  
**理由**: 引导用户完成完整配置，减少跳转次数  
**影响**: 需要 onAdd 回调支持链式操作

### PM-03: 快捷添加路径 (SHOULD)
**决策**: 在 Provider 卡片上增加"+ 添加 Model"快捷按钮；在 Model 卡片上增加"+ 添加 Profile"快捷按钮  
**理由**: 减少 Tab 切换，提升操作效率  
**影响**: SplitLayout renderItemAction 扩展

---

## §5. 系统架构师视角 - 数据模型与关系

### SA-01: 数据模型保持不变 (MUST)
**决策**: Provider/Model/Profile 的数据结构（MainConfig, Profile 接口）保持现状，不引入多对多中间表  
**理由**: kimi-code-cli 的 TOML 格式已固定，GUI 不能自行扩展字段  
**约束**: 关系通过 `ModelConfig.provider` 字段（字符串引用）维护

### SA-02: 引用关系计算逻辑 (MUST)
**决策**: 新增 `src/shared/configRelations.ts` 模块，提供：
- `getProviderReferences(state, providerName): Model[]` — 返回引用该 Provider 的所有 Model
- `getModelReferences(state, modelName): Profile[]` — 返回引用该 Model 的所有 Profile
- `canDeleteProvider(state, providerName): {canDelete: boolean, references: Model[]}` — 删除前检查
- `canDeleteModel(state, modelName): {canDelete: boolean, references: Profile[]}` — 删除前检查  
**理由**: 引用逻辑从 configStore.deleteProvider/deleteModel 提取为独立工具函数，UI 层可以在删除前调用检查  
**影响**: src/shared/ 新增文件，配套单元测试

### SA-03: 引用完整性前置校验 (MUST)
**决策**: TabPanels 的 onDelete 调用 `canDeleteProvider/canDeleteModel`，有引用时弹窗显示引用列表并阻止删除  
**理由**: 前置校验优于运行时错误，用户看到引用列表后可以先删除下游对象  
**影响**: TabPanels.tsx onDelete 逻辑，ConfirmDialog 支持显示列表

---

## §6. UX 专家视角 - 关系可视化

### UX-01: Provider 卡片显示引用计数 (MUST)
**决策**: Provider 卡片右上角显示"被 N 个模型引用"徽标，点击跳转到 Models Tab 并高亮这些 Model  
**理由**: 让用户直观看到 Provider 的使用情况，避免误删  
**实现**: SplitLayout renderItemAction 调用 getProviderReferences，渲染 badge + onClick 跳转

### UX-02: Model 卡片显示所属 Provider 徽标 (MUST)
**决策**: Model 卡片左上角显示所属 Provider 名称徽标，点击跳转到 Providers Tab 并高亮该 Provider  
**理由**: 快速溯源，减少 Tab 切换成本  
**实现**: SplitLayout renderItemAction 解析 ModelConfig.provider，渲染 link badge

### UX-03: Profile 卡片显示使用的 Model 徽标 (SHOULD)
**决策**: Profile 卡片显示当前 active Model 的徽标，点击跳转到 Models Tab  
**理由**: 让 Profile 的依赖关系可见  
**实现**: SplitLayout renderItemAction 解析 Profile.default_model

### UX-04: 删除确认对话框显示引用列表 (MUST)
**决策**: 删除 Provider 时，如果有 Model 引用，弹窗显示"该 Provider 被以下 N 个模型引用："+ 列表，底部显示"请先删除这些模型，或修改它们的 Provider"，只有一个"取消"按钮  
**理由**: 明确告知阻止原因，引导用户正确操作  
**实现**: ConfirmDialog 支持 `type: "block-with-list"`，传入 references 数组

---

## §7. UI 设计师视角 - 视觉设计

### UID-01: 引用计数徽标样式 (MUST)
**决策**: 使用 lucide-react 的 `Link` 图标 + 数字，浅灰色背景，hover 时高亮  
**实现**: CSS class `.reference-badge { background: var(--gray-100); padding: 4px 8px; border-radius: 4px; }`

### UID-02: 空状态提示样式 (MUST)
**决策**: 替换通用 EmptyState 组件为场景化 GuidedEmptyState 组件，携带上下文参数（当前 Tab、缺少什么依赖、建议操作）  
**实现**: 新增 GuidedEmptyState.tsx，根据 context 参数渲染不同文案

### UID-03: 禁用按钮 tooltip (MUST)
**决策**: 添加按钮禁用时，hover 显示 tooltip："请先添加 Provider" / "请先添加 Model"  
**实现**: 使用 HTML title 属性或 custom tooltip 组件

---

## §8. 数据架构师视角 - 引用关系追踪

### DA-01: 引用关系是单向的 (CONFIRMED)
**决策**: Provider 不知道谁引用了它，Model 不知道谁引用了它，引用关系通过遍历计算  
**理由**: TOML 格式不支持反向引用字段，计算开销可接受（配置数量通常 < 100）  
**影响**: getProviderReferences/getModelReferences 通过 `Object.values(state.mainConfig.models).filter(...)` 计算

### DA-02: 引用检查时机 (MUST)
**决策**: 删除前（UI 层）+ 保存前（configStore 层）双重检查  
**理由**: UI 层检查提供友好提示，configStore 层检查是最后防线  
**影响**: configStore.deleteProvider/deleteModel 保留现有 Error 抛出逻辑

---

## §9. 测试策略师视角 - 测试覆盖

### TS-01: 引用关系工具函数单元测试 (MUST)
**决策**: `configRelations.test.ts` 覆盖：
- 空 state 返回空数组
- Provider 被 0/1/多个 Model 引用
- Model 被 0/1/多个 Profile 引用
- canDelete 逻辑（可删除 vs 不可删除）  
**目标**: 100% 分支覆盖

### TS-02: UI 层集成测试 (SHOULD)
**决策**: TabPanels.test.tsx 新增测试用例：
- 删除有引用的 Provider → 弹窗显示引用列表 → 删除被阻止
- 删除无引用的 Provider → 确认对话框 → 删除成功  
**目标**: 覆盖核心删除流程

---

## §10. 功能分解

| ID | 功能 | 描述 | 相关角色 | 优先级 |
|----|------|------|----------|--------|
| F-001 | 引用关系工具函数 | 新增 configRelations.ts，提供 getProviderReferences/getModelReferences/canDelete* | SA, DA | MUST |
| F-002 | 空状态引导 | Provider 为空时禁用 Model/Profile 添加按钮 + tooltip | PM, UX | MUST |
| F-003 | 删除前引用检查 | 删除 Provider/Model 前调用 canDelete，有引用则弹窗阻止 | PM, UX, SA | MUST |
| F-004 | Provider 引用计数徽标 | Provider 卡片显示"被 N 个模型引用"，点击跳转 | UX, UID | MUST |
| F-005 | Model 所属 Provider 徽标 | Model 卡片显示所属 Provider，点击跳转 | UX, UID | MUST |
| F-006 | 引用列表弹窗 | ConfirmDialog 支持 block-with-list 模式，显示引用对象列表 | UX, UID | MUST |
| F-007 | GuidedEmptyState 组件 | 场景化空状态组件，替换通用 EmptyState | UID, PM | MUST |
| F-008 | i18n 补全 | 补齐 6 语言（zh-CN/zh-TW/en-US/ja-JP/de-DE/es-ES）的 20+ 个新 key | PM | MUST |

---

## §11. 风险与约束

### 风险

1. **i18n 工作量** — 6 语言 × 20+ key = 120+ 翻译条目，需要时间
2. **跨 Tab 跳转高亮** — setActiveTab + setSelectedProvider/Model 需要时序协调，可能有 race condition
3. **Phase 2 规划冲突** — 已有 Phase 2 规划（TASK-001/002/003），需要合并或调整优先级

### 约束

1. **数据模型零改动** — 不能修改 `src/shared/types.ts` 的 MainConfig/Profile 接口
2. **TOML 格式不变** — 不能在 TOML 中添加 GUI 专用字段
3. **纯 UI 层增强** — 所有功能通过 UI 逻辑实现，不依赖 CLI 升级

---

## §12. 实施路径建议

### 路径 A: 合并到 Phase 2（推荐）

将 F-001/F-002/F-003 合并到现有 Phase 2 TASK-002（引用完整性前置校验），将 F-004/F-005 合并到 TASK-003（关系可视化）。优点：复用已有规划，减少重复工作。

### 路径 B: 独立执行（快速验证）

先实现 F-001（引用关系工具函数）+ F-003（删除前检查）作为最小可行产品（MVP），快速验证效果后再决定是否继续 F-004/F-005。

---

## §13. 下一步行动

1. **确认路径** — 与用户确认选择路径 A（合并 Phase 2）还是路径 B（独立 MVP）
2. **任务分解** — 将 F-001 ~ F-008 分解为子任务，估算工时
3. **实施** — 按优先级执行（F-001/F-003 最高优先级）
4. **验证** — 测试删除流程 + 引用可视化
5. **i18n 补全** — 最后统一补齐 6 语言翻译

---

**生成方式**: 基于代码理解的直接产品设计方案，未经多角色头脑风暴

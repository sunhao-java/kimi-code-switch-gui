# Provider/Model/Profile 管理 - 产品交互重构设计

**生成时间**: 2026-06-04  
**场景**: kimi-code-switch-gui 从数据结构暴露到任务导向的交互重构  
**设计方法**: 多角色发散探索(用户研究/信息架构/交互设计/前端工程/产品管理)

---

## 问题根源诊断

### 之前方案的致命缺陷

之前的"guidance-specification.md"(Wave 1-2 已实施)存在三个根本问题:

1. **自我设限** — §11 将"纯 UI 层增强"定为约束,§3 把"引导式创建流程"划进非目标,从第一行就放弃了产品设计的自由度
2. **补偿割裂而非消除割裂** — 引用徽标、跳转高亮、禁用按钮、删除拦截,全是在修补三 Tab 割裂带来的认知成本,而不是质问"为什么用户要忍受这种割裂"
3. **把系统责任甩给用户** — "删除 Provider 时弹窗说'请先去删除这些模型'" = 把数据库外键报错原样丢给用户,真正的产品设计应该让孤儿引用在流程上根本无法产生

### 真正的产品问题(四个层面)

- **信息架构**: 三个并列 Tab 暗示平等关系,但实际是严格依赖链 — 典型的"数据库表直接映射到 UI"反模式
- **创建流程**: 用户被迫"先去 A 建 Provider → 切到 B 建 Model 选 Provider → 切到 C 建 Profile 选 Model",三次跳转,每次都在问"我在哪一层"
- **引用完整性交互范式**: 事后拦截(弹窗报错) vs 预防(向导原子性) vs 级联引导(显示影响并批量清理)
- **心智模型**: 用户被迫理解 Provider→Model→Profile 三层抽象才能使用,但用户真正的心智模型是"我想用 Claude Sonnet 写代码"(目标),不是"我要先建个 Anthropic Provider"(实现细节)

---

## 多角色设计探索

### 🎯 用户研究员视角:心智模型与认知负荷

**观察:用户被迫操作倒置的信息架构**

Provider/Model/Profile 是实现细节层级的抽象,不是用户的心智模型。

**用户真正的心智模型:**
- "我想用 Claude Sonnet 写代码" → **目标**
- "我想在公司内网用自部署的 Qwen" → **场景**
- "我想切换到 GPT-4 试试效果" → **操作**

用户**不关心** Provider 是什么、Model 和 Provider 的区别、Profile 为什么要绑定 Model。

**用户旅程分析 — 场景 1:新用户首次配置**

- **期望**: "我有个 OpenAI API key,想开始用"
- **现状**:
  1. 进入 Providers Tab → "什么是 Provider?"
  2. 点 Add Provider → 填一堆字段(name/endpoint/auth) → "name 填什么?endpoint 是什么?"
  3. 进入 Models Tab → Add Model → "刚才的 Provider 去哪了?为什么还要选 model ID?"
  4. 进入 Profiles Tab → Add Profile → "为什么又要选一次 Model?"

**认知断层**: 三次跳转,每次都在问"我在哪一层?",用户从未看到完整拼图。

**关键洞察:**
1. **抽象倒置** — Provider/Model/Profile 是数据库 schema,不是用户界面
2. **目标缺失** — 用户想要的是"配置一个可用的 AI 助手",但 UI 拆成了三个碎片式的 CRUD
3. **上下文断裂** — 三个 Tab 之间没有叙事连贯性

**设计建议:**
- **任务导向的主视图**: "你想做什么?" → 配置新助手 / 切换助手 / 管理凭证
- **向导式创建流程**: 一次对话完成端到端配置,系统负责拆解到 Provider/Model/Profile
- **场景化呈现**: 不显示"Model 列表",显示"可用的 AI 助手",附带来源信息(如"通过 OpenAI 提供")

---

### 🏗️ 信息架构师视角:层次重构与导航

**问题**: 三个并列 Tab 暗示平等关系,但实际是严格依赖链。

**正确的信息架构 — 方案 A:任务优先 + 配置降级**

```
主界面(Profiles 视图)
├── 当前激活: Claude Sonnet (公司内网)
├── 快速切换列表
│   ├── GPT-4 Turbo (OpenAI)
│   ├── Qwen Max (本地)
│   └── + 配置新助手 (向导)
└── [高级配置] 按钮 → 展开面板
    ├── Providers (折叠区)
    ├── Models (折叠区)
    └── 显示原始 TOML
```

**核心改变:**
- 主视图 = Profile(用户真正操作的对象)
- Provider/Model = 高级配置(需要时才看)
- 创建流程 = 向导(系统自动拆解)

**方案 B:可视化依赖关系 + 就地扩展**

```
主界面(关系图视图)
Provider: OpenAI ─┬─ Model: GPT-4 ───── Profile: 日常工作
                  └─ Model: GPT-3.5 ─── Profile: 快速草稿
Provider: 公司内网 ── Model: Qwen ────── Profile: 敏感项目
```

点击节点 → 就地展开详情面板(不跳转 Tab)

**方案 C:渐进式披露**

```
简化模式(默认) → Profiles 列表 + 添加向导
专家模式(切换) → 三 Tab + 关系图 + 批量操作
```

**导航流对比:**

| 当前架构 | 方案 A | 方案 B |
|---------|--------|--------|
| Tab 1→Tab 2→Tab 3→激活 | 向导→完成→激活 | 点击→就地展开→保存 |
| 4 次页面跳转 | 0 次跳转(模态) | 0 次跳转(原地) |
| 认知负荷:高 | 认知负荷:低 | 认知负荷:中 |

**推荐**: **方案 A 作为默认界面**,方案 B 作为"高级配置"可选视图(Phase 2)。

---

### 🎨 交互设计师视角:流程与反馈

**问题诊断**: 当前流程强迫用户以系统的视角操作(先建表 A,再建表 B,最后建外键)。

**新流程设计:向导式配置**

```
Step 1/3: 选择来源
○ OpenAI (ChatGPT / GPT-4)
○ Anthropic (Claude)
○ 本地模型 (Ollama / LM Studio)
○ 公司内网 API
○ 其他 (自定义 endpoint)

---

Step 2/3: 配置连接
[根据 Step 1 选择动态切换表单]

OpenAI 示例:
- API Key: [输入框] [测试连接]
- 模型: [下拉] gpt-4-turbo / gpt-3.5-turbo / ...
- (可选) 代理设置: [折叠]

---

Step 3/3: 命名与完成
- 配置名称: [输入框] 默认值:"OpenAI GPT-4"
- (可选) 图标: [选择器]
- □ 完成后立即激活

[完成配置]
```

**关键机制:**
1. **系统负责拆解**: 向导收集的信息,系统自动拆解成 Provider + Model + Profile 写入 TOML
2. **智能默认值**: Provider name 自动生成(如 "openai-20260604"),用户只需关心最终的 Profile 名称
3. **测试连接**: Step 2 实时测试 API 连接,避免配置错误
4. **原子性**: 三步完成或全部取消,不会产生半成品数据

**引用完整性的交互范式 — 级联引导替代拦截**

**场景:删除 Provider**

```
用户点击删除 Provider "OpenAI"
↓
系统检测到 2 个 Model 依赖它
↓
弹窗:
━━━━━━━━━━━━━━━━━━━━━━
⚠️ 该 Provider 正被 2 个模型使用

依赖它的模型(2):
  • GPT-4 Turbo
  • GPT-3.5

使用这些模型的配置(3):
  • 日常工作 (当前激活) ⚡
  • 快速草稿
  • 实验配置

你想如何处理?

● 一并删除所有相关配置 (推荐)
  → 删除 Provider + 2 个模型 + 3 个配置
  → 当前激活的配置将切换到:备用配置

○ 仅删除 Provider,保留孤儿模型
  → 保留的模型将无法使用,需手动重新配置

[确认删除] [取消]
━━━━━━━━━━━━━━━━━━━━━━
```

**核心改变:**
- 不是"阻止你删",而是"告诉你删了会怎样,并提供批量级联删除"
- 用户选择"删除 Provider 及其所有依赖" → 系统一次性清理干净,不留孤儿数据
- 如果是最后一个 Profile → 警告"删除后将无可用配置"

---

### 💻 前端工程师视角:实现可行性

**约束确认:**
- ✅ TOML 格式不变(底层数据结构固定)
- ✅ `configStore.ts` 的纯函数不改(已有 100% 测试覆盖)
- ✅ 向导生成的数据等价于手动三步创建

**技术实现路径:**

#### 1. 新增向导组件(不破坏现有架构)

```typescript
// src/renderer/src/wizards/AddAssistantWizard.tsx
interface WizardState {
  step: 1 | 2 | 3
  source: 'openai' | 'anthropic' | 'local' | 'custom'
  config: Partial<{ provider: ProviderConfig, model: ModelConfig, profile: Profile }>
}

// 向导完成后调用现有的 configStore 函数
onComplete(wizardState) {
  const { provider, model, profile } = wizardState.config
  let state = currentState
  state = configStore.upsertProvider(state, provider.name, provider)
  state = configStore.upsertModel(state, model.name, model)
  state = configStore.upsertProfile(state, profile.name, profile)
  saveState(state)
}
```

#### 2. 主界面重构(渐进式)

```typescript
// src/renderer/src/App.tsx
const [viewMode, setViewMode] = useState<'simple' | 'advanced'>('simple')

{viewMode === 'simple' ? (
  <ProfileCentricView 
    profiles={state.profiles}
    onAddNew={() => setShowWizard(true)}
    onShowAdvanced={() => setViewMode('advanced')}
  />
) : (
  <TabPanels {...existingProps} /> // 保留现有三 Tab 作为高级模式
)}
```

#### 3. 级联删除(扩展现有逻辑)

```typescript
// src/shared/configRelations.ts (已存在,扩展)
export function getCascadePreview(
  state: AppState,
  target: { type: 'provider' | 'model', name: string }
): CascadeImpact {
  // 返回:会被删除的对象 + 会受影响的 Profile + 建议操作
}
```

**迁移策略:**
- **Phase 1**: 向导 + Profile 中心视图(新增,不破坏)
- **Phase 2**: 三 Tab 标记为"高级配置",默认隐藏
- **Phase 3**: 级联删除 + 关系图
- **风险**: 低 — 每个 Phase 独立可测试,向导生成的数据与手动创建等价

---

### 📊 产品经理视角:用户价值与优先级

**核心用户价值排序:**

| 功能 | 解决的痛点 | 用户价值 | 实现成本 | 优先级 |
|------|-----------|---------|---------|--------|
| **向导式创建** | 流程割裂,认知负荷 | ⭐⭐⭐⭐⭐ | 中(新增组件) | **P0** |
| **Profile 中心视图** | 用户目标缺失 | ⭐⭐⭐⭐⭐ | 低(UI 重组) | **P0** |
| **级联删除引导** | 引用完整性粗暴 | ⭐⭐⭐⭐ | 中(扩展逻辑) | **P1** |
| **关系图可视化** | 依赖关系不直观 | ⭐⭐⭐ | 高(新组件+布局算法) | **P2** |
| **智能默认值/模板** | 重复劳动 | ⭐⭐⭐ | 低(预设) | **P1** |
| **高级模式切换** | 保留专家能力 | ⭐⭐ | 低(条件渲染) | **P1** |

**北极星指标**: 新用户从零配置到首次激活的平均时长
- **当前**: ~5 分钟(需理解三层抽象)
- **目标**: <2 分钟(向导 + 智能默认)

**MVP 定义(Phase 1):**
- ✅ 向导式创建流程(Step 1-2-3)
- ✅ Profile 中心视图 + 快速切换
- ✅ 保留三 Tab 作为"高级配置"入口
- ✅ 级联删除基础版(预览影响 + 确认)

---

## 融合方案:最终设计决策

### 核心设计原则

1. **任务优先于数据结构** — 主界面呈现"你的 AI 助手",不是"数据库表"
2. **向导消除认知负荷** — 用户不需要理解 Provider/Model/Profile,系统负责拆解
3. **渐进式披露** — 简单场景零学习曲线,复杂场景保留专家模式
4. **级联引导替代拦截** — 删除时显示影响范围并提供批量清理,不是抛错误

### 信息架构(重构后)

```
┌─ 主界面 ───────────────────────┐
│ 🤖 你的 AI 助手                 │
│                                 │
│ [当前激活]                      │
│ ● Claude Sonnet (公司内网)     │
│   [切换] [编辑]                 │
│                                 │
│ [其他配置]                      │
│ ○ GPT-4 Turbo (OpenAI)         │
│ ○ Qwen Max (本地 Ollama)       │
│ ○ GPT-3.5 (OpenAI)             │
│                                 │
│ [+ 配置新助手] ← 打开向导       │
│                                 │
│ [🔧 高级配置] ← 展开三 Tab     │
└─────────────────────────────────┘
```

点击"🔧 高级配置" → 展开下方区域:
```
┌─ 高级配置(可折叠) ─────────────┐
│ Providers | Models | Profiles   │
│ [现有三 Tab 界面保留]           │
└─────────────────────────────────┘
```

### 向导流程(详细)

**触发**: 点击"+ 配置新助手" → 全屏模态对话框

**Step 1: 选择来源**(预设模板)
- 显示卡片式选择: OpenAI / Anthropic / Ollama / Azure / 自定义
- 每个卡片带 logo + 一句话说明
- 选中后自动跳 Step 2

**Step 2: 填写连接信息**(表单根据 Step 1 动态变化)
- OpenAI 示例:
  - API Key: [输入] [右侧:如何获取 API Key?链接]
  - Base URL: [预填] https://api.openai.com/v1 (可改)
  - [测试连接] 按钮 → 实时验证 + 自动获取可用 model 列表
  - 选择模型: [下拉] (从测试连接获取,或手动输入)
- 本地 Ollama 示例:
  - 自动扫描 localhost:11434 → 显示已安装模型列表
  - 若扫描失败 → 显示手动输入表单

**Step 3: 命名与完成**
- 配置名称: [输入] (默认:"来源名 + 模型名",如"OpenAI GPT-4")
- 自定义图标: [可选]
- ☑ 完成后立即激活
- [完成] → 后台调用 `upsertProvider` + `upsertModel` + `upsertProfile`

**系统行为:**
- Provider name 自动生成: `{source}-{timestamp}` (用户不可见)
- Model name 自动生成: `{source}-{model_id}` (用户不可见)
- Profile name = 用户输入的"配置名称"(用户唯一关心的)

### 删除交互(级联引导)

**删除 Profile**: 直接删除(无依赖)

**删除 Provider/Model(在高级配置区)**:
- 系统调用 `getCascadePreview()`
- 弹窗显示:
  - 依赖它的模型列表
  - 使用这些模型的配置列表
  - 当前激活的配置是否受影响
- 提供选择:
  - ● 一并删除所有相关配置(推荐,级联删除)
  - ○ 仅删除 Provider,保留孤儿模型(需手动重新配置)
- 如果是最后一个 Profile → 警告"删除后将无可用配置"

---

## 交付物:实现规格

### 文件结构(新增)

```
src/renderer/src/
├── views/
│   ├── ProfileCentricView.tsx  ← 新:Profile 中心视图
│   └── AdvancedConfigView.tsx  ← 新:封装现有三 Tab
├── wizards/
│   ├── AddAssistantWizard.tsx  ← 新:向导容器
│   ├── WizardStep1Source.tsx
│   ├── WizardStep2Connect.tsx
│   ├── WizardStep3Name.tsx
│   └── sourcePresets.ts        ← OpenAI/Anthropic/Ollama 预设
├── dialogs/
│   └── CascadeDeleteDialog.tsx ← 新:级联删除确认
└── App.tsx                     ← 改:视图模式切换
```

### 数据流(不变)

```
向导完成 → wizardState
           ↓
       拆解为 { provider, model, profile }
           ↓
       逐个调用 configStore 函数 (已有逻辑)
           ↓
       写入 TOML (现有 saveConfig 流程)
```

### i18n 需求

**新增 key(保守估计 ~30 个):**
- 向导相关(15): step1Title/step2Title/sourceOpenAI/sourceAnthropic/testConnection/connectionSuccess...
- Profile 中心视图(8): yourAssistants/currentActive/switchTo/configureNew...
- 级联删除(7): cascadeWarning/affectedModels/affectedProfiles/deleteAll/keepOrphans...

**6 语言 × 30 key = 180 条翻译**

### 测试策略

**单元测试:**
- `getCascadePreview()` 覆盖(扩展 `configRelations.test.ts`)
- 向导状态机测试(step 转换 + 验证)

**集成测试:**
- 向导流程端到端: Step 1 → 2 → 3 → 生成等价 TOML
- 级联删除: 删除 Provider → 验证下游对象被清理 + Profile 切换

**可用性测试(建议):**
- 任务: "配置一个 OpenAI GPT-4 并激活"
- 测量: 完成时长 + 卡点数 + SUS 评分
- 对比: 向导流程 vs 原三 Tab 流程

---

## 设计决策(已确认)

1. **信息架构**: Profile 中心视图为主,三 Tab 降为"高级配置"可折叠区
2. **向导形式**: 全屏模态对话框(沉浸式,首次配置体验更好)
3. **MVP 范围**: 向导 + Profile 中心视图 + 级联删除;关系图可视化放 Phase 2

---

## 下一步

进入 `maestro-plan` 阶段,输出详细的实现计划和任务分解。

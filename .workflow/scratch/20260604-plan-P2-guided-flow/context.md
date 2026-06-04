# Phase 2: 引导式添加流程优化

## 用户意图

> "思考一下,是否可以简化添加 model、provider、profile 的流程,这些数据,是否可以按照先后顺序来添加,或者说数据可以公用,比如说,模型与 provider,可以多对多的关系,然后聚合成 profile"

## 设计评估结论

经过对现有数据模型与 kimi-cli 配置格式的分析,确定方向:

**✅ 做什么**: 纯 UI 引导 + 校验增强(数据模型零改动)
**❌ 不做什么**: 改数据模型为多对多或在 GUI 引入新抽象层

### 核心约束

- **这个 schema 不是 GUI 定义的,是 kimi-cli 的 `config.toml` 格式** — GUI 只是可视化编辑器
- **Model ↔ Provider 已经是"一对多复用"** — `ModelConfig.provider: string` 字段是引用,多个 model 可指向同一 provider
- **Profile 是运行时偏好集合,不是 model+provider 的"聚合"** — 它引用一个 `default_model`,而不包含 provider 字段

### 现有问题

1. **引用关系不可见** — Provider/Model/Profile 三个 tab 是独立的扁平列表,看不出"Model 属于哪个 Provider"
2. **添加顺序无引导** — 新用户可能先建 Model(缺 Provider 时报错),或建 Profile(缺 Model 时无选项)
3. **运行时错误而非前置校验** — Model 添加时,只有点"+"才报 `errorCreateProviderFirst`(L503),且只在 Model 做了,Profile 没做
4. **引用完整性缺失** — 可以删除被引用的 Provider/Model,导致孤儿引用(configSafety.validateModelReferences 已检测,但没前置到 UI 层)
5. **关系不可视** — Provider 卡片看不到"被 N 个模型引用",Model 卡片看不到所属 Provider 徽标

## 需求范围 (REQ-401 ~ REQ-405)

| REQ | 标题 | 描述 |
|-----|------|------|
| REQ-401 | 引导式顺序添加 | Provider → Model → Profile 的添加流程引导,新建时自动带出依赖项下拉或行内"+ 新建"链接 |
| REQ-402 | 引用完整性前置校验 | 删除被引用项前提示,Model/Profile 引用不存在项时实时警示,取代运行时 throw Error |
| REQ-403 | 关系可视化 | Provider 卡片显示"被 N 个模型引用",Model 卡片显示所属 Provider 徽标,Profile 显示引用的 Model 名 |
| REQ-404 | 空状态引导 | Provider/Model/Profile 列表为空时,显式引导"先添加 Provider" / "先添加 Model" |
| REQ-405 | i18n 补齐 | 所有新增 key 补齐 6 语言(zh-CN/zh-TW/en-US/ja-JP/de-DE/es-ES) |

## 数据模型(不变)

```typescript
// config.toml (kimi-cli 拥有,GUI 只编辑)
providers: Record<name, ProviderConfig>
models: Record<name, ModelConfig>
  └─ ModelConfig.provider: string  // 引用 providers 的 key
default_model: string               // 引用 models 的 key

// config.profiles.toml (独立文件)
Profile { default_model: string, ... }  // 引用 models 的 key
```

**引用链**: Profile → Model → Provider

## 现有 UI 接入点

- **Provider 添加**: `TabPanels.tsx:386` `onAdd={() => upsertProvider(draft, name, {...})}`
- **Model 添加**: `TabPanels.tsx:499` `onAdd={() => { if (!providerName) throw Error(...); upsertModel(...) }}`
- **Profile 添加**: (未在前面读到完整,需探查)
- **引用校验**: `configSafety.ts:175` `validateModelReferences` 检测孤儿引用,在 Doctor 报告展示

## 设计原则

1. **数据模型零改动** — 不碰 types.ts 的 interface,不改 configStore.ts 的序列化逻辑
2. **纯 UI 层增强** — 把已存在的引用关系显式化,不引入新抽象
3. **前置校验优于运行时错误** — 删除/编辑时的引用检查移到 UI 层,而非等 save 时报错
4. **渐进增强** — 不破坏现有添加流程,只增加引导与提示

## 成功标准

1. Provider tab 的卡片显示"被 N 个模型引用",点击可跳转到 Models tab 并高亮相关模型
2. Model 表单的 provider 下拉列表,若为空则禁用"添加 Model"按钮,显示"请先添加 Provider"引导
3. Model 卡片显示所属 Provider 的徽标/标签,点击可跳转到 Providers tab
4. Profile 表单的 default_model 下拉列表,若为空则禁用"添加 Profile"按钮,显示"请先添加 Model"引导
5. 删除 Provider 前,如果被模型引用,弹窗列出引用者并阻止删除(或提供"级联删除"选项+二次确认)
6. 删除 Model 前,如果被 Profile 引用,弹窗列出引用者并阻止删除
7. Model/Profile 引用不存在的 provider/model 时,表单实时显示警告图标+tooltip
8. 所有新增 i18n key(约 10+ 个)补齐 6 语言

## 排除范围

- ❌ 改数据模型为多对多关系
- ❌ 在 GUI 引入"逻辑分组"抽象层(保存时展平)
- ❌ Provider/Model/Profile 的批量导入/导出(超出本 phase 范围)
- ❌ 自动从 provider 官方拉取模型列表填充(需网络请求,超出范围)

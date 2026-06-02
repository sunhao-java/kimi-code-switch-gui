# TASK-001: 成本估算数据层：定价模型 + 内置默认 + 计算 cost

## Changes
- `src/shared/types.ts`: 新增 `ModelPricing` 接口（`input_per_mtok` / `output_per_mtok` / 可选 `cache_read_per_mtok` / `cache_creation_per_mtok`，单位每百万 token）；`ModelConfig` 增加可选字段 `pricing?: ModelPricing`。
- `src/shared/usageTypes.ts`: `DailyAggregate` 接口追加 `cost_estimate_sum: number | null`。
- `src/shared/pricing.ts`（新建）: 导出 `DEFAULT_MODEL_PRICING`（kimi 系列 + OpenAI/Anthropic 主流模型，`Object.freeze` 冻结）、`normalizeModelKey`（小写/去 provider 前缀/去日期与 -latest 后缀）、`resolveModelPricing`（用户 pricing 优先 → 默认表匹配 → null，纯函数）、`computeEventCost`（各 token 维度 × 单价 / 1_000_000；cache 维度缺省回退 input 单价；reasoning 按 output 计价；pricing 为 null 返回 null；负值/非有限 token 归零，纯函数）。
- `src/shared/usageStore.ts`: 导入 pricing 工具；新增 `resolveEventPricing`（按 event.model 在 models 里取用户覆盖，否则默认表）与 `sumEventCost`（读时按 tokens×当前单价累加；全部未知价返回 null，否则求已知项之和；纯函数）。聚合在读时计算，不依赖 DB 固化的 cost_estimate 列。
- `src/shared/pricing.test.ts`（新建）: 覆盖默认表形状/冻结、归一化各分支、用户覆盖/默认匹配/null、各 token 维度计算、cache 回退、负值/NaN 归零、零 token 等。
- `src/shared/usageStore.test.ts`: 追加 `resolveEventPricing` 与 `sumEventCost` 用例。
- `src/shared/configStore.ts`: **无需修改**。序列化为全量 pass-through（`stringify(state.mainConfig)`），解析也是 `input.models as MainConfig["models"]` 整体透传，pricing 嵌套对象自动 round-trip（已实测验证，见下）。

## Verification (convergence criteria — 实证)
- [x] `src/shared/pricing.ts` exists：`test -f` → OK
- [x] pricing.ts contains 'computeEventCost'：grep → OK
- [x] pricing.ts contains 'DEFAULT_MODEL_PRICING'：grep → OK
- [x] `src/shared/types.ts` contains 'pricing'：grep → OK
- [x] `src/shared/usageTypes.ts` contains 'cost_estimate_sum'：grep → OK
- [x] `src/shared/pricing.test.ts` exists：`test -f` → OK
- [x] `npm test` exits 0：`EXIT=0`
- [x] TOML round-trip：node 实测 `parse(stringify(cfg))` 后 `pricing` 字段完整保留 `{input_per_mtok,output_per_mtok,cache_read_per_mtok}`
- [x] `npx tsc --noEmit` exit=0（无类型错误）

## Tests
- [x] `npm test`：Test Files 23 passed (23)，Tests 364 passed (364)，Duration ~2.5s，退出码 0

npm test 末尾输出（覆盖率表）：
```
All files          |   79.74 |    81.76 |   90.14 |   79.74 |
 shared            |   86.97 |    82.86 |      95 |   86.97 |
  pricing.ts       |     100 |      100 |     100 |     100 |
  usageStore.ts    |   86.23 |    93.65 |    87.5 |   86.23 |
```
门禁（vitest.config.ts）：lines/functions/statements ≥ 70、branches ≥ 50。全局 79.74 / 81.76 / 90.14 / 79.74 均达标。

**pricing.ts 覆盖率：Stmts 100% / Branch 100% / Funcs 100% / Lines 100%**（无 skip/ignore，全部以断言覆盖）。

## Deviations
- configStore.ts 列在 files[] 中标记为可能 modify，但实测序列化/反序列化均为全量透传，pricing 自动 round-trip，无需改动 —— 已用 node 实测验证而非假设。
- usageStore.ts 内并不存在现成的 DailyAggregate 构造/聚合函数（该接口此前仅作为 DB schema 的类型镜像，无消费方）。按任务"读时计算"语义，新增了纯函数 `resolveEventPricing` / `sumEventCost` 作为成本累加的读时计算点，供后续 P1 任务在构造 DailyAggregate 时接入；同时已在接口补齐 `cost_estimate_sum` 字段。

## Notes
- 成本读时计算，不读取 DB 的 `cost_estimate` 固化列；用户改价即时生效，无 stale 存储值。
- 未知模型 cost 返回 null（未知）而非 0，避免错算；`sumEventCost` 全未知时返回 null。
- 默认价表需随模型演进维护，用户可通过 `ModelConfig.pricing` 覆盖兜底。
- 下游接入点：构造 `DailyAggregate` 时用 `sumEventCost(events, models)` 填充 `cost_estimate_sum`。

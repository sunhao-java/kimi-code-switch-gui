# TASK-003: 上游兼容韧性：CLI 版本兼容提示 + provider 批量健康巡检

## Changes
- `src/renderer/src/tauri/cli.ts`：
  - REQ-304：新增常量 `MIN_CLI_VERSION="1.0.0"` / `EXPECTED_CLI_VERSION="1.4.0"`、类型 `CliCompatStatus`、纯函数 `evaluateCliCompatibility()`（复用 `compareReleaseVersions`/`normalizeReleaseVersion` 判定 compatible/outdated/unknown）。
  - REQ-305：新增 `runProvidersHealthCheck(state)` —— 遍历所有 provider，`findRepresentativeModel` 选代表 model，`probeProvider` 复用 `buildRequest` 请求构造做轻量连通性探测；逐项独立（`Promise.all` + 每项 try/catch），返回 `ProviderHealthResult[]`（ok / reason / status / latencyMs）。reason 含 no-model / missing-base-url / missing-api-key / rate-limited(429) / http-error / network-error。
- `src/renderer/src/tauri/kimiSwitch.ts`：暴露 `runProvidersHealthCheck` 到 `window.kimiSwitch`。
- `src/renderer/src/overviewDashboard.tsx`：REQ-304 UI —— CLI 版本旁展示兼容状态徽标（compatible/outdated/unknown），outdated 时 title 提示最低版本。
- `src/renderer/src/tabs/TabPanels.tsx`：REQ-305 UI —— Providers 页顶部「一键健康巡检」按钮 + 逐项结果列表（ok/fail 圆点 + 原因 + 延迟），失败友好原因映射。
- `src/renderer/src/components.css`：新增 `.cli-compat-badge.*` 与 `.providers-health-*` 样式（沿用 token 配色，亮/暗适配）。
- `src/renderer/src/i18n.ts`：6 语言补 key（cliCompatTitle/cliCompatCompatible/cliOutdated/cliCompatUnknown/cliCompatOutdatedHint + providerHealthCheck/providerHealthChecking/providerHealthOk/providerHealthFail/providerHealthNoModel/providerHealthMissingBaseUrl/providerHealthMissingApiKey/providerHealthRateLimited/providerHealthHttpError/providerHealthNetworkError/providerHealthEmpty）。zh-CN/en-US/ja-JP/de-DE/es-ES 显式定义，zh-TW 经 `toTraditionalChinese` 运行时自动派生（项目既有 i18n 机制）。
- `src/renderer/src/tauri/cli.test.ts`：新增 `evaluateCliCompatibility`（4 例）与 `runProvidersHealthCheck`（逐项独立 + 限流/网络错误/无模型/缺 key）测试。

## Verification（convergence 实证）
- [x] `grep -n 'runProvidersHealthCheck' src/renderer/src/tauri/cli.ts` → 命中（line 240）
- [x] `grep -n 'compat\|Compat\|MIN_CLI\|EXPECTED_CLI' src/renderer/src/tauri/cli.ts` → 命中（lines 39/40/42/46-48/52）
- [x] `grep -rn 'providerHealth\|runProvidersHealthCheck' src/renderer/src/*.tsx` + tabs/*.tsx → 命中（overviewDashboard.tsx 接 CLI 兼容，TabPanels.tsx 接批量巡检）
- [x] i18n.ts contains 'providerHealthCheck' → 是
- [x] `grep -c 'providerHealthCheck' src/renderer/src/i18n.ts` → 10（≥6）
- [x] `npm test` → exit 0（23 文件 / 378 测试全过；configStore 覆盖率 91.95% lines / 81.62% branch，满足 80/55 阈值）
- [x] `npm run build:web` → exit 0（vite build 成功；仅 @iarna/toml 既有 eval 警告，非本次引入）

## Tests
- [x] `npm test`：378 passed (23 files)。新增 cli.test.ts 17 测试全过。
- [x] `npm run build:web`：built in ~1.3s，无错误。

## Deviations
- convergence 第 3 条写 `src/renderer/src/*.tsx`，但 Providers 巡检 UI 实际落在 `src/renderer/src/tabs/TabPanels.tsx`（项目 Providers 面板真实位置，非根级散文件）；REQ-304 CLI 兼容 UI 落在根级 `src/renderer/src/overviewDashboard.tsx`（CLI 版本既有展示落点，比 about 页更贴合现有代码）。两处 UI 均已接入，语义满足。
- task 提到 about 页展示 CLI 兼容；实际放在概览页（CLI 版本检测已在 overviewDashboard 实现，避免重复检测逻辑）。action 原文为「about 页或概览」，符合。

## Notes
- `window.kimiSwitch` 的类型 `KimiSwitchApi` 来自未解析的 `../../preload`（Electron 遗留，迁移后无该文件），运行时注入，类型宽松，故 `api.runProvidersHealthCheck` 调用无需补声明；与既有 `getCliVersion`/`testProfileConnectivity` 同模式。
- tsc -p tsconfig.web.json 的 8 处报错（TabPanels void/loadState/keyof、kimiSwitch ts-expect-error）经 git stash 对比确认为改动前既有，本次零新增类型错误；项目以 vite 构建，task 明确不用 tsc 校验。
- 批量巡检逐项独立：单 provider 失败（含 429）不阻断其余，限流显示「被限流（429）」友好原因。

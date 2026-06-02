# TASK-002: 配置格式漂移探测

## Changes
- `src/shared/types.ts`: 新增 `ConfigDriftEntry { file, path, key }`；`ConfigDoctorReport` 新增可选字段 `drift?: ConfigDriftEntry[]`（向后兼容）。
- `src/shared/configSafety.ts`: 新增纯函数 `detectUnknownFields(rawDocs)` + 递归 `walkUnknownFields`，基于 `KNOWN_FIELD_SCHEMA`（config/profiles/mcp 的已知字段 + provider/model 通配 + loop_control/background/notifications/services/mcp/MCP server 体 open）对比磁盘原始解析对象键集，列出 GUI 未识别字段；`buildConfigDoctorReport` 增加可选第二参 `rawDocs?`，提供时填充 `drift`，不提供时 `drift = []`（既有调用零影响）。复用既有 `isRecord`。
- `src/shared/configSafety.test.ts`: 新增 `describe("detectUnknownFields (config drift)")`，9 个用例覆盖无漂移/未知顶层/嵌套未知（provider/model）/未知 profile 字段/open 字段无误报/多文件聚合/null·undefined·非对象忽略/经 buildConfigDoctorReport 透出/省略 rawDocs 向后兼容。
- `src/renderer/src/tabComponents.tsx`: 新增可复用组件 `DoctorDriftList`，渲染未知字段列表（i18n driftTitle + driftUnknownField）。
- `src/renderer/src/tabs/TabPanels.tsx`: `DoctorReportPanel` 引入并渲染 `<DoctorDriftList report.drift />`（doctor 报告实际渲染处）。
- `src/renderer/src/i18n.ts`: 6 语言补 `driftTitle` / `driftUnknownField`（zh-CN base、en-US base、ja-JP/de-DE/es-ES localeOverrides；zh-TW 经 toTraditionalChinese 自动派生）。

## Verification (convergence 实证)
- [x] `grep -n 'unknownField|drift|detectUnknown' src/shared/configSafety.ts` → 10 命中
- [x] `grep -n 'drift|unknownField|detectUnknown' src/shared/configSafety.test.ts` → 命中（detectUnknownFields import + describe + 多 it）
- [x] `grep -n 'drift|unknownField' src/renderer/src/tabComponents.tsx` → 命中（DoctorDriftList + driftTitle + driftUnknownField）
- [x] `grep -c 'driftTitle:|driftUnknownField:' src/renderer/src/i18n.ts` → 10（≥6）
- [x] `npm test` 退出 0：23 文件 / 373 tests 全绿（含 shared 门禁，configStore.ts 91.95/81.62/100/91.95 通过 80/55 门禁）
- [x] `npm run build:web` 退出 0（vite build，1967 modules，built in 1.30s）

## Tests
- [x] `npx vitest run src/shared/configSafety.test.ts`: 16 passed（含新增 9 个 drift 用例）
- [x] `npm test`: 373 passed

## Coverage (configSafety 新增覆盖率)
- `src/shared/configSafety.ts` 整体 lines 75.03 / branch 85.24 / funcs 92 / stmts 75.03。
- 未覆盖行为 615-616 / 619-621 等既有 redaction 辅助函数（`redactUrl` catch、`normalizeSemanticServerName`、`isRecord` 边界），均在新增代码（687+ `detectUnknownFields` / `walkUnknownFields`）之前。
- 新增的 `detectUnknownFields` / `walkUnknownFields`（行 687+）不在 uncovered 列表中，由 9 个专项用例完整覆盖（open 分支、wildcard 分支、known/unknown 分支、非对象提前返回、null/undefined 跳过）。
- 门禁（针对 configStore.ts 的 80/55）通过；configSafety.ts 无独立门禁，npm test 退出 0。

## Deviations
- UI 渲染落在 `src/renderer/src/tabs/TabPanels.tsx` 的 `DoctorReportPanel`（doctor 报告实际渲染处），任务 focus_paths 写的是 `tabComponents.tsx`。为同时满足"正确渲染位置"与"tabComponents.tsx 含 drift 逻辑"的收敛标准，将渲染抽成可复用组件 `DoctorDriftList` 放在 `tabComponents.tsx`，由 TabPanels 引入使用。
- 改动 `src/shared/types.ts`（在 scope `src/shared/` 内）与 `src/renderer/src/tabs/TabPanels.tsx`（doctor UI 真实位置，超出列出的 focus_paths）——属必要的最小跨文件改动，已如实记录。
- drift 在生产链路当前不会被填充：`runDoctor` API（`kimiSwitch.ts` / `useSafetyActions.ts`）只传 `state`，未传原始磁盘解析对象 `rawDocs`。将原始 TOML/JSON 解析对象贯通到 doctor 调用属跨层改动（kimiSwitch 适配层 + 解析管线），超出本任务 scope（`src/shared/`）。纯探测函数、类型、UI、i18n、单测均已就位；接线为后续任务（建议在 runDoctor 链路把 raw 解析对象作为第二参传入 buildConfigDoctorReport）。

## Notes (供后续任务)
- 接线点：`src/renderer/src/tauri/kimiSwitch.ts:157 runDoctor` → 传入读取到的原始 `config.toml`/`config.profiles.toml`/`mcp.json` 解析对象作为 `buildConfigDoctorReport(state, rawDocs)` 第二参；`useSafetyActions.ts` 的 `refreshSafetyState`/`runDoctor` 需相应携带原始解析对象。
- MCP server 体按 open 处理（未知键经 `McpServerConfig.extra` 保留），避免对 CLI 扩展的 server 选项误报。
- 已知字段 schema 维护点：`KNOWN_FIELD_SCHEMA`（configSafety.ts）——新增 GUI 字段时同步更新以避免误报。

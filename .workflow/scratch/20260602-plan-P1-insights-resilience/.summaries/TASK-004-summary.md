# TASK-004: Tray 洞察快捷入口

## Changes
- `src/renderer/src/tauri/tray.ts`:
  - `TRAY_LABELS` 类型新增 `insights: string` 字段，6 个 locale（zh-CN/zh-TW/en-US/ja-JP/de-DE/es-ES）各补用量洞察文案。
  - `buildMenu` 在 `show-window` 项后新增 `{ id: "show-insights", label: labels.insights }`（位于第一个 separator 之前，紧邻显示窗口）。
  - `tray://command` handler 新增 `action === "show-insights"` 分支：先 `invoke("show_main_window")`，再 `window.dispatchEvent(new Event("kimi-open-insights"))`。
- `src/renderer/src/App.tsx`:
  - 在既有 `kimi-tray-reload` 监听 useEffect 之后，新增 useEffect 监听 `kimi-open-insights` 事件 → `runAfterUnsavedHandled(() => setActiveTab("insights"))`，并在 cleanup 中 `removeEventListener`，依赖数组 `[runAfterUnsavedHandled, setActiveTab]`。

## Verification
- [x] `grep -n 'show-insights' src/renderer/src/tauri/tray.ts` 命中：L42（菜单项）、L95（handler 分支）
- [x] `grep -n 'kimi-open-insights' src/renderer/src/tauri/tray.ts` 命中：L97（dispatchEvent）
- [x] `grep -n 'kimi-open-insights' src/renderer/src/App.tsx` 命中：L146（addEventListener）、L147（removeEventListener）
- [x] TRAY_LABELS 各 locale 含 insights 文案：L29-34，6 语言齐（用量洞察 / 用量洞察 / Usage Insights / 使用状況インサイト / Nutzungsanalyse / Análisis de uso）
- [x] 导航接通：托盘点击 → invoke show_main_window + dispatch kimi-open-insights → App useEffect 监听 → setActiveTab('insights')（insights 是 appOptions.ts 中合法 TabId）

## Tests
- [x] `npm test`：EXIT=0，Test Files 23 passed (23)，Tests 378 passed (378)。tray.ts 覆盖率 98.07% stmts / 95.45% branch。
- [x] `npm run build:web`：EXIT=0，1967 modules transformed，built in 1.24s（仅 chunk size 与 @iarna/toml eval 既有告警，非本次引入）。

## Deviations
- None。完全按 action/implementation 执行，未越出 scope（仅改 tray.ts + App.tsx）。

## Notes
- 事件名 `kimi-open-insights` 与既有 `kimi-tray-reload` 同属窗口级 CustomEvent 范式，App.tsx 监听器已正确清理，无内存泄漏。
- 复用了既有 `runAfterUnsavedHandled` 包装，切 tab 前会处理未保存变更，与其它导航行为一致。

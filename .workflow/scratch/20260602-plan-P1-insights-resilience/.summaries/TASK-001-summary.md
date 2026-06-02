# TASK-001: 趋势图交互增强（不引入 recharts）

## Changes
- `src/renderer/src/insightsChart.tsx`：
  - `TrendChartProps` 新增可选 `onPointClick?: (point, index) => void` 与 `labels?: { legend, metricLabel, clickHint }`（带 zh-CN 兜底）。
  - 新增 `activeIndex` state + `handlePointClick`（再次点击同一点取消选中），并通过 `clickedIndex`（带边界 guard，防止 data/metric 变化后索引越界）驱动高亮。
  - 命中层 `<rect>` 加 `onClick`；柱状图选中态加描边 + 不降透明度 + `.selected` class；折线图选中点放大到 r=7、实心填充、`.selected` class。
  - SVG 后渲染 `<div className="insights-chart-legend">`：标题 + 色块（`insights-chart-legend-swatch`）+ metric 文案 + 右侧 clickHint 小字。
  - （悬浮强化原已具备：竖向参考线 + hover 点放大，未重做。）
- `src/renderer/src/insightsComponents.tsx`：
  - 新增 `selectedTrendPoint` state。
  - `<TrendChart>` 调用接入 `labels={{ legend: t(locale,'chartLegend'), clickHint: t(locale,'chartClickHint') }}` 与 `onPointClick`（toggle 选中），并在图表下方联动渲染 `.insights-trend-detail` 明细行（日期 + Token + 调用次数）。
- `src/renderer/src/components.css`：新增 `.insights-chart-legend` 及子元素（`-title/-item/-swatch/-label/-hint`）、`.insights-chart-bar.selected`、`.insights-chart-point.selected`、`.insights-trend-detail`（及 `-date/-stat`）。全部走设计 token（`--muted/--line/--text/--primary-rgb/--primary-2-rgb`），亮暗主题自动适配（token 由 `:root[data-theme]` 切换）。
- `src/renderer/src/i18n.ts`：6 语言（zh-CN/en-US/zh-TW/ja-JP/de-DE/es-ES）补 `chartLegend` / `chartClickHint` / `chartLegendToggleHint`。

## Verification (convergence 实证)
- [x] `grep -n 'legend\|Legend\|onPointClick\|onClick' src/renderer/src/insightsChart.tsx` 命中：onPointClick（L23/74）、labels.legend（L25）、onClick（L183）、insights-chart-legend JSX（L212-218）。
- [x] `grep -c 'insights-chart' src/renderer/src/components.css` = 8（≥1）；`grep -c 'insights-chart-legend'` = 6（≥1）。
- [x] `src/renderer/src/i18n.ts` 含 `chartLegend`；`grep -c chartLegend` = 12（chartLegend + chartLegendToggleHint 各 6 locale），其中 `chartLegend:` 定义恰 6 次（每语言一次）→ ≥6 满足。
- [x] `grep -n 'insights-chart-legend' src/renderer/src/insightsChart.tsx` 命中（图例已渲染，L212-218）。
- [x] insightsComponents.tsx 的 `<TrendChart>` 调用含 `labels`（L628）与 `onPointClick`（L629）。
- [x] 点击数据点可见反馈：柱状图描边高亮、折线图选中点放大实心 + drop-shadow，并在下方渲染明细行。

## Tests
- [x] `npm test` → TEST_EXIT=0；23 test files / 364 tests passed。
- [x] `npm run build:web` → BUILD_EXIT=0；vite 真实生产构建成功（`✓ built in 1.55s`，输出 index/css/js bundle；chunk>500kB 为既有 advisory，非错误）。

## Deviations
- 任务 `files` 指定 CSS 写入 `components.css`，而实际 `insights-chart-*` 既有样式位于 `insights.css`。核查导入图：`main.tsx → styles.css → @import components.css`（全局加载），故新样式放入 `components.css` 既满足 convergence grep，又能全局生效作用于图表，无需重复。未改 `insights.css`，避免重复定义。
- 新增联动明细容器 `.insights-trend-detail`（任务允许“如适用”）：趋势面板原无现成明细容器，按要求“若无现成明细容器，至少做点击高亮”——两者均已实现（高亮 + 明细行）。

## Notes
- `onPointClick` / `labels` 均为可选 prop，向后兼容（其它调用方无需改动）。
- `clickedIndex` 做了越界 guard，metric/时间范围切换后不会残留无效高亮。
- 图例 metric 文案默认随 metric 切换（labels.metricLabel 未传时兜底 zh-CN「Token 消耗 / 调用次数」）。

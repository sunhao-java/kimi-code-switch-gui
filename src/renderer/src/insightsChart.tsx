import { useMemo, useState } from "react";

function formatNumber(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

export type TrendChartType = "bar" | "line";

export interface TrendChartPoint {
  date: string;
  tokens: number;
  calls: number;
}

interface TrendChartProps {
  data: TrendChartPoint[];
  metric: "tokens" | "calls";
  chartType: TrendChartType;
  /** Optional callback fired when a data point is clicked (drill-down). */
  onPointClick?: (point: TrendChartPoint, index: number) => void;
  /** Localized labels for the legend / interaction hint (falls back to zh-CN). */
  labels?: {
    legend?: string;
    metricLabel?: string;
    clickHint?: string;
    tooltipLabel?: string;
    unit?: string;
  };
}

const PADDING = { top: 24, right: 24, bottom: 32, left: 56 };
const VIEW_WIDTH = 960;
const HEIGHT = 300;
export function TrendChart({ data, metric, chartType, onPointClick, labels }: TrendChartProps): JSX.Element {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const legendLabel = labels?.legend ?? "图例";
  const clickHint = labels?.clickHint ?? "点击数据点查看当日明细";
  const metricLabel = labels?.metricLabel ?? (metric === "tokens" ? "Token 消耗" : "调用次数");
  const tooltipLabel = labels?.tooltipLabel ?? (metric === "tokens" ? "Token" : "调用");
  const unit = labels?.unit ?? (metric === "tokens" ? "tokens" : "次");

  const values = useMemo(
    () => data.map((d) => (metric === "tokens" ? d.tokens : d.calls)),
    [data, metric],
  );
  const maxVal = useMemo(() => Math.max(...values, 1), [values]);

  const chartWidth = VIEW_WIDTH - PADDING.left - PADDING.right;
  const chartHeight = HEIGHT - PADDING.top - PADDING.bottom;
  const slotWidth = data.length > 0 ? chartWidth / data.length : chartWidth;
  const barWidth = data.length > 0 ? Math.min(56, slotWidth * 0.55) : 0;

  const yToPx = (v: number): number => PADDING.top + chartHeight - (v / maxVal) * chartHeight;
  const xToPx = (i: number): number => PADDING.left + slotWidth * (i + 0.5);

  const yTicks = useMemo(() => [0, 0.25, 0.5, 0.75, 1].map((r) => r * maxVal), [maxVal]);

  const linePath = useMemo(() => {
    if (data.length === 0) return "";
    return data
      .map((d, i) => {
        const x = xToPx(i);
        const y = yToPx(metric === "tokens" ? d.tokens : d.calls);
        return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");
  }, [data, metric, maxVal]);

  if (data.length === 0) return <></>;

  // Clicked point is the highlighted "active" point; guard against stale index
  // after data/metric changes shrink the series.
  const clickedIndex = activeIndex !== null && activeIndex < data.length ? activeIndex : null;
  const handlePointClick = (i: number): void => {
    setActiveIndex((prev) => (prev === i ? null : i));
    onPointClick?.(data[i], i);
  };

  const hovered = hoverIndex !== null ? data[hoverIndex] : null;
  const hoveredValue = hovered ? (metric === "tokens" ? hovered.tokens : hovered.calls) : 0;
  const tooltipLeftPct = hoverIndex !== null ? (xToPx(hoverIndex) / VIEW_WIDTH) * 100 : 0;
  const tooltipTopPct = hovered ? (yToPx(hoveredValue) / HEIGHT) * 100 : 0;

  return (
    <div className="insights-chart-wrap">
      <svg
        width="100%"
        height={HEIGHT}
        viewBox={`0 0 ${VIEW_WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="insights-chart-svg"
      >
        <defs>
          <linearGradient id="trend-bar-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(var(--primary-rgb), 0.9)" />
            <stop offset="100%" stopColor="rgba(var(--primary-2-rgb), 0.7)" />
          </linearGradient>
          <linearGradient id="trend-area-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="rgba(var(--primary-rgb), 0.35)" />
            <stop offset="100%" stopColor="rgba(var(--primary-rgb), 0)" />
          </linearGradient>
        </defs>

        {yTicks.map((t, i) => {
          const y = yToPx(t);
          return (
            <g key={`grid-${i}`} className="insights-chart-grid">
              <line x1={PADDING.left} y1={y} x2={VIEW_WIDTH - PADDING.right} y2={y} />
              <text x={PADDING.left - 8} y={y + 4} textAnchor="end" className="insights-chart-axis-text">
                {formatNumber(Math.round(t))}
              </text>
            </g>
          );
        })}

        {chartType === "bar" &&
          data.map((d, i) => {
            const v = metric === "tokens" ? d.tokens : d.calls;
            const x = xToPx(i) - barWidth / 2;
            const y = yToPx(v);
            const h = Math.max(PADDING.top + chartHeight - y, 2);
            const active = hoverIndex === i;
            const selected = clickedIndex === i;
            return (
              <rect
                key={i}
                x={x}
                y={y}
                width={barWidth}
                height={h}
                rx={4}
                fill="url(#trend-bar-grad)"
                opacity={hoverIndex === null || active || selected ? 1 : 0.55}
                stroke={selected ? "rgba(var(--primary-rgb), 1)" : "none"}
                strokeWidth={selected ? 2 : 0}
                className={`insights-chart-bar${selected ? " selected" : ""}`}
              />
            );
          })}

        {chartType === "line" && (
          <>
            <path
              d={`${linePath} L ${xToPx(data.length - 1).toFixed(2)} ${(PADDING.top + chartHeight).toFixed(2)} L ${xToPx(0).toFixed(2)} ${(PADDING.top + chartHeight).toFixed(2)} Z`}
              fill="url(#trend-area-grad)"
            />
            <path
              d={linePath}
              fill="none"
              stroke="rgba(var(--primary-rgb), 1)"
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            {data.map((d, i) => {
              const v = metric === "tokens" ? d.tokens : d.calls;
              const active = hoverIndex === i;
              const selected = clickedIndex === i;
              return (
                <circle
                  key={i}
                  cx={xToPx(i)}
                  cy={yToPx(v)}
                  r={selected ? 7 : active ? 6 : 4}
                  fill={selected ? "rgba(var(--primary-rgb), 1)" : "white"}
                  stroke="rgba(var(--primary-rgb), 1)"
                  strokeWidth={2}
                  className={`insights-chart-point${selected ? " selected" : ""}`}
                />
              );
            })}
          </>
        )}

        {data.map((_, i) => (
            <rect
              key={`hit-${i}`}
              x={xToPx(i) - slotWidth / 2}
              y={PADDING.top}
              width={slotWidth}
              height={chartHeight}
              fill="transparent"
              onMouseEnter={() => setHoverIndex(i)}
              onMouseLeave={() => setHoverIndex(null)}
              onClick={() => handlePointClick(i)}
              style={{ cursor: "pointer" }}
            />
          ))}

        {data.map((d, i) => (
          <text
            key={`x-${i}`}
            x={xToPx(i)}
            y={HEIGHT - PADDING.bottom + 18}
            textAnchor="middle"
            className="insights-chart-axis-text"
          >
            {d.date.slice(5)}
          </text>
        ))}

        {hoverIndex !== null && (
          <line
            x1={xToPx(hoverIndex)}
            y1={PADDING.top}
            x2={xToPx(hoverIndex)}
            y2={PADDING.top + chartHeight}
            stroke="rgba(var(--primary-rgb), 0.35)"
            strokeDasharray="3 3"
          />
        )}
      </svg>

      <div className="insights-chart-legend">
        <span className="insights-chart-legend-title">{legendLabel}</span>
        <span className="insights-chart-legend-item">
          <span className="insights-chart-legend-swatch" />
          <span className="insights-chart-legend-label">{metricLabel}</span>
        </span>
        <span className="insights-chart-legend-hint">{clickHint}</span>
      </div>

      {hovered && (
        <div
          className="insights-chart-tooltip"
          style={{
            left: `${tooltipLeftPct}%`,
            top: `${yToPx(hoveredValue) - 12}px`,
          }}
        >
          <div className="insights-chart-tooltip-date">{hovered.date}</div>
          <div className="insights-chart-tooltip-value">
            <span className="insights-chart-tooltip-label">{tooltipLabel}</span>
            <span className="insights-chart-tooltip-num">{formatNumber(hoveredValue)} {unit}</span>
          </div>
        </div>
      )}
    </div>
  );
}

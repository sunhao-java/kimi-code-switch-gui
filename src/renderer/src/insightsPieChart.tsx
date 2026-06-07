import { useMemo, useState } from "react";
import { t, type Locale } from "./i18n";
import { t, type Locale } from "./i18n";

function formatNumber(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (n >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

export interface PieDatum {
  name: string;
  value: number;
}

interface PieChartProps {
  data: PieDatum[];
  locale: Locale;
  unitLabel?: string;
  emptyHint?: string;
}

function getPalette(): string[] {
  const primary = getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#3b82f6";
  const primary2 = getComputedStyle(document.documentElement).getPropertyValue("--primary-2").trim() || "#22c55e";
  return [
    primary,
    primary2,
    "#f97316",
    "#eab308",
    "#06b6d4",
    "#ec4899",
    "#8b5cf6",
    "#14b8a6",
    "#f43f5e",
    "#64748b",
  ];
}

const SIZE = 220;
const RADIUS = 90;
const INNER_RADIUS = 50;
const CX = SIZE / 2;
const CY = SIZE / 2;

interface Slice {
  name: string;
  value: number;
  pct: number;
  startAngle: number;
  endAngle: number;
  color: string;
  index: number;
}

function polarToCartesian(cx: number, cy: number, r: number, angleRad: number): { x: number; y: number } {
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(startAngle: number, endAngle: number): string {
  const start = polarToCartesian(CX, CY, RADIUS, startAngle);
  const end = polarToCartesian(CX, CY, RADIUS, endAngle);
  const innerStart = polarToCartesian(CX, CY, INNER_RADIUS, endAngle);
  const innerEnd = polarToCartesian(CX, CY, INNER_RADIUS, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M ${start.x.toFixed(2)} ${start.y.toFixed(2)}`,
    `A ${RADIUS} ${RADIUS} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    `L ${innerStart.x.toFixed(2)} ${innerStart.y.toFixed(2)}`,
    `A ${INNER_RADIUS} ${INNER_RADIUS} 0 ${largeArc} 0 ${innerEnd.x.toFixed(2)} ${innerEnd.y.toFixed(2)}`,
    "Z",
  ].join(" ");
}

export function PieChart({ data, locale, unitLabel, emptyHint }: PieChartProps): JSX.Element {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const palette = useMemo(() => getPalette(), []);

  const { slices, total } = useMemo(() => {
    const filtered = data.filter((d) => Math.max(0, d.value) > 0);
    const sum = filtered.reduce((acc, d) => acc + d.value, 0);
    if (sum === 0 || filtered.length === 0) return { slices: [] as Slice[], total: 0 };
    let cursor = -Math.PI / 2;
    const result: Slice[] = filtered.map((d, i) => {
      const v = d.value;
      const sweep = (v / sum) * Math.PI * 2;
      const start = cursor;
      const end = cursor + sweep;
      cursor = end;
      return {
        name: d.name || t(locale, "insightsUnknownName"),
        value: v,
        pct: (v / sum) * 100,
        startAngle: start,
        endAngle: end,
        color: palette[i % palette.length],
        index: i,
      };
    });
    return { slices: result, total: sum };
  }, [data, palette]);

  if (slices.length === 0) {
    return (
      <div className="insights-pie-empty">
        <span>{emptyHint ?? t(locale, "insightsPieChartNoData")}</span>
      </div>
    );
  }

  const activeSlice = hoverIndex !== null ? slices[hoverIndex] : null;

  return (
    <div className="insights-pie-wrap">
      <div className="insights-pie-canvas">
        <svg
          width={SIZE}
          height={SIZE}
          viewBox={`0 0 ${SIZE} ${SIZE}`}
          className="insights-pie-svg"
          role="img"
          aria-label={t(locale, "insightsPieChartAriaLabel")}
        >
          {slices.length === 1 ? (
            (() => {
              const s = slices[0];
              const isActive = activeSlice?.index === s.index;
              const dimmed = hoverIndex !== null && !isActive;
              return (
                <g
                  onMouseEnter={() => setHoverIndex(s.index)}
                  onMouseLeave={() => setHoverIndex(null)}
                  style={{ cursor: "pointer" }}
                >
                  <circle
                    cx={CX}
                    cy={CY}
                    r={RADIUS}
                    fill={s.color}
                    opacity={dimmed ? 0.35 : 1}
                    className="insights-pie-slice"
                  />
                  <circle
                    cx={CX}
                    cy={CY}
                    r={INNER_RADIUS}
                    fill="var(--bg)"
                  />
                </g>
              );
            })()
          ) : (
            slices.map((s) => {
              const isActive = activeSlice?.index === s.index;
              const dimmed = hoverIndex !== null && !isActive;
              return (
                <path
                  key={s.index}
                  d={describeArc(s.startAngle, s.endAngle)}
                  fill={s.color}
                  opacity={dimmed ? 0.35 : 1}
                  stroke="var(--bg)"
                  strokeWidth={1.5}
                  className="insights-pie-slice"
                  onMouseEnter={() => setHoverIndex(s.index)}
                  onMouseLeave={() => setHoverIndex(null)}
                  style={{ cursor: "pointer", transition: "opacity 0.15s" }}
                />
              );
            })
          )}
          <text
            x={CX}
            y={CY - 6}
            textAnchor="middle"
            className="insights-pie-center-label"
          >
            {activeSlice ? activeSlice.name : t(locale, "insightsPieChartTotal")}
          </text>
          <text
            x={CX}
            y={CY + 14}
            textAnchor="middle"
            className="insights-pie-center-value"
          >
            {activeSlice
              ? `${activeSlice.pct.toFixed(1)}%`
              : formatNumber(total)}
          </text>
        </svg>
      </div>
      <ul className="insights-pie-legend">
        {slices.map((s) => {
          const isActive = activeSlice?.index === s.index;
          return (
            <li
              key={s.index}
              className={`insights-pie-legend-item ${isActive ? "active" : ""}`}
              onMouseEnter={() => setHoverIndex(s.index)}
              onMouseLeave={() => setHoverIndex(null)}
            >
              <span
                className="insights-pie-legend-swatch"
                style={{ background: s.color }}
              />
              <span className="insights-pie-legend-name" title={s.name}>
                {s.name}
              </span>
              <span className="insights-pie-legend-pct">{s.pct.toFixed(1)}%</span>
              <span className="insights-pie-legend-val">
                {formatNumber(s.value)}
                {unitLabel ? ` ${unitLabel}` : ""}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

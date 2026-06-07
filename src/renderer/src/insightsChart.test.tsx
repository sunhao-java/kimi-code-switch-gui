import { describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { TrendChart, type TrendChartPoint } from "./insightsChart";

const SAMPLE: TrendChartPoint[] = [
  { date: "2026-06-01", tokens: 1200, calls: 8 },
  { date: "2026-06-02", tokens: 3400, calls: 21 },
  { date: "2026-06-03", tokens: 900, calls: 5 },
];

function renderChart(props: Partial<React.ComponentProps<typeof TrendChart>> = {}) {
  return render(
    <TrendChart data={SAMPLE} metric="tokens" chartType="bar" {...props} />,
  );
}

describe("TrendChart", () => {
  it("renders nothing when data is empty", () => {
    const { container } = render(<TrendChart data={[]} metric="tokens" chartType="bar" />);
    expect(container.querySelector(".insights-chart-wrap")).toBeNull();
  });

  it("renders one bar per data point in bar mode", () => {
    const { container } = renderChart({ chartType: "bar" });
    expect(container.querySelectorAll("rect.insights-chart-bar")).toHaveLength(SAMPLE.length);
    expect(container.querySelectorAll("circle.insights-chart-point")).toHaveLength(0);
  });

  it("renders one point per data point in line mode", () => {
    const { container } = renderChart({ chartType: "line" });
    expect(container.querySelectorAll("circle.insights-chart-point")).toHaveLength(SAMPLE.length);
    expect(container.querySelectorAll("rect.insights-chart-bar")).toHaveLength(0);
  });

  it("shows tooltip with the date on hover and hides it on leave", () => {
    const { container } = renderChart();
    const hitAreas = container.querySelectorAll("rect[style*='cursor']");
    expect(hitAreas.length).toBe(SAMPLE.length);

    fireEvent.mouseEnter(hitAreas[1]);
    expect(container.querySelector(".insights-chart-tooltip-date")?.textContent).toBe("2026-06-02");

    fireEvent.mouseLeave(hitAreas[1]);
    expect(container.querySelector(".insights-chart-tooltip")).toBeNull();
  });

  it("fires onPointClick with the clicked point and index", () => {
    const onPointClick = vi.fn();
    const { container } = renderChart({ onPointClick });
    const hitAreas = container.querySelectorAll("rect[style*='cursor']");

    fireEvent.click(hitAreas[2]);
    expect(onPointClick).toHaveBeenCalledWith(SAMPLE[2], 2);
  });

  it("marks the clicked bar as selected and toggles it off on re-click", () => {
    const { container } = renderChart();
    const hitAreas = container.querySelectorAll("rect[style*='cursor']");

    fireEvent.click(hitAreas[0]);
    expect(container.querySelectorAll("rect.insights-chart-bar.selected")).toHaveLength(1);

    fireEvent.click(hitAreas[0]);
    expect(container.querySelectorAll("rect.insights-chart-bar.selected")).toHaveLength(0);
  });

  it("respects custom labels for legend and click hint", () => {
    const { getByText } = renderChart({
      labels: { legend: "Legend", metricLabel: "Tokens used", clickHint: "Click to drill down" },
    });
    expect(getByText("Legend")).toBeDefined();
    expect(getByText("Tokens used")).toBeDefined();
    expect(getByText("Click to drill down")).toBeDefined();
  });

  it("renders the calls metric without crashing", () => {
    const { container } = renderChart({ metric: "calls" });
    expect(container.querySelectorAll("rect.insights-chart-bar")).toHaveLength(SAMPLE.length);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";

import { ProviderHealthBanner } from "./providerHealthBanner";
import type { ProviderHealthResult } from "./tauri/cli";

const reasonLabel = (r: ProviderHealthResult): string => r.reason;

const RESULTS: ProviderHealthResult[] = [
  { providerName: "openai", ok: true, reason: "ok", latencyMs: 120 },
  { providerName: "anthropic", ok: false, reason: "missing-api-key" },
];

function renderBanner(props: Partial<React.ComponentProps<typeof ProviderHealthBanner>> = {}) {
  return render(
    <ProviderHealthBanner
      results={RESULTS}
      emptyLabel="No providers"
      failLabel="Unreachable"
      reasonLabel={reasonLabel}
      closeLabel="Close"
      onClose={() => {}}
      {...props}
    />,
  );
}

describe("ProviderHealthBanner", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("lists one item per provider result", () => {
    const { container } = renderBanner();
    expect(container.querySelectorAll(".providers-health-item")).toHaveLength(RESULTS.length);
  });

  it("applies ok / fail classes by result status", () => {
    const { container } = renderBanner();
    expect(container.querySelectorAll(".providers-health-item.ok")).toHaveLength(1);
    expect(container.querySelectorAll(".providers-health-item.fail")).toHaveLength(1);
  });

  it("prefixes failed providers with the fail label", () => {
    const { getByText } = renderBanner();
    expect(getByText("Unreachable · missing-api-key")).toBeDefined();
  });

  it("renders the empty label when there are no results", () => {
    const { getByText, container } = renderBanner({ results: [] });
    expect(getByText("No providers")).toBeDefined();
    expect(container.querySelector(".providers-health-list")).toBeNull();
  });

  it("calls onClose when the close button is clicked", () => {
    const onClose = vi.fn();
    const { getByLabelText } = renderBanner({ onClose });
    fireEvent.click(getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("auto-closes after the configured timeout", () => {
    const onClose = vi.fn();
    renderBanner({ onClose, autoCloseMs: 5000 });
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5000);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("uses the default 8s timeout when autoCloseMs is omitted", () => {
    const onClose = vi.fn();
    renderBanner({ onClose });
    vi.advanceTimersByTime(7999);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

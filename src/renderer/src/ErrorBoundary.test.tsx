import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ErrorBoundary } from "./ErrorBoundary";

function ThrowingComponent({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test error");
  }
  return <div>Child rendered</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Child rendered")).toBeDefined();
  });

  it("renders error UI when child throws", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary locale="en-US">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Test error")).toBeDefined();
    consoleSpy.mockRestore();
  });

  it("calls onError callback when child throws", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledOnce();
    consoleSpy.mockRestore();
  });

  it("renders fallback when provided", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );
    expect(screen.getByText("Custom fallback")).toBeDefined();
    consoleSpy.mockRestore();
  });

  it("retry button clears error state", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const user = userEvent.setup();

    const { rerender } = render(
      <ErrorBoundary locale="en-US">
        <ThrowingComponent shouldThrow={true} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Test error")).toBeDefined();

    const retryButton = screen.getByText("Try again");
    await user.click(retryButton);

    rerender(
      <ErrorBoundary locale="en-US">
        <ThrowingComponent shouldThrow={false} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Child rendered")).toBeDefined();
    consoleSpy.mockRestore();
  });
});

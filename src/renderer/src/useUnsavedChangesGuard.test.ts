import { act, renderHook } from "@testing-library/react";
import { createFallbackState } from "./tabComponents";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

describe("useUnsavedChangesGuard", () => {
  it("blocks duplicate actions while the confirmation is pending", async () => {
    const savedState = createFallbackState();
    const state = structuredClone(savedState);
    state.mainConfig.providers["provider-a"] = {
      type: "kimi",
      base_url: "https://example.com",
      api_key: "secret",
    };
    let resolveConfirm: ((confirmed: boolean) => void) | undefined;
    const requestConfirm = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveConfirm = resolve;
        }),
    );
    const persistState = vi.fn(async () => undefined);
    const restoreSavedState = vi.fn();
    const firstAction = vi.fn();
    const secondAction = vi.fn();

    const { result } = renderHook(() =>
      useUnsavedChangesGuard({
        state,
        savedState,
        locale: "en-US",
        requestConfirm,
        persistState,
        restoreSavedState,
      }),
    );

    act(() => {
      result.current.runAfterUnsavedHandled(firstAction);
      result.current.runAfterUnsavedHandled(secondAction);
    });

    expect(requestConfirm).toHaveBeenCalledOnce();
    expect(firstAction).not.toHaveBeenCalled();
    expect(secondAction).not.toHaveBeenCalled();

    await act(async () => {
      resolveConfirm?.(true);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(persistState).toHaveBeenCalledOnce();
    expect(firstAction).toHaveBeenCalledOnce();
    expect(secondAction).not.toHaveBeenCalled();
  });
});
